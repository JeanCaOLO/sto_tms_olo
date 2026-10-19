"""HandoffPedidosOMS — adaptador de ESCRITURA del handoff (esqueleto, contrato v4).

Contrato (US9, D6 — DOS ESCRITURAS, DOS PROPÓSITOS):
  Escritura 1 (Aurora, `public.orders`): UPDATE del pedido con prioridad, score,
    wms_situation='GENE', estado del handoff, corrida y `oms_processed_at = now()`.
    Es la superficie de handoff que LEE Planificación (no el WMS). El pedido ya está
    en orders (lo ingirió la carga desde EFLOW y es lo que muestra la Cola) y se
    ubica por su llave EFLOW (uq_order_eflow_key, sql/43). `oms_processed_at` saca el
    pedido de la cola de polling (ver cola_candidatos): es el marcador de "ya
    procesado por el OMS". Si no está, es un error: no se priorizan pedidos no
    ingeridos.
  Escritura 2 (situación del WMS): TPEXSI='GENE' + PRIORIDAD para que el WMS/EFLOW
    dispare el picking. TPEXES PERMANECE 'DISP'. GENE lo pone SOLO el OMS.

eFlow real es READ-ONLY: el OMS NUNCA escribe directo a eFlow. La escritura 2 va
DETRÁS DE UNA INTERFACE/COSTURA (`EscritorSituacion`): hoy el destino es la tabla
`sim_expedicionescabecera` (Aurora, temporal, `SimExpedicionesWriter`); mañana se
intercambia por el endpoint que proveerá EPRAC (`EpracEndpointWriter`) SIN tocar el
motor. NO se escribe numero_viaje en el handoff.

Orden: escritura 1 ANTES de escritura 2. SIN 2PC (no hay transacción distribuida).
Consistencia por: orden fijo + idempotencia por llave EFLOW + reintento +
`orders.handoff_status='disparo_pendiente'` tras la escritura 1, que pasa a
'completado' tras confirmar la escritura 2. Un barrido posterior reconcilia los
que quedaron en 'disparo_pendiente'.
  ponytail: sin 2PC + reintento idempotente es una simplificación deliberada con
  techo conocido — bajo fallo entre escritura 1 y 2 queda un 'disparo_pendiente'
  que un barrido reconcilia; no hay garantía transaccional distribuida. Upgrade
  path: patrón outbox/transactional cuando el volumen lo exija.

Idempotencia: la llave EFLOW compuesta (IDALMACEN, IDCOMPANIA, IDSUCURSAL,
IDEXPEDICION) es la clave; la escritura 1 es un UPDATE por esa llave (re-correr no
duplica) y la escritura 2 es un UPSERT por esa misma llave.

TODO(EPRAC): reemplazar SimExpedicionesWriter por EpracEndpointWriter (llamada al
endpoint real de EPRAC) cuando exista. La costura ya aísla ese cambio del motor.
"""

from __future__ import annotations

import os
from typing import Protocol

from models import ConfiguracionReglas, PedidoCandidato, PedidoPK, RegistroPrioridad

# Escritura 1 (Aurora, public.orders): UPDATE por la llave EFLOW -> idempotente.
# status NO se toca: es el estado del TMS. oms_processed_at = now() saca el pedido de
# la cola de polling. RETURNING para detectar pedidos no ingeridos.
ACTUALIZAR_PEDIDO_SQL = """
UPDATE orders
SET priority = %s, oms_score = %s, wms_situation = %s, handoff_status = %s,
    prioritization_run_id = %s, oms_processed_at = now(), updated_at = now()
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

ESTADO_PENDIENTE = "disparo_pendiente"
ESTADO_COMPLETADO = "completado"
# Código de situación "generada" en el WMS (EFLOW TPEXSI); es lo que lee Planificación.
SITUACION_GENERADA = "GENE"


class PedidoNoIngerido(Exception):
    """El pedido priorizado no existe en orders (no se cargó desde EFLOW)."""


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


def ejecutar(
    pedido: PedidoCandidato,
    registro: RegistroPrioridad,
    config: ConfiguracionReglas,
    corrida: str,
    *,
    escritor: EscritorSituacion | None = None,
) -> str:
    """Ejecuta las dos escrituras del handoff para UN pedido. Devuelve el estado final.

    Entradas:
      - pedido: el candidato original (para la llave EFLOW).
      - registro: resultado del motor (prioridad numérica).
      - config: ConfiguracionReglas (reservado para parámetros por scope).
      - corrida: id de la corrida de priorización (trazabilidad).
      - escritor: costura de la escritura 2 (inyectable para tests). Default:
        SimExpedicionesWriter (sim_expedicionescabecera). Mañana: EpracEndpointWriter.
    Salida:
      - 'completado' si ambas escrituras ok; 'disparo_pendiente' si la 1 ok pero la
        2 falló (reconciliable). La escritura 1 es idempotente por la llave EFLOW.
    Errores: la escritura 1 propaga HttpError (vía pg) si Aurora falla ANTES de
      marcar, y PedidoNoIngerido si el pedido no está en orders; una vez persistido
      como pendiente, un fallo en la escritura 2 NO lanza: deja 'disparo_pendiente'
      para reconciliar.
    """
    escritor = escritor or _escritor_por_defecto()

    # --- Escritura 1: public.orders (Aurora). Idempotente por la llave EFLOW. ---
    _escribir_pedido_oms(pedido, registro, corrida, estado=ESTADO_PENDIENTE)

    # --- Escritura 2: fijar la situación del WMS vía la costura. Sin 2PC. ---
    try:
        escritor.marcar_generada(pedido.pk, registro.prioridad)
    except Exception:  # noqa: BLE001 — no romper: queda pendiente para reconciliar
        return ESTADO_PENDIENTE

    # Confirmar: el pedido pasa a handoff_status='completado'.
    _escribir_pedido_oms(pedido, registro, corrida, estado=ESTADO_COMPLETADO)
    return ESTADO_COMPLETADO


def _escribir_pedido_oms(pedido: PedidoCandidato, registro: RegistroPrioridad, corrida: str, *, estado: str) -> None:
    params = [
        registro.prioridad, registro.score, SITUACION_GENERADA, estado, corrida,
        pedido.id_almacen, pedido.id_compania, pedido.id_sucursal, pedido.id_expedicion,
    ]
    if _modo_live():
        from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests
        if not pg.query(ACTUALIZAR_PEDIDO_SQL, params):
            raise PedidoNoIngerido(
                f"Pedido {pedido.id_almacen}/{pedido.id_compania}/{pedido.id_sucursal}/{pedido.id_expedicion} "
                "no está en orders: hay que cargarlo desde EFLOW antes de priorizarlo."
            )
    # En mock no hay DB: la escritura es un no-op observable vía el estado devuelto.
