"""Tests del esqueleto del motor de reglas del OMS (intent 260826-modulo-oms).

Testing Posture del proyecto: el cálculo de prioridad (score) es un submódulo
PURO y se prueba sin I/O. Estos tests cargan el stack `oms` vía conftest y no
tocan DB ni red (OMS_SOURCE=mock por default). pytest, un archivo por módulo.
"""

from datetime import date, datetime, timezone

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions


# --- Submódulo puro de score (el corazón testeable) ---------------------------

def test_score_ponderado_suma_por_peso_de_cada_regla():
    score = load_stack_module("oms", "score")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={"fecha_t1": 2.0, "observaciones": 0.5})
    resultados = [
        models.ResultadoRegla(regla="fecha_t1", puntos=10.0),
        models.ResultadoRegla(regla="observaciones", puntos=4.0),
    ]
    # 2.0*10 + 0.5*4 = 22
    assert score.score_ponderado(resultados, config) == 22.0


def test_score_ponderado_ignora_regla_sin_peso_configurado():
    score = load_stack_module("oms", "score")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={"fecha_t1": 1.0})  # 'observaciones' sin peso
    resultados = [
        models.ResultadoRegla(regla="fecha_t1", puntos=5.0),
        models.ResultadoRegla(regla="observaciones", puntos=99.0),
    ]
    assert score.score_ponderado(resultados, config) == 5.0


def test_score_a_prioridad_mas_score_da_menor_numero():
    score = load_stack_module("oms", "score")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    p_bajo = score.score_a_prioridad(0.0, cliente_retira=False, config=config)
    p_alto = score.score_a_prioridad(50.0, cliente_retira=False, config=config)
    # Numérica invertida: más score => prioridad menor (más urgente).
    assert p_alto < p_bajo
    assert p_bajo == score.PRIORIDAD_BASE


def test_score_a_prioridad_se_acota_al_minimo():
    score = load_stack_module("oms", "score")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    # Score enorme no baja de PRIORIDAD_MINIMA (1).
    assert score.score_a_prioridad(10_000.0, cliente_retira=False, config=config) == score.PRIORIDAD_MINIMA


def test_score_a_prioridad_cliente_retira_cortocircuita_a_maxima():
    score = load_stack_module("oms", "score")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={}, prioridad_cliente_retira=1)
    assert score.score_a_prioridad(0.0, cliente_retira=True, config=config) == 1


# --- ReglaFecha (T-1, fallback por centinela) ---------------------------------

def _pedido(models, *, fecha, obs=None, exp="1", lead_time_days=None,
            numero_viaje=None, planning_run_id="plan-1"):
    return models.PedidoCandidato(
        id_almacen="0001", id_compania="0109", id_sucursal="0001", id_expedicion=exp,
        fecha_expedicion_planificada=fecha, observaciones=obs,
        lead_time_days=lead_time_days, numero_viaje=numero_viaje,
        planning_run_id=planning_run_id,
    )


def test_regla_fecha_urgente_cuando_objetivo_ya_llego():
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    # Entrega mañana, lead_time 1 día => objetivo = hoy => urgente.
    hoy = date(2026, 10, 1)
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), lead_time_days=1)
    r = regla_fecha.evaluar(pedido, config, hoy)
    assert r.puntos == regla_fecha.PUNTOS_URGENTE


def test_regla_fecha_menos_puntos_con_mas_margen():
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    hoy = date(2026, 10, 1)
    cercano = regla_fecha.evaluar(
        _pedido(models, fecha=datetime(2026, 10, 3, tzinfo=timezone.utc), lead_time_days=1), config, hoy)
    lejano = regla_fecha.evaluar(
        _pedido(models, fecha=datetime(2026, 10, 9, tzinfo=timezone.utc), lead_time_days=1), config, hoy)
    assert cercano.puntos > lejano.puntos


def test_regla_fecha_lead_time_dinamico_del_pedido():
    """El lead_time es por pedido (dinámico), no un parámetro de config: a mayor
    lead_time, objetivo más temprano => más urgente para la misma fecha de entrega."""
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    hoy = date(2026, 10, 1)
    entrega = datetime(2026, 10, 6, tzinfo=timezone.utc)
    corto = regla_fecha.evaluar(_pedido(models, fecha=entrega, lead_time_days=1), config, hoy)   # objetivo 10-05
    largo = regla_fecha.evaluar(_pedido(models, fecha=entrega, lead_time_days=3), config, hoy)   # objetivo 10-03
    assert largo.puntos > corto.puntos


