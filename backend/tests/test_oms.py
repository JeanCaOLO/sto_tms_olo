"""Tests del esqueleto del motor de reglas del OMS (intent 260826-modulo-oms).

Testing Posture del proyecto: el cálculo de prioridad (score) es un submódulo
PURO y se prueba sin I/O. Estos tests cargan el stack `oms` vía conftest y no
tocan DB ni red (OMS_SOURCE=mock por default). pytest, un archivo por módulo.
"""

from datetime import date, datetime, timezone

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

def _pedido(models, *, fecha, obs=None, exp=1):
    return models.PedidoCandidato(
        id_almacen=1, id_compania=10, id_sucursal=1, id_expedicion=exp,
        fecha_expedicion_planificada=fecha, observaciones=obs,
    )


def test_regla_fecha_urgente_cuando_objetivo_ya_llego():
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={}, duracion_ruta_dias=1)
    # Entrega mañana, duración 1 día => objetivo = hoy => urgente.
    hoy = date(2026, 10, 1)
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc))
    r = regla_fecha.evaluar(pedido, config, hoy)
    assert r.puntos == regla_fecha.PUNTOS_URGENTE


def test_regla_fecha_menos_puntos_con_mas_margen():
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={}, duracion_ruta_dias=1)
    hoy = date(2026, 10, 1)
    cercano = regla_fecha.evaluar(_pedido(models, fecha=datetime(2026, 10, 3, tzinfo=timezone.utc)), config, hoy)
    lejano = regla_fecha.evaluar(_pedido(models, fecha=datetime(2026, 10, 9, tzinfo=timezone.utc)), config, hoy)
    assert cercano.puntos > lejano.puntos


def test_regla_fecha_fallback_por_centinela_no_por_null():
    regla_fecha = load_stack_module("oms", "regla_fecha")
    models = load_stack_module("oms", "models")
    config = models.ConfiguracionReglas(pesos={}, duracion_ruta_dias=1)
    hoy = date(2026, 10, 1)
    centinela = datetime(1900, 1, 1, tzinfo=timezone.utc)
    r = regla_fecha.evaluar(_pedido(models, fecha=centinela), config, hoy)
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


# --- HandoffPedidosOMS (flag PRIORIDAD-al-WMS, estado) ------------------------

def test_handoff_flag_prioridad_al_wms_elige_sql_con_prioridad():
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    pk = models.PedidoPK(1, 10, 1, 1001)
    # Flag ON -> SQL con PRIORIDAD; flag OFF -> SQL sin PRIORIDAD. En mock no toca DB,
    # así que validamos que la rama se ejecuta sin lanzar (no-op observable).
    on = models.ConfiguracionReglas(pesos={}, escribir_prioridad_al_wms=True)
    off = models.ConfiguracionReglas(pesos={}, escribir_prioridad_al_wms=False)
    handoff._marcar_wms(pk, 3, on)   # no debe lanzar en mock
    handoff._marcar_wms(pk, 3, off)  # no debe lanzar en mock


def test_handoff_ejecutar_completa_en_mock():
    handoff = load_stack_module("oms", "handoff_pedidos")
    models = load_stack_module("oms", "models")
    pedido = _pedido(models, fecha=datetime(2026, 10, 2, tzinfo=timezone.utc), exp=1001)
    registro = models.RegistroPrioridad(pk=pedido.pk, prioridad=1, score=100.0, cliente_retira=False)
    config = models.ConfiguracionReglas(pesos={})
    estado = handoff.ejecutar(pedido, registro, config, "corrida-test")
    assert estado == handoff.ESTADO_COMPLETADO


# --- MotorReglasOMS (orquestación) + corrida de punta a punta -----------------

def test_motor_prioriza_cliente_retira_por_encima():
    motor = load_stack_module("oms", "motor_reglas")
    cola = load_stack_module("oms", "cola_candidatos")
    pedidos = cola.candidatos()
    registros = motor.priorizar(pedidos, motor.config_por_defecto, hoy=date(2026, 10, 1))
    por_pk = {(r.pk.id_expedicion): r for r in registros}
    # El pedido 1004 trae "el cliente retira" => prioridad máxima (1).
    assert por_pk[1004].cliente_retira is True
    assert por_pk[1004].prioridad == 1


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
