# 0004 — Guardar guía fiscal y número de viaje WMS en los pedidos

- **Status**: Accepted
- **Date**: 2026-10-08
- **Owner role**: data-architect
- **Affects**: Aurora `tms_olo` (`public.orders`, `public.order_items`), migración `sql/19_wms_guia_viaje_en_pedidos.sql` (aplicada), proceso de sincronización WMS→Aurora (hoy `agregar_pedidos_reales.py`, mañana réplica/sync continuo), diccionario `docs/reference/diccionario-datos-tms-olo.md`. Lectura desde WMS EFLOW (`EFLOW_OLO`, solo lectura).

## Context

Esto es la **primera fase de una migración/sincronización progresiva WMS/WMH (EFLOW) → Aurora**, no un andamiaje desechable. Aurora `tms_olo` es el nuevo sistema de registro del TMS/Planificación; EFLOW se sigue consultando **solo lectura** durante la coexistencia y cada iteración migra más entidades y campos. Es coherente con los DECIDED del proyecto (`aidlc/spaces/default/memory/project.md`): "OMS+Planificación REEMPLAZAN al WMH desde la salida", "el OMS lee los pedidos del WMS/EFLOW o de la réplica", y el rediseño del flujo pedido→TMS→OMS→WMS entra en alcance.

El disparador concreto: ya se cargaron pedidos reales de COFERSA desde EFLOW y, en el daily del 2026-10-07, el negocio pidió ver dos datos reales que el mapeo EFLOW→Aurora estaba descartando — la **guía fiscal** de cada línea y el **número de viaje del WMH** que liga el pedido con el viaje de la torre de control. `orders`/`order_items` no tenían dónde alojarlos (`orders` ya traía `invoice_number` para la factura de cabecera, pero nada para la guía por línea ni para el viaje WMS).

## Decision

Agregar dos columnas de trazabilidad WMS a los pedidos, pobladas por el loader al importar desde EFLOW:

- **`order_items.guia_fiscal`** ← EFLOW `EXPEDICIONESDETALLE.GUIAFISCAL` (guía fiscal **por línea**).
- **`orders.wms_trip_number`** ← EFLOW `EXPEDICIONESCABECERA.NUMEROVIAJEWMH` (= `EFLOW_WMH.journey_orders.journey_id`), que liga pedido↔viaje del WMH.

Ambas `varchar` nullable, snake_case como el resto del esquema, con `COMMENT` que deja la trazabilidad al origen EFLOW en la propia columna. Son columnas **estructurales y permanentes**: parte del modelo de registro del TMS, alimentadas por el proceso de sincronización WMS→Aurora (hoy el loader `agregar_pedidos_reales.py`, que evolucionará a réplica/sync continuo), no por una carga única. La migración `sql/19` es idempotente (`ADD COLUMN IF NOT EXISTS`) y ya está aplicada y registrada en `schema_migrations`; otorga `SELECT/INSERT/UPDATE` a `tms_app` (coherente con ADR-0003). La factura de cabecera sigue en la columna ya existente `orders.invoice_number` (← EFLOW `EXPEDICIONESCABECERA.FACTURA`): **no** se duplicó.

## Considered alternatives

- **Tabla puente `order_wms_refs` (pedido/línea → refs WMS)** — una tabla aparte para guía y viaje. Rechazada: no hay cardinalidad que lo justifique (la guía es 1:1 con la línea y el viaje 1:1 con el encabezado), y añadiría un join a cada lectura de la demo sin beneficio de integridad.
- **Guardar todo en `orders.notes` / JSON** — meter guía y viaje en texto libre (de hecho el loader ya los escribe en `notes` para la demo). Rechazada como solución de datos: no es consultable ni tipable, y el negocio pidió verlos como campos, no como nota.
- **`guia_fiscal` a nivel de encabezado (`orders`)** — una sola guía por pedido. Rechazada **por ahora** porque el origen real (`EXPEDICIONESDETALLE`) la entrega por línea; ver "Open coordination points".

## Consequences

- **Positive**: los dos datos reales de EFLOW quedan como campos tipados y consultables; `wms_trip_number` habilita ligar el pedido con el viaje del WMH (33 pedidos ya poblados) y sienta el patrón de mapeo EFLOW→Aurora que la migración progresiva irá ampliando.
- **Negative**: dos columnas nullable más en tablas del núcleo compartido; `varchar` sin límite ni índice — pendiente a resolver **pronto**, porque el volumen crecerá con la sincronización real (no es un "si acaso" de demo). Ver "Open coordination points".
- **Neutral**: ambas tablas ya están auditadas (ADR-0003, trigger en `audit.events`); las nuevas columnas entran en ese registro sin trabajo extra.

## Nota del hallazgo — nulos en pre-despacho

En los pedidos COFERSA que se cargaron (estado/situación `DISP`, pre-despacho), `EXPEDICIONESDETALLE.GUIAFISCAL` y `EXPEDICIONESCABECERA.FACTURA` vienen **NULL en origen**: la guía y la factura se llenan recién al **despachar/facturar**. Por eso hoy `order_items.guia_fiscal` e `orders.invoice_number` quedan vacíos para estos pedidos, mientras que `orders.wms_trip_number` sí quedó poblado (33 pedidos). Las columnas son correctas; la ausencia de dato es del estado del pedido, no del mapeo. Consecuencia para la UI: no asumir guía/factura presentes en pedidos no despachados. A medida que la sincronización progresiva capture pedidos ya despachados, estas columnas se irán poblando sin cambio de esquema.

## Trazabilidad EFLOW → Aurora

| EFLOW (`EFLOW_OLO`, read-only) | Nivel | Aurora `tms_olo` | Poblado hoy |
|---|---|---|---|
| `EXPEDICIONESDETALLE.GUIAFISCAL` | línea | `order_items.guia_fiscal` | NULL (se llena al despachar) |
| `EXPEDICIONESCABECERA.FACTURA` | encabezado | `orders.invoice_number` (preexistente) | NULL (se llena al facturar) |
| `EXPEDICIONESCABECERA.NUMEROVIAJEWMH` (= `journey_orders.journey_id`) | encabezado | `orders.wms_trip_number` | sí (33 pedidos) |

Escritura por el proceso de sincronización WMS→Aurora (hoy `agregar_pedidos_reales.py`, INSERT a `orders`/`order_items`; mañana réplica/sync continuo); EFLOW se consulta **solo lectura** en coexistencia.

## Open coordination points

- **¿Guía a nivel de encabezado?** El origen la da por línea, pero en estos pedidos suele haber una sola guía por expedición; si el negocio siempre la consume por pedido, evaluar moverla a `orders` (como `invoice_number`). Decisión de product/functional-analyst sobre el origen real del dato — **no cambiar el esquema sin aprobación del usuario**.
- **Tipo e índice (pronto, no "si acaso")**: `varchar` sin límite difiere de los `varchar(100)` vecinos; como el volumen crecerá con la migración real y Planificación probablemente filtre/junte por `wms_trip_number`, conviene acotar el tipo y añadir índice en una iteración cercana, no diferirlo. Confirmar el patrón de acceso de Planificación.
- **security-compliance (aplica ya)**: guía fiscal y factura son datos fiscales/documentales **reales**, no de demo; evaluar desde ahora marca de sensibilidad y retención, no "cuando deje de ser demo".