def test_regla_fecha_lead_time_null_usa_default():
    """lead_time_days NULL => aplica LEAD_TIME_DEFAULT_DIAS (1 día, Cofersa)."""
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    hoy = date(2026, 10, 1)
    entrega = datetime(2026, 10, 2, tzinfo=timezone.utc)
    con_null = regla_fecha.evaluar(_pedido(models, fecha=entrega, lead_time_days=None), config, hoy)
    con_default = regla_fecha.evaluar(
        _pedido(models, fecha=entrega, lead_time_days=models.LEAD_TIME_DEFAULT_DIAS), config, hoy)
    assert con_null.puntos == con_default.puntos == regla_fecha.PUNTOS_URGENTE


def test_regla_fecha_fallback_por_centinela_no_por_null():
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={})
    hoy = date(2026, 10, 1)
    centinela = datetime(1900, 1, 1, tzinfo=timezone.utc)
    r = regla_fecha.evaluar(_pedido(models, fecha=centinela, lead_time_days=1), config, hoy)
    assert r.puntos == regla_fecha.PUNTOS_FALLBACK
    assert "centinela" in r.detalle.lower()


# --- AnalizadorObservaciones (stub cliente retira + degradación) --------------

def test_observaciones_detecta_cliente_retira_con_stub():
    obs = load_stack_module("oms", "analizador_observaciones")
    models = load_stack_module("oms", "models")
    pedido = _pedido(models, fecha=datetime(2026, 10, 5, tzinfo=timezone.utc), obs="El cliente retira en bodega")
    r = obs.evaluar(pedido)
    assert r.cliente_retira is True
    assert r.puntos == obs.PUNTOS_CLIENTE_RETIRA


def test_observaciones_sin_texto_es_neutro():
    obs = load_stack_module("oms", "analizador_observaciones")
    models = load_stack_module("oms", "models")
    pedido = _pedido(models, fecha=datetime(2026, 10, 5, tzinfo=timezone.utc), obs="")
    r = obs.evaluar(pedido)
    assert r.cliente_retira is False
    assert r.puntos == 0.0


def test_observaciones_degrada_sin_bloquear_si_clasificador_falla():
    obs = load_stack_module("oms", "analizador_observaciones")
    models = load_stack_module("oms", "models")

    def clasificador_roto(_texto):
        raise RuntimeError("Bedrock caído")

    pedido = _pedido(models, fecha=datetime(2026, 10, 5, tzinfo=timezone.utc), obs="algo")
    r = obs.evaluar(pedido, clasificador_roto)
    assert r.cliente_retira is False
    assert r.puntos == 0.0  # no rompe la corrida


# --- ColaCandidatos (polling de columna sobre public.orders, v4) --------------

def test_cola_live_filtra_por_planning_run_id_y_oms_processed_at(monkeypatch):
    cola = load_stack_module("oms", "cola_candidatos")
    from tms_common import pg

    llamadas = []

    def fake_query(sql, params=()):
        llamadas.append((sql, list(params)))
        return [{
            "eflow_id_almacen": "0001", "eflow_id_compania": "0109",
            "eflow_id_sucursal": "0001", "eflow_id_expedicion": "P0002002260922",
            "delivery_date": datetime(2026, 10, 2, tzinfo=timezone.utc),
            "lead_time_days": 2, "numero_viaje": "20261002-001",
            "planning_run_id": "plan-1", "oms_processed_at": None,
            "observaciones": "obs", "delivery_zone": "GAM", "customer_type": "MAYOREO",
            "total_weight": 10.0, "total_volume": 1.0,
            "warehouse_id": "w1", "customer_id": "cofersa",
        }]

    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", fake_query)

    pedidos = cola.candidatos(limite=50)
    sql, params = llamadas[0]
    # Filtro de polling v4: la columna es la única fuente de verdad de activación.
    assert "planning_run_id IS NOT NULL" in sql
    assert "oms_processed_at IS NULL" in sql
    # Lee de public.orders, no de EXPEDICIONESCABECERA; sin wms_trip_number / NUMEROVIAJEWMH.
    assert "FROM orders" in sql
    assert "EXPEDICIONESCABECERA" not in sql and "wms_trip_number" not in sql and "NUMEROVIAJEWMH" not in sql
    assert params == [50]
    assert len(pedidos) == 1
    assert pedidos[0].numero_viaje == "20261002-001"
    assert pedidos[0].lead_time_days == 2
    assert pedidos[0].pk.id_expedicion == "P0002002260922"


