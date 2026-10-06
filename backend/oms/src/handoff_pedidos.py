"""HandoffPedidosOMS — adaptador de ESCRITURA del handoff (esqueleto).

Contrato (US9, D6 — DOS ESCRITURAS, DOS PROPÓSITOS):
  Escritura 1 (Aurora, tabla PROPIA del OMS `oms.pedidos`): persiste el pedido con
    prioridad + status + situacion='generada'. Es la superficie de handoff que
    LEE Planificación (no el WMS).
  Escritura 2 (WMS EXPEDICIONESCABECERA): TPEXSI='GENE' para que el WMS/EFLOW
    dispare el picking. TPEXES PERMANECE 'DISP'.

Orden: escritura 1 ANTES de escritura 2. SIN 2PC (no hay transacción distribuida
Aurora↔SQL Server). Consistencia por: orden fijo + idempotencia por PK + reintento
+ un campo `estado_handoff='disparo_pendiente'` tras la escritura 1, que pasa a
'completado' tras confirmar la escritura 2. Un barrido posterior reconcilia los
que quedaron en 'disparo_pendiente'.
  ponytail: sin 2PC + reintento idempotente es una simplificación deliberada con
  techo conocido — bajo fallo entre escritura 1 y 2 queda un 'disparo_pendiente'
  que un barrido reconcilia; no hay garantía transaccional distribuida. Upgrade
  path: patrón outbox/transactional cuando el volumen lo exija.

Idempotencia: la PK compuesta (IDALMACEN, IDCOMPANIA, IDSUCURSAL, IDEXPEDICION) es
la clave; la escritura 1 hace UPSERT por esa PK (re-correr no duplica).

FLAG parametrizable `escribir_prioridad_al_wms` (ConfiguracionReglas): si la
PRIORIDAD se escribe también en el WMS (PRIORIDAD/NOMBREPRIORIDAD de
EXPEDICIONESCABECERA), solo en la tabla del OMS, o en ambos, está POR CONFIRMAR
con negocio. Por eso NO está hardcodeado: default False, con TODO visible.

TODO(negocio): confirmar destino de la escritura de PRIORIDAD (tabla OMS / WMS /
ambos) y fijar el default del flag. Mientras tanto es parametrizable.
TODO(WMS real): la escritura 2 contra EFLOW/WMS está stubbeada en el esqueleto.
Reactivar nfr/infra-design antes de escribir al WMS real (external-dependency-map.md).
"""

from __future__ import annotations

import os

from models import ConfiguracionReglas, PedidoCandidato, PedidoPK, RegistroPrioridad

# SQL de referencia (escritura 1, Aurora). UPSERT por PK → idempotente.
UPSERT_PEDIDO_OMS_SQL = """
INSERT INTO oms.pedidos
    (id_almacen, id_compania, id_sucursal, id_expedicion,
     prioridad, status, situacion, estado_handoff, corrida, peso_total, cubicaje_total)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (id_almacen, id_compania, id_sucursal, id_expedicion)
DO UPDATE SET prioridad = EXCLUDED.prioridad,
              status = EXCLUDED.status,
              situacion = EXCLUDED.situacion,
              estado_handoff = EXCLUDED.estado_handoff,
              corrida = EXCLUDED.corrida,
              peso_total = EXCLUDED.peso_total,
              cubicaje_total = EXCLUDED.cubicaje_total
"""

# SQL de referencia (escritura 2, WMS SQL Server). TPEXSI='GENE'; TPEXES NO cambia.
# Si el flag está activo, también escribe PRIORIDAD/NOMBREPRIORIDAD.
MARCAR_WMS_SQL = """
UPDATE EXPEDICIONESCABECERA
SET TPEXSI = 'GENE'
WHERE IDALMACEN = %s AND IDCOMPANIA = %s AND IDSUCURSAL = %s AND IDEXPEDICION = %s
"""
MARCAR_WMS_CON_PRIORIDAD_SQL = """
UPDATE EXPEDICIONESCABECERA
SET TPEXSI = 'GENE', PRIORIDAD = %s
WHERE IDALMACEN = %s AND IDCOMPANIA = %s AND IDSUCURSAL = %s AND IDEXPEDICION = %s
"""

