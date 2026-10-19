"""Tests del esqueleto del motor de reglas del OMS (intent 260826-modulo-oms).

Testing Posture del proyecto: el cálculo de prioridad (score) es un submódulo
PURO y se prueba sin I/O. Estos tests cargan el stack `oms` vía conftest y no
tocan DB ni red (OMS_SOURCE=mock por default). pytest, un archivo por módulo.
"""

from datetime import date, datetime, timezone

import pytest

from conftest import body_of, http_event, load_stack_module


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


# --- HandoffPedidosOMS (costura escritura 2, oms_processed_at, estado) --------

def test_handoff_escritura2_va_por_la_costura_y_no_toca_eflow(monkeypatch):
    """La escritura 2 pasa por EscritorSituacion, nunca escribe a eFlow real."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")

    marcados = []

    class EscritorFake:
        def marcar_generada(self, pk, prioridad):
            marcados.append((pk, prioridad))

    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="1001")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=3, score=70.0, cliente_retira=False)
    estado = handoff.ejecutar(pedido, registro, models.ConfiguracionReglas(pesos={}),
                              "corrida-test", escritor=EscritorFake())
    assert estado == handoff.ESTADO_COMPLETADO
    # La situación 'GENE' + PRIORIDAD se fijó por la costura, no por una escritura directa a eFlow.
    assert marcados == [(pedido.pk, 3)]


def test_handoff_sim_writer_escribe_a_sim_expedicionescabecera_en_live(monkeypatch):
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


def test_handoff_ejecutar_completa_en_mock():
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="1001")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)
    config = models.ConfiguracionReglas(pesos={})
    estado = handoff.ejecutar(pedido, registro, config, "corrida-test")
    assert estado == handoff.ESTADO_COMPLETADO


def test_handoff_live_actualiza_orders_y_estampa_oms_processed_at(monkeypatch):
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    llamadas = []
    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): llamadas.append((sql, list(params))) or [{"id": "o-1"}])
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="P0002002260922")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=2, score=80.0, cliente_retira=False)

    estado = handoff.ejecutar(pedido, registro, models.ConfiguracionReglas(pesos={}), "corrida-1")

    # Dos escrituras completan en live (sim writer también usa pg) => completado.
    assert estado == handoff.ESTADO_COMPLETADO
    sql, params = llamadas[0]
    # Escritura 1: UPDATE orders por la llave EFLOW, estampando oms_processed_at = now().
    assert "UPDATE orders" in sql and "eflow_id_expedicion" in sql
    assert "oms_processed_at = now()" in sql
    assert params == [2, 80.0, "GENE", handoff.ESTADO_PENDIENTE, "corrida-1", "0001", "0109", "0001", "P0002002260922"]
    # Escritura 2 fue a la costura (sim_expedicionescabecera), nunca a eFlow real.
    assert any("sim_expedicionescabecera" in c[0] for c in llamadas)
    assert not any("EXPEDICIONESCABECERA" in c[0] for c in llamadas)


def test_handoff_live_queda_pendiente_si_falla_la_escritura_2(monkeypatch):
    """Si la escritura 2 (costura) falla, el pedido queda 'disparo_pendiente'."""
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")

    class EscritorRoto:
        def marcar_generada(self, pk, prioridad):
            raise RuntimeError("endpoint caído")

    monkeypatch.setenv("OMS_SOURCE", "mock")  # escritura 1 no toca DB en mock
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="1001")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)
    estado = handoff.ejecutar(pedido, registro, models.ConfiguracionReglas(pesos={}),
                              "corrida-1", escritor=EscritorRoto())
    assert estado == handoff.ESTADO_PENDIENTE


def test_handoff_live_falla_si_el_pedido_no_esta_en_orders(monkeypatch):
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    from tms_common import pg

    monkeypatch.setenv("OMS_SOURCE", "live")
    monkeypatch.setattr(pg, "query", lambda sql, params=(): [])
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp="NO-EXISTE")
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)

    with pytest.raises(handoff.PedidoNoIngerido):
        handoff.ejecutar(pedido, registro, models.ConfiguracionReglas(pesos={}), "corrida-1")


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


def test_corrida_end_to_end_en_mock():
    app = load_stack_module("oms", "app")
    resumen = app.correr(hoy=date(2026, 10, 1))
    assert resumen["modo"] == "mock"
    assert resumen["total"] == 4
    assert resumen["completados"] == 4  # en mock las dos escrituras completan
    assert resumen["pendientes"] == 0
    assert len(resumen["prioridades"]) == 4


def test_health_route():
    app = load_stack_module("oms", "app")
    resp = app.handler(http_event("GET /api/v1/oms/health"), None)
    assert resp["statusCode"] == 200
    assert body_of(resp)["data"]["ok"] is True