def test_cola_mock_refleja_el_modelo_v4():
    cola = load_stack_module("oms", "cola_candidatos")
    pedidos = cola.candidatos()
    # Todos ya corridos por Planificación (planning_run_id) y sin procesar por el OMS.
    assert all(p.planning_run_id is not None for p in pedidos)
    assert all(p.oms_processed_at is None for p in pedidos)
    # lead_time dinámico: al menos uno NULL (default) y otros con valor.
    assert any(p.lead_time_days is None for p in pedidos)
    assert any(p.lead_time_days is not None for p in pedidos)


# --- HandoffPedidosOMS ADR-013: priorizar (deja DISP) vs. liberar (GENE + costura) ---

def test_priorizar_live_deja_disp_y_no_estampa_oms_processed_at(monkeypatch):
    """(a) Priorizar hace UPDATE orders SIN 'GENE' ni oms_processed_at y NO usa la costura."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    llamadas = []
    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): llamadas.append((sql, list(params))) or [{"id": "o-1"}])
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="P0002002260922")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=2, score=80.0, cliente_retira=False)

    handoff.priorizar_pedido(pedido, registro, "corrida-1")

    # Una sola escritura (no hay costura en priorizar) a orders por la llave EFLOW.
    assert len(llamadas) == 1
    sql, params = llamadas[0]
    assert "UPDATE orders" in sql and "eflow_id_expedicion" in sql
    # Priorizar NO libera: no estampa oms_processed_at ni pone 'GENE'.
    assert "oms_processed_at" not in sql
    assert "wms_situation" not in sql
    assert params == [2, 80.0, handoff.ESTADO_PRIORIZADO, "corrida-1",
                      "0001", "0109", "0001", "P0002002260922"]
    # Nunca a eFlow real ni a la costura (sim_expedicionescabecera).
    assert not any("sim_expedicionescabecera" in c[0] for c in llamadas)
    assert not any("EXPEDICIONESCABECERA" in c[0] for c in llamadas)


def test_priorizar_live_falla_si_el_pedido_no_esta_en_orders(monkeypatch):
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): [])
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="NO-EXISTE")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)

    with pytest.raises(handoff.PedidoNoIngerido):
        handoff.priorizar_pedido(pedido, registro, "corrida-1")


def test_liberar_escritura2_va_por_la_costura_y_no_toca_eflow():
    """La liberación fija 'GENE' + PRIORIDAD por EscritorSituacion, nunca eFlow real."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")

    marcados = []

    class EscritorFake:
        def marcar_generada(self, pk, prioridad):
            marcados.append((pk, prioridad))

    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="1001")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=3, score=70.0, cliente_retira=False)
    estado = handoff.liberar_pedido(pedido, registro, escritor=EscritorFake())
    assert estado == handoff.ESTADO_COMPLETADO
    assert marcados == [(pedido.pk, 3)]


def test_liberar_completa_en_mock():
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="1001")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)
    estado = handoff.liberar_pedido(pedido, registro)
    assert estado == handoff.ESTADO_COMPLETADO


def test_liberar_live_escribe_gene_y_estampa_oms_processed_at(monkeypatch):
    """(b) Liberar: UPDATE orders con 'GENE' + oms_processed_at=now() y pasa por la costura."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    llamadas = []
    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): llamadas.append((sql, list(params))) or [{"id": "o-1"}])
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="P0002002260922")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=2, score=80.0, cliente_retira=False)

    estado = handoff.liberar_pedido(pedido, registro)

    assert estado == handoff.ESTADO_COMPLETADO
    sql, params = llamadas[0]
    # Escritura 1: UPDATE orders con 'GENE' + oms_processed_at = now() (= LIBERADO).
    assert "UPDATE orders" in sql and "eflow_id_expedicion" in sql
    assert "oms_processed_at = now()" in sql
    assert params == ["GENE", handoff.ESTADO_PENDIENTE, "0001", "0109", "0001", "P0002002260922"]
    # Escritura 2 fue a la costura (sim_expedicionescabecera), nunca a eFlow real.
    assert any("sim_expedicionescabecera" in c[0] for c in llamadas)
    assert not any("EXPEDICIONESCABECERA" in c[0] for c in llamadas)


def test_sim_writer_escribe_a_sim_expedicionescabecera_en_live(monkeypatch):
    """El writer por defecto (hoy) escribe a sim_expedicionescabecera, NO a eFlow real."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    llamadas = []
    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): llamadas.append((sql, list(params))) or [])
    pk = models.PedidoPK("0001", "0109", "0001", "1001")
    handoff.SimExpedicionesWriter().marcar_generada(pk, 2)

    sql, params = llamadas[0]
    assert "sim_expedicionescabecera" in sql and "'GENE'" in sql
    assert "EXPEDICIONESCABECERA" not in sql  # nunca eFlow real
    assert params == ["0001", "0109", "0001", "1001", 2]


