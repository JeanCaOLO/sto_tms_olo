"""HandoffPedidosOMS — adaptador de ESCRITURA del handoff (esqueleto, ADR-013).

ADR-013 DESACOPLA priorización y liberación en DOS PASADAS de un único barrido
sobre `public.orders` (grano pedido). Antes se priorizaba y liberaba en un paso;
ahora son dos funciones públicas separables:

  PASADA 1 — priorizar_pedido() (PrioritizadorPass):
    UPDATE de `public.orders` con priority, oms_score, prioritization_run_id y
    handoff_status='priorizado'. DEJA `wms_situation = DISP`, NO escribe 'GENE' y
    NO estampa `oms_processed_at`. Es idempotente por la llave EFLOW: el barrido la
    re-aplica en cada corrida sobre lo no liberado, absorbiendo los cambios de
    replan (nuevo dispatch_date/lead_time_days) sin duplicar. NO toca la costura.

  PASADA 2 — liberar_pedido() (LiberadorPass), DOS ESCRITURAS, DOS PROPÓSITOS:
    Escritura 1 (Aurora, `public.orders`): UPDATE con wms_situation='GENE',
      handoff_status y `oms_processed_at = now()`. `oms_processed_at` = LIBERADO a
      eFlow (ADR-013 precisa la lectura de ADR-007: NO es "priorizado"); saca el
      pedido de la cola de polling (ver cola_candidatos). El pedido ya está en
      orders (lo ingirió la carga desde EFLOW) y se ubica por su llave EFLOW
      (uq_order_eflow_key, sql/43). Si no está, es un error: no se liberan pedidos
      no ingeridos.
    Escritura 2 (situación del WMS): TPEXSI='GENE' + PRIORIDAD para que el WMS/EFLOW
      dispare el picking. TPEXES PERMANECE 'DISP'. GENE lo pone SOLO el OMS.

Quién decide liberar (NO vive aquí): la ventana `now() >= dispatch_date −
dias_prep_picking` (función pura `en_ventana_liberacion`) la evalúa el barrido
(`app.correr`) con el `dispatch_date` del pedido; se lee SOLO orders, nunca
plan_trips/routes. Como `dispatch_date` es igual para todos los pedidos de un
`numero_viaje`, la liberación por viaje sale "gratis": cruzan la ventana juntos.
La acción manual "Procesar a Eflow" reusa `liberar_pedido` filtrando por
`numero_viaje`, ignorando la ventana.

eFlow real es READ-ONLY: el OMS NUNCA escribe directo a eFlow. La escritura 2 va
DETRÁS DE UNA INTERFACE/COSTURA (`EscritorSituacion`): hoy el destino es la tabla
`sim_expedicionescabecera` (Aurora, temporal, `SimExpedicionesWriter`); mañana se
intercambia por el endpoint que proveerá EPRAC (`EpracEndpointWriter`) SIN tocar el
motor. NO se escribe numero_viaje en el handoff.

Orden (dentro de liberar): escritura 1 ANTES de escritura 2. SIN 2PC (no hay
transacción distribuida). Consistencia por: orden fijo + idempotencia por llave
EFLOW + reintento + `orders.handoff_status='disparo_pendiente'` tras la escritura 1,
que pasa a 'completado' tras confirmar la escritura 2. Un barrido posterior
reconcilia los que quedaron en 'disparo_pendiente'.
  ponytail: sin 2PC + reintento idempotente es una simplificación deliberada con
  techo conocido — bajo fallo entre escritura 1 y 2 queda un 'disparo_pendiente'
  que un barrido reconcilia; no hay garantía transaccional distribuida. Upgrade
  path: patrón outbox/transactional cuando el volumen lo exija.

Idempotencia: la llave EFLOW compuesta (IDALMACEN, IDCOMPANIA, IDSUCURSAL,
IDEXPEDICION) es la clave; las escrituras a orders son UPDATE por esa llave
(re-correr no duplica) y la escritura 2 es un UPSERT por esa misma llave.

TODO(EPRAC): reemplazar SimExpedicionesWriter por EpracEndpointWriter (llamada al
endpoint real de EPRAC) cuando exista. La costura ya aísla ese cambio del motor.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Protocol

from models import ConfiguracionReglas, PedidoCandidato, PedidoPK, RegistroPrioridad

# Pasada 1 (priorizar) — UPDATE por la llave EFLOW, idempotente. NO toca
# wms_situation (queda DISP) NI oms_processed_at: priorizar NO libera (ADR-013).
# status (del TMS) tampoco se toca. RETURNING para detectar pedidos no ingeridos.
PRIORIZAR_PEDIDO_SQL = """
UPDATE orders
SET priority = %s, oms_score = %s, handoff_status = %s,
    prioritization_run_id = %s, updated_at = now()
WHERE eflow_id_almacen = %s AND eflow_id_compania = %s
  AND eflow_id_sucursal = %s AND eflow_id_expedicion = %s
RETURNING id
"""

# Pasada 2 (liberar), escritura 1 — UPDATE por la llave EFLOW, idempotente.
# wms_situation='GENE' + oms_processed_at = now() (= LIBERADO, saca de la cola de
# polling). status NO se toca. RETURNING para detectar pedidos no ingeridos.
LIBERAR_PEDIDO_SQL = """
UPDATE orders
SET wms_situation = %s, handoff_status = %s,
    oms_processed_at = now(), updated_at = now()
WHERE eflow_id_almacen = %s AND eflow_id_compania = %s
  AND eflow_id_sucursal = %s AND eflow_id_expedicion = %s
RETURNING id
"""

# Escritura 2 (SIMULADA, temporal): sim_expedicionescabecera en Aurora. TPEXSI='GENE'
# + PRIORIDAD; TPEXES NO se toca (permanece 'DISP'). Es la costura que mañana se
# reemplaza por el endpoint EPRAC. UPSERT por la llave EFLOW (idempotente al reintentar).
SIM_SITUACION_SQL = """
INSERT INTO sim_expedicionescabecera
    (eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion,
     tpexsi, prioridad, updated_at)
VALUES (%s, %s, %s, %s, 'GENE', %s, now())
ON CONFLICT (eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion)
DO UPDATE SET tpexsi = excluded.tpexsi, prioridad = excluded.prioridad, updated_at = now()
"""

# Estado tras la pasada de priorización: ya priorizado, aún NO liberado a eFlow.
# Distingue "en cola de liberación" de los estados de la liberación (ADR-013).
ESTADO_PRIORIZADO = "priorizado"
ESTADO_PENDIENTE = "disparo_pendiente"
ESTADO_COMPLETADO = "completado"
# Código de situación "generada" en el WMS (EFLOW TPEXSI); es lo que lee Planificación.
SITUACION_GENERADA = "GENE"


class PedidoNoIngerido(Exception):
    """El pedido no existe en orders (no se cargó desde EFLOW)."""


def _modo_live() -> bool:
    return os.environ.get("OMS_SOURCE", "mock") == "live"


# --- Costura de la escritura 2 (destino intercambiable) -----------------------

class EscritorSituacion(Protocol):
    """Interface de la escritura 2: fija la situación del WMS a 'GENE' + PRIORIDAD.

    El OMS NUNCA escribe a eFlow real (read-only). Esta costura aísla el DESTINO:
    - hoy: `SimExpedicionesWriter` → tabla sim_expedicionescabecera (Aurora, temporal).
    - mañana: `EpracEndpointWriter` → endpoint que proveerá EPRAC, sin tocar el motor.
    """

    def marcar_generada(self, pk: PedidoPK, prioridad: int) -> None:
        """Deja el pedido en TPEXSI='GENE' + PRIORIDAD. Idempotente por la llave EFLOW."""
        ...


class SimExpedicionesWriter:
    """Destino ACTUAL de la escritura 2 (temporal): sim_expedicionescabecera (Aurora).

    Simula la escritura a eFlow hasta que exista el endpoint EPRAC. En mock no toca
    DB (no-op observable). NO escribe a eFlow real.
    """

    def marcar_generada(self, pk: PedidoPK, prioridad: int) -> None:
        if _modo_live():
            from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests

            pg.query(SIM_SITUACION_SQL,
                     [pk.id_almacen, pk.id_compania, pk.id_sucursal, pk.id_expedicion, prioridad])
        # En mock: no-op (la señal queda cubierta por los tests sobre el writer).


def _escritor_por_defecto() -> EscritorSituacion:
    """Escritor de escritura 2 por defecto. Hoy: sim_expedicionescabecera.

    TODO(EPRAC): devolver EpracEndpointWriter cuando el endpoint exista (p.ej.
    seleccionado por una variable de entorno de destino, resuelta por el pipeline).
    """
    return SimExpedicionesWriter()


# --- Ventana de liberación (predicado puro, ADR-013) --------------------------

def _solo_fecha(valor: date) -> date:
    """Normaliza a `date` (acepta `date` o `datetime`) para comparar días, no horas."""
    return valor.date() if hasattr(valor, "date") else valor


def en_ventana_liberacion(dispatch_date, hoy: date, dias_prep_picking: int) -> bool:
    """¿El pedido entra en la ventana de liberación? `now() >= dispatch_date − dias_prep`.

    PURA respecto al reloj (`hoy` inyectado), para probarla sin DB. `dispatch_date`
    es igual para todos los pedidos de un `numero_viaje` (lo estampa Planificación),
    así que la liberación por viaje sale "gratis": cruzan la ventana juntos.
    `dispatch_date` NULL (pedido sin plan) => False: no se libera.
    """
    if dispatch_date is None:
        return False
    apertura = _solo_fecha(dispatch_date) - timedelta(days=dias_prep_picking)
    return _solo_fecha(hoy) >= apertura


# --- Pasada 1: priorizar (deja DISP, NO libera) -------------------------------

def priorizar_pedido(
    pedido: PedidoCandidato,
    registro: RegistroPrioridad,
    corrida: str,
    *,
    estado: str = ESTADO_PRIORIZADO,
) -> None:
    """Pasada de PRIORIZACIÓN (ADR-013): UPDATE de prioridad/score/corrida en orders.

    DEJA `wms_situation = DISP` (no escribe 'GENE'), NO estampa `oms_processed_at` y
    NO llama a la costura: priorizar no libera. Idempotente por la llave EFLOW:
    re-correr el barrido re-prioriza lo no liberado sin duplicar, absorbiendo los
    cambios de replan (nuevo dispatch_date/lead_time_days).

    Entradas: el candidato (llave EFLOW), el resultado del motor (prioridad/score) y
    el id de corrida (prioritization_run_id, trazabilidad).
    Errores: propaga HttpError (vía pg) si Aurora falla y PedidoNoIngerido si el
      pedido no está en orders. En mock es un no-op observable.
    """
    params = [
        registro.prioridad, registro.score, estado, corrida,
        pedido.id_almacen, pedido.id_compania, pedido.id_sucursal, pedido.id_expedicion,
    ]
    _update_orders(PRIORIZAR_PEDIDO_SQL, params, pedido)


# --- Pasada 2: liberar (GENE + oms_processed_at + costura) ---------------------

def liberar_pedido(
    pedido: PedidoCandidato,
    registro: RegistroPrioridad,
    *,
    escritor: EscritorSituacion | None = None,
) -> str:
    """Pasada de LIBERACIÓN (ADR-013): las dos escrituras del handoff a eFlow.

    Escritura 1 (orders): wms_situation='GENE' + `oms_processed_at = now()` (=
    LIBERADO, saca el pedido de la cola). Escritura 2: fija la situación del WMS por
    la costura `EscritorSituacion` (hoy sim_expedicionescabecera). Orden fijo 1→2,
    sin 2PC; si la 2 falla, deja 'disparo_pendiente' para reconciliar (no lanza).

    ponytail: OQ-REL1 (abierta, no bloquea v1, sin reconciliación aquí) — un pedido
    ya liberado (oms_processed_at sellado) que un replan mueva a otro viaje/fecha
    queda potencialmente stale; `oms_processed_at` NO se limpia automáticamente.
    Upgrade path: reconciliación cuando el negocio lo pida.

    Entradas: el candidato (llave EFLOW), el resultado del motor (prioridad para la
    costura) y la costura de la escritura 2 (inyectable para tests; default
    SimExpedicionesWriter → sim_expedicionescabecera; mañana EpracEndpointWriter).
    Salida: 'completado' si ambas ok; 'disparo_pendiente' si la 1 ok pero la 2 falló.
    Errores: la escritura 1 propaga HttpError (vía pg) y PedidoNoIngerido si el
      pedido no está en orders; un fallo en la escritura 2 NO lanza.
    """
    escritor = escritor or _escritor_por_defecto()

    # --- Escritura 1: public.orders (Aurora). Idempotente por la llave EFLOW. ---
    _liberar_orders(pedido, ESTADO_PENDIENTE)

    # --- Escritura 2: fijar la situación del WMS vía la costura. Sin 2PC. ---
    try:
        escritor.marcar_generada(pedido.pk, registro.prioridad)
    except Exception:  # noqa: BLE001 — no romper: queda pendiente para reconciliar
        return ESTADO_PENDIENTE

    # Confirmar: el pedido pasa a handoff_status='completado'.
    _liberar_orders(pedido, ESTADO_COMPLETADO)
    return ESTADO_COMPLETADO


def _liberar_orders(pedido: PedidoCandidato, estado: str) -> None:
    params = [
        SITUACION_GENERADA, estado,
        pedido.id_almacen, pedido.id_compania, pedido.id_sucursal, pedido.id_expedicion,
    ]
    _update_orders(LIBERAR_PEDIDO_SQL, params, pedido)


def _update_orders(sql: str, params: list, pedido: PedidoCandidato) -> None:
    """UPDATE de orders por la llave EFLOW. En live exige RETURNING no vacío.

    En mock no hay DB: la escritura es un no-op observable (el estado se infiere del
    valor devuelto por la función llamadora). Centraliza el chequeo PedidoNoIngerido
    de las dos pasadas.
    """
    if _modo_live():
        from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests
        if not pg.query(sql, params):
            raise PedidoNoIngerido(
                f"Pedido {pedido.id_almacen}/{pedido.id_compania}/{pedido.id_sucursal}/{pedido.id_expedicion} "
                "no está en orders: hay que cargarlo desde EFLOW antes de procesarlo."
            )