ESTADO_PENDIENTE = "disparo_pendiente"
ESTADO_COMPLETADO = "completado"
SITUACION_GENERADA = "generada"
STATUS_PRIORIZADO = "priorizado"


def _modo_live() -> bool:
    return os.environ.get("OMS_SOURCE", "mock") == "live"


def ejecutar(
    pedido: PedidoCandidato,
    registro: RegistroPrioridad,
    config: ConfiguracionReglas,
    corrida: str,
) -> str:
    """Ejecuta las dos escrituras del handoff para UN pedido. Devuelve el estado final.

    Entradas:
      - pedido: el candidato original (para peso/cubicaje).
      - registro: resultado del motor (prioridad numérica).
      - config: ConfiguracionReglas (lee el flag escribir_prioridad_al_wms).
      - corrida: id de la corrida de priorización (trazabilidad).
    Salida:
      - 'completado' si ambas escrituras ok; 'disparo_pendiente' si la 1 ok pero la
        2 falló (reconciliable). La escritura 1 es idempotente por PK.
    Errores: la escritura 1 propaga HttpError (vía pg) si Aurora falla ANTES de
      marcar; una vez persistida la fila como pendiente, un fallo en la escritura 2
      NO lanza: deja 'disparo_pendiente' para reconciliar.
    """
    # --- Escritura 1: tabla propia del OMS (Aurora). Idempotente por PK. ---
    _escribir_pedido_oms(pedido, registro, corrida, estado=ESTADO_PENDIENTE)

    # --- Escritura 2: marcar el WMS (TPEXSI='GENE'). Sin 2PC. ---
    try:
        _marcar_wms(pedido.pk, registro.prioridad, config)
    except Exception:  # noqa: BLE001 — no romper: queda pendiente para reconciliar
        return ESTADO_PENDIENTE

    # Confirmar: la fila del OMS pasa a 'completado'.
    _escribir_pedido_oms(pedido, registro, corrida, estado=ESTADO_COMPLETADO)
    return ESTADO_COMPLETADO


def _escribir_pedido_oms(pedido: PedidoCandidato, registro: RegistroPrioridad, corrida: str, *, estado: str) -> None:
    params = [
        pedido.id_almacen, pedido.id_compania, pedido.id_sucursal, pedido.id_expedicion,
        registro.prioridad, STATUS_PRIORIZADO, SITUACION_GENERADA, estado, corrida,
        pedido.peso_total, pedido.cubicaje_total,
    ]
    if _modo_live():
        from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests
        pg.query(UPSERT_PEDIDO_OMS_SQL, params)
    # En mock no hay DB: la escritura es un no-op observable vía el estado devuelto.


def _marcar_wms(pk: PedidoPK, prioridad: int, config: ConfiguracionReglas) -> None:
    if config.escribir_prioridad_al_wms:
        # TODO(negocio): confirmar que la PRIORIDAD va al WMS (hoy flag, default off).
        sql, params = MARCAR_WMS_CON_PRIORIDAD_SQL, [prioridad, pk.id_almacen, pk.id_compania, pk.id_sucursal, pk.id_expedicion]
    else:
        sql, params = MARCAR_WMS_SQL, [pk.id_almacen, pk.id_compania, pk.id_sucursal, pk.id_expedicion]

    if _modo_live():
        # TODO(WMS real): ejecutar contra EFLOW/WMS (SQL Server). Stub en el esqueleto.
        raise NotImplementedError("Escritura al WMS real no implementada en el esqueleto (OMS_SOURCE=live).")
    # En mock: no-op (la señal del flag queda cubierta por los tests sobre _marcar_wms).
    _ = (sql, params)
