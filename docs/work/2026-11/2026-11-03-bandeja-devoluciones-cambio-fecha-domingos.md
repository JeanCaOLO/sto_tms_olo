# 2026-11-03 — Bandeja: devoluciones (pickup), cambio de fecha (admin) y domingos en Planificación

## What changed

- **Bandeja muestra devoluciones**: `backend/planning/src/bandeja.py` (nuevo) une los
  pedidos DISP/DISP (`kind = delivery`) con las devoluciones abiertas de `returns`
  (`pending`/`approved`, creadas en el TMS o en la app → `kind = pickup`), con los datos
  del pedido original. La vista etiqueta las devoluciones (badge "Devolución") y filtra
  por Tipo: Delivery (pedidos) / Pickup (devoluciones). Se quitó la columna "Tipo de
  Orden", que salía vacía, y en su lugar va "Tipo".
- **Cambio de fecha de entrega, solo admin**: `POST /api/v1/planificacion/pedidos/{id}/fecha-entrega`
  (`cambio_fecha.py`). Rechaza a quien no es admin (403), pedidos ya liberados a eFlow
  (409) y fechas pasadas (400). Re-arma los días afectados de la ventana (el viejo y el
  nuevo) para que el pedido cambie de viaje. En la UI: sección en el modal de detalle,
  visible solo para admin.
- `sql/57_orders_cambio_fecha_entrega.sql` (**aplicada en Aurora**): `orders.delivery_date_eflow`,
  `delivery_date_changed_at`, `delivery_date_changed_by` (FK app_users) y
  `delivery_date_changes`. La ingesta ya no pisa `delivery_date` si se cambió a mano.
- **Domingos en Planificación**: la vista semana del calendario pasa de L–S a L–D.

## Why

Reunión 2026-11-03: Bandeja y Planificación son de este equipo. Se pidió ver las
devoluciones etiquetadas, filtrar pickup/delivery, cambiar la fecha de entrega con
aprobación y registro de quién, y poder ver fines de semana cuando la entrega cae ahí.
La aprobación con "clave master del coordinador" quedó, por decisión de Chus, como
**solo admin** (`permissions.is_admin`).

## How

Prueba contra Aurora + eFlow en transacción con ROLLBACK:
- Devolución `pending` aparece como pickup, `completed` no.
- EPA 2000019231 del 06-nov al 05-nov: queda en `20261105-001` con salida 04-nov, sale del
  viaje del 06, `delivery_date_eflow = 06-nov`, `changes = 1`, `changed_by` = el admin.
- Un pedido que sigue en la cola de eFlow (EDI0121525-N) con la fecha cambiada: tras
  `ingest_cr()` conserva la fecha manual y guarda la de eFlow aparte.
- Fecha pasada → 400; pedido liberado → 409.
`pytest backend/tests` 530 passed; vitest calendario + oms 15 passed; tsc sin errores en
los archivos tocados; `sam validate --lint` OK.

## Promoted knowledge

- Las devoluciones viven en `returns` (no en `orders`), una por pedido original; ciclo
  `pending → approved → completed` (o `rejected`). Hoy la tabla está vacía en Aurora.

## Follow-ups

- Un pedido movido a HOY no lo arma el replan automático (la ventana empieza mañana): se
  arma con "armar plan" del día.
- La fecha cambiada vive solo en el TMS; eFlow sigue con la suya (no hay write-back de fecha).
- Las devoluciones se muestran en la bandeja pero el planificador todavía no las rutea.
- El indicador "cantidad de modificaciones de fecha" del Panel OMS puede leer `delivery_date_changes`.
