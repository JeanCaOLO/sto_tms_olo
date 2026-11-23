# Pendientes — OMS

| # | Pendiente | Estado |
|---|---|---|
| 01 | Días de anticipo por zona: SQL **aplicado 2026-11-10**; falta poblar VE y refrescar metadata | en progreso |
| 02 | Auditar pedidos vencidos sin `dispatch_date` (no liberan por barrido) | pendiente por verificar |
| 03 | Cola solo planificados (`getQueue` filtra `planning_run_id`) + Planificación pisa `wms_situation` desde eFlow | OMS hecho; Planif. pendiente |
| 04 | Integración con API REST de eFlow QA (flag `EFLOW_API_MODE`): verificada en QA el 2026-11-23; faltan número de viaje (WMH), bajada y no liberar dos veces | pendiente por implementar |
