# 2026-11-04 — Verificación del redespliegue tras el renombrado y diagnóstico de los mocks de eFlow

## What changed

No hay cambio de código. Verificación y diagnóstico.

- **Redespliegue después del PR #36** (estándar OLTP): se confirmó que los 16 stacks y Lambdas
  `dev-tms-*` que usan Aurora se actualizaron entre las 20:26 y las 20:37 UTC del 2026-11-03. Se
  descargó el código desplegado de planning, oms y data: ya usa `tbl_*` y `db_names`. No se tocaron
  `dev-tms-app-*`, `dev-orders-*` ni `sim-web-dev` (otras bases) ni `alerts-mailer`/`horarios` (no usan
  BD). También se actualizó `main` en GitLab tras la aprobación de Jean.
- **Auditoría de Dylan (tarifas) sobre los datos de prueba de eFlow:** la Lambda
  `dev-tms-eflow-eflow-api` está desplegada con `EFLOW_MODE=mock` (default de `template.yaml` y de
  `samconfig.toml` en los 3 ambientes). En el frontend solo la consume `catalogos-api.ts`, que alimenta
  la lista de conductores de Guías. `fetchViajes`, `fetchPedidosDeViaje` y `fetchRutasDias` son código
  muerto. La planificación real no pasa por esa Lambda: ingesta eFlow directo.

## Why

Chus pidió verificar que los backends estuvieran redesplegados antes de retirar las vistas de
compatibilidad, y responder la auditoría de Dylan sobre qué datos de prueba quedaban vivos.

## Follow-ups

- eFlow API: que falle cerrado fuera de local cuando no está en `live` (503), pasarla a `live` cuando
  se pruebe el acceso al WMH, y que Guías lea los conductores de `tbl_drivers`. No se hizo (ofrecido como PR).
- Recolectas para Dylan: se respondió que no existían. Se construyeron el 2026-11-05 (ver `2026-11-05-recolectas-en-el-planificador.md`).