def test_liberar_queda_pendiente_si_falla_la_escritura_2():
    """(c) Si la escritura 2 (costura) falla, el pedido queda 'disparo_pendiente'."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")

    class EscritorRoto:
        def marcar_generada(self, pk, prioridad):
            raise RuntimeError("endpoint caído")

    # En mock la escritura 1 no toca DB; el estado pendiente viene de la costura rota.
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="1001")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)
    estado = handoff.liberar_pedido(pedido, registro, escritor=EscritorRoto())
    assert estado == handoff.ESTADO_PENDIENTE


def test_liberar_live_falla_si_el_pedido_no_esta_en_orders(monkeypatch):
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): [])
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="NO-EXISTE")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)

    with pytest.raises(handoff.PedidoNoIngerido):
        handoff.liberar_pedido(pedido, registro)


# --- (f) Ventana de liberación (predicado puro) — falla si se rompe el predicado ---

def test_en_ventana_borde_dia_de_liberacion_es_true():
    handoff = load_stack_module("oms", "handoff_pedidos")
    dispatch = date(2026, 10, 8)
    # hoy == dispatch_date − dias_prep_picking (1) => día exacto de liberación => True.
    assert handoff.en_ventana_liberacion(dispatch, date(2026, 10, 7), 1) is True


def test_en_ventana_un_dia_antes_es_false():
    handoff = load_stack_module("oms", "handoff_pedidos")
    dispatch = date(2026, 10, 8)
    # Un día antes de la apertura (10-06 < 10-07) => NO libera. Falla si se usa '>' o
    # se invierte el signo de dias_prep_picking.
    assert handoff.en_ventana_liberacion(dispatch, date(2026, 10, 6), 1) is False


def test_en_ventana_despues_del_dia_sigue_true():
    handoff = load_stack_module("oms", "handoff_pedidos")
    dispatch = date(2026, 10, 8)
    assert handoff.en_ventana_liberacion(dispatch, date(2026, 10, 9), 1) is True


def test_en_ventana_dispatch_null_es_false():
    handoff = load_stack_module("oms", "handoff_pedidos")
    assert handoff.en_ventana_liberacion(None, date(2026, 10, 9), 1) is False


def test_en_ventana_acepta_datetime_como_dispatch():
    handoff = load_stack_module("oms", "handoff_pedidos")
    dispatch = datetime(2026, 10, 8, 0, 0, tzinfo=timezone.utc)
    assert handoff.en_ventana_liberacion(dispatch, date(2026, 10, 7), 1) is True
    assert handoff.en_ventana_liberacion(dispatch, date(2026, 10, 6), 1) is False


# --- MotorReglasOMS (orquestación) + corrida de punta a punta -----------------

def test_motor_prioriza_cliente_retira_por_encima():
    motor = load_stack_module("oms", "motor_reglas")
    cola = load_stack_module("oms", "cola_candidatos")
    pedidos = cola.candidatos()
    registros = motor.priorizar(pedidos, motor.config_por_defecto, hoy=date(2026, 10, 1))
    por_pk = {(r.pk.id_expedicion): r for r in registros}
    # El pedido 1004 trae "el cliente retira" => prioridad máxima (1).
    assert por_pk["1004"].cliente_retira is True
    assert por_pk["1004"].prioridad == 1


def test_corrida_dos_pasadas_prioriza_todo_libera_solo_ventana():
    """(e) Barrido ADR-013 en mock: prioriza los 4 y libera solo el que cruza la ventana.

    Con hoy=2026-10-01 y dias_prep_picking=1, solo el pedido 1001 (dispatch 10-02)
    cae en la ventana; 1002 (10-10) y 1004 (10-08) quedan fuera y 1003 trae
    dispatch_date NULL. Todos quedan priorizados, uno liberado.
    """
    app = load_stack_module("oms", "app")
    resumen = app.correr(hoy=date(2026, 10, 1))
    assert resumen["modo"] == "mock"
    assert resumen["total"] == 4
    assert resumen["priorizados"] == 4
    assert resumen["liberados"] == 1   # solo el pedido 1001 cruza la ventana
    assert resumen["pendientes"] == 0
    assert len(resumen["prioridades"]) == 1  # detalle = solo lo liberado


def test_corrida_libera_mas_viajes_cuando_avanza_el_dia():
    """Avanzando `hoy`, más viajes cruzan la ventana (por viaje "gratis")."""
    app = load_stack_module("oms", "app")
    # hoy=2026-10-07: abren 1001 (10-02) y 1004 (10-08, apertura 10-07). 1002 (10-10) no.
    resumen = app.correr(hoy=date(2026, 10, 7))
    assert resumen["priorizados"] == 4
    assert resumen["liberados"] == 2


def test_procesar_viaje_manual_ignora_la_ventana(monkeypatch):
    """(d) Acción manual: libera los pedidos de un numero_viaje ignorando la ventana.

    El pedido 1002 (viaje 20261010-002, dispatch 10-10) está MUY fuera de la ventana
    respecto a hoy, pero la acción manual lo libera igual; otro viaje NO se toca.
    """
    app = load_stack_module("oms", "app")
    libres = []
    monkeypatch.setattr(app.handoff_pedidos, "liberar_pedido",
                        lambda pedido, registro, **kw: libres.append(pedido.numero_viaje) or app.handoff_pedidos.ESTADO_COMPLETADO)

    event = http_event("POST /api/v1/oms/viajes/{numero_viaje}/procesar",
                       path={"numero_viaje": "20261010-002"})
    resp = app.procesar_viaje(event)
    data = body_of(resp)["data"]
    assert data["numero_viaje"] == "20261010-002"
    assert data["total"] == 1 and data["liberados"] == 1
    # Solo se liberó el viaje pedido, ningún otro.
    assert libres == ["20261010-002"]


def test_procesar_viaje_manual_filtra_subconjunto_de_pedidos(monkeypatch):
    """El body opcional id_expediciones restringe a un subconjunto del viaje."""
    app = load_stack_module("oms", "app")
    libres = []
    monkeypatch.setattr(app.handoff_pedidos, "liberar_pedido",
                        lambda pedido, registro, **kw: libres.append(pedido.id_expedicion) or app.handoff_pedidos.ESTADO_COMPLETADO)

    # Viaje 20261002-001 (pedido 1001); pedir un id que NO está => no libera nada.
    event = http_event("POST /api/v1/oms/viajes/{numero_viaje}/procesar",
                       path={"numero_viaje": "20261002-001"},
                       body={"id_expediciones": ["9999"]})
    resp = app.procesar_viaje(event)
    assert body_of(resp)["data"]["liberados"] == 0
    assert libres == []


def test_procesar_viaje_manual_requiere_permiso(monkeypatch, caller_permissions):
    """La acción manual está gated por rol: sin permiso 'edit' en 'oms' => 403."""
    from tms_common.errors import HttpError

    app = load_stack_module("oms", "app")
    caller_permissions.set(make_permissions({"oms": ("view",)}))  # no 'edit'
    event = http_event("POST /api/v1/oms/viajes/{numero_viaje}/procesar",
                       path={"numero_viaje": "20261002-001"})
    with pytest.raises(HttpError) as exc:
        app.procesar_viaje(event)
    assert exc.value.status == 403


def test_reprioriza_idempotente_sin_duplicar_el_no_liberado():
    """(f/idempotencia) Un pedido priorizado-no-liberado se re-prioriza en otro barrido
    sin duplicar: dos corridas con el mismo `hoy` dan el mismo conteo liberado."""
    app = load_stack_module("oms", "app")
    r1 = app.correr(hoy=date(2026, 10, 1))
    r2 = app.correr(hoy=date(2026, 10, 1))
    assert r1["priorizados"] == r2["priorizados"] == 4
    assert r1["liberados"] == r2["liberados"] == 1


def test_health_route():
    app = load_stack_module("oms", "app")
    resp = app.handler(http_event("GET /api/v1/oms/health"), None)
    assert resp["statusCode"] == 200
    assert body_of(resp)["data"]["ok"] is True
