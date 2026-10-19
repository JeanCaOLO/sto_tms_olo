# Functional Design — U1 `motor-reglas-oms` — Confirmación

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U1 `motor-reglas-oms`.
> **As-built**: el código ya está construido y verde (rama `oms`, 24 tests OMS /
> 275 suite). Este diseño funcional documenta las firmas/contratos de los módulos
> para el registro de auditoría; no re-abre el diseño.

## Consolidated Summary Confirmation

Se generó el diseño funcional de U1 `motor-reglas-oms` (as-built), con 5 produces:

- `functional-spec.md` — 7 módulos de la corrida y sus contratos (entrada→salida),
  firmas clave Python, flujo de la corrida (polling → reglas → score → handoff).
- `rules.md` — reglas de negocio `BR1.1..BR6.2` con trazabilidad a FR/US.
- `entities.md` — entidades y campos (orders, `oms_processed_at`, `planning_run_id`,
  `numero_viaje`, costura `sim_expedicionescabecera`).
- `frontend-components.md` — stub: U1 es backend puro (service/Lambda), sin UI.
- `traceability.json` — cobertura US0/US1/US7/US8/US9/US10/US11b/US-EPA/US13 →
  módulos; reglas BR → módulo.

Coherente con el contrato cerrado: ADR-007 (polling por `planning_run_id IS NOT
NULL AND oms_processed_at IS NULL`), ADR-008 (eFlow read-only + costura
`EscritorSituacion` → `sim_expedicionescabecera`, mañana endpoint EPRAC), ADR-010
(`lead_time_days` dinámico, default 1). `analizador_observaciones.py` diferido (D11,
cliente-retira es zona). U2 (backorder) y el endpoint real de EPRAC quedan como
assumptions abiertas, no bloquean.

¿El diseño funcional de U1 refleja correctamente lo construido?

[Answer]:
