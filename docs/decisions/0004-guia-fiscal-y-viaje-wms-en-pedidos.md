# 0004 — Guardar la guía fiscal en las líneas del pedido

- **Status**: Accepted (revisado 2026-10-08)
- **Date**: 2026-10-08
- **Owner role**: data-architect
- **Affects**: Aurora `tms_olo` (`public.order_items`), migraciones `sql/19_wms_guia_viaje_en_pedidos.sql` y `sql/20_drop_wms_trip_number.sql` (aplicadas). Lectura desde WMS EFLOW (`EFLOW_OLO`, solo lectura).

## Context

Al cargar pedidos reales de COFERSA desde EFLOW a `tms_olo`, el negocio pidió (daily 2026-10-07) ver la **guía fiscal** de cada línea, que el mapeo EFLOW→Aurora estaba descartando. `order_items` no tenía dónde alojarla.

**Qué NO es esto (corrección de marco):** no es una migración masiva de los pedidos del WMS/WMH a Aurora. EFLOW/WMS **sigue siendo la fuente** de los pedidos; a Aurora llegan solo los pedidos **operativos/vigentes** que el OMS ingiere para que Planificación arme viajes (flujo en vivo, coexistencia). El histórico del WMH no se migra. La columna solo **enriquece el modelo del pedido** en Aurora con un dato que el negocio consume en la guía de despacho.

## Decision

Agregar **`order_items.guia_fiscal`** ← EFLOW `EXPEDICIONESDETALLE.GUIAFISCAL` (guía fiscal **por línea**). `varchar` nullable, snake_case, con `COMMENT` que deja la trazabilidad al origen. La factura de cabecera ya vivía en `orders.invoice_number` (← `EXPEDICIONESCABECERA.FACTURA`): **no** se duplicó.

**`orders.wms_trip_number` — agregada y luego RETIRADA.** La migración `sql/19` también agregó `orders.wms_trip_number` (← `EXPEDICIONESCABECERA.NUMEROVIAJEWMH`, el viaje del WMH legado). Se retiró en `sql/20` porque: (a) nadie la lee; (b) el viaje nuevo lo arma el **planificador** en `plan_trips`/`plan_stops`, no en `orders`; (c) no hay migración del WMH a Aurora que la justifique; (d) el nombre (`wms_` en vez de `wmh_`, y "trip_number" a secas) confundía con el viaje del planificador. Si algún día se hace una conciliación durante el corte del WMH, re-agregarla es trivial.

## Considered alternatives

- **Tabla puente `order_wms_refs`** — rechazada: la guía es 1:1 con la línea; sin cardinalidad que justifique una tabla ni un join extra.
- **Guardar en `orders.notes` / JSON** — rechazada como dato: no es consultable ni tipable; el negocio la pidió como campo.
- **`guia_fiscal` a nivel de encabezado (`orders`)** — rechazada por ahora: el origen (`EXPEDICIONESDETALLE`) la da por línea; ver "Open coordination points".

## Consequences

- **Positive**: la guía queda como campo tipado y consultable, lista para la guía de despacho.
- **Negative**: una columna nullable más; `varchar` sin límite (acotable si se consulta por ella).
- **Neutral**: `order_items` ya está auditada (ADR-0003); la columna entra en ese registro sin trabajo extra.

## Nota del hallazgo — nulos en pre-despacho

En los pedidos COFERSA cargados (situación `DISP`, pre-despacho), `GUIAFISCAL` y `FACTURA` vienen **NULL en origen**: se llenan al **despachar/facturar**. Por eso hoy `order_items.guia_fiscal` e `orders.invoice_number` quedan vacíos para esos pedidos. La ausencia es del estado del pedido, no del mapeo. La UI no debe asumir guía/factura presentes en pedidos no despachados.

## Trazabilidad EFLOW → Aurora

| EFLOW (`EFLOW_OLO`, read-only) | Nivel | Aurora `tms_olo` | Poblado hoy |
|---|---|---|---|
| `EXPEDICIONESDETALLE.GUIAFISCAL` | línea | `order_items.guia_fiscal` | NULL (se llena al despachar) |
| `EXPEDICIONESCABECERA.FACTURA` | encabezado | `orders.invoice_number` (preexistente) | NULL (se llena al facturar) |

Escritura por el loader de ingesta (`agregar_pedidos_reales.py`, INSERT a `orders`/`order_items`); EFLOW se consulta **solo lectura**.

## Open coordination points

- **¿Guía a nivel de encabezado?** El origen la da por línea, pero suele haber una sola guía por expedición; si el negocio la consume por pedido, evaluar moverla a `orders`. Decisión de product/functional-analyst.
- **security-compliance**: la guía fiscal es dato fiscal/documental real; evaluar marca de sensibilidad y retención.

## Historial de correcciones

- **2026-10-08 (1)**: se reencuadró de "andamiaje de demo desechable" a columna estructural del modelo (las columnas no son de usar y tirar).
- **2026-10-08 (2)**: se **retiró `wms_trip_number`** (`sql/20` / backend `sql/007`) y se **corrigió el marco**: esto NO es una migración WMS/WMH → Aurora; EFLOW sigue siendo la fuente y a Aurora solo llega lo operativo que el OMS ingiere. El ADR queda acotado a `guia_fiscal`.
