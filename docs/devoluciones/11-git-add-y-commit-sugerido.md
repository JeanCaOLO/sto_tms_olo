# Git add y commit sugerido

Rama: `josef`. HEAD de integracion: `3e2908a`. Main y dylan-tarifas ya integradas conservando el historial. Esta continuacion no crea commits, no hace push y no despliega en AWS.

Se agregan solamente las rutas propias enumeradas abajo, mediante argumentos explicitos a `git add --`. Los archivos ajenos sin seguimiento permanecen fuera de staging. Los documentos originales y logs en `TMS/.test/` estan fuera de Git; sus copias/evidencias portables estan bajo docs.

Mensaje sugerido para sto_tms_olo:

`feat(devoluciones): autoaprueba solicitudes y registra novedades`

Incluye tambien la unificacion de captura y las validaciones 4B de Tarifas detalladas en sus documentos. SQL68/69/70 y rutas del template estan preparados, sin aplicacion externa ni despliegue. Pendientes: Planificacion, enlace real de Tracking/foto y aceptacion interna.

TRACKING_TMS no tiene cambios propios nuevos que agregar en esta continuacion. `.kiro/` ajeno permanece fuera de staging.

## Rutas propias de sto_tms_olo

- `backend/admin/src/admin_return_incidents.py`
- `backend/admin/src/admin_return_incidents_sql.py`
- `backend/admin/src/admin_return_request_access.py`
- `backend/admin/src/admin_return_requests.py`
- `backend/admin/src/admin_return_requests_sql.py`
- `backend/admin/src/admin_returns.py`
- `backend/admin/src/admin_returns_sql.py`
- `backend/admin/src/app.py`
- `backend/admin/template.yaml`
- `backend/tarifas/src/app.py`
- `backend/tarifas/src/proformas_api.py`
- `backend/tarifas/src/returns_gate.py`
- `backend/tarifas/src/tarifas_business_rules.py`
- `backend/tarifas/src/tarifas_proforma_content.py`
- `backend/tarifas/src/tarifas_sql.py`
- `backend/tests/conftest.py`
- `backend/tests/test_return_incidents.py`
- `backend/tests/test_return_request_creation_roles.py`
- `backend/tests/test_return_request_review.py`
- `backend/tests/test_return_requests.py`
- `backend/tests/test_returns.py`
- `backend/tests/test_returns_gate.py`
- `backend/tests/test_tarifas_business_rules.py`
- `backend/tests/test_tarifas_proforma_content.py`
- `backend/tests/test_tarifas_proformas.py`
- `docs/devoluciones/11-git-add-y-commit-sugerido.md`
- `docs/devoluciones/CIERRE_CONTINUACION_2026-11-12.md`
- `docs/devoluciones/CONTRATO_V2_PREPARACION.md`
- `docs/devoluciones/CREAR_SOLICITUD_2026-11-12.md`
- `docs/devoluciones/FLUJO_DEVOLUCIONES_V2.md`
- `docs/devoluciones/PENDIENTE_PLANIFICACION_RECOLECTAS.md`
- `docs/devoluciones/PLAN_CONSOLIDADO_2026-11-12.md`
- `docs/devoluciones/PLAN_DEVOLUCIONES_V2.md`
- `docs/devoluciones/PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md`
- `docs/devoluciones/PROXIMA_SESION_2026-11-12.md`
- `docs/devoluciones/SOLICITUDES_AUTOMATICAS_Y_NOVEDADES_2026-11-12.md`
- `docs/devoluciones/auditoria/2026-11-12/continuacion-verificaciones.json`
- `docs/devoluciones/auditoria/2026-11-12/p2-detalle-sintetico.json`
- `docs/devoluciones/auditoria/2026-11-12/solicitudes-novedades-verificaciones.json`
- `docs/devoluciones/pendientes/07-auditoria-rendimiento.md`
- `docs/devoluciones/pendientes/08-pruebas-auditoria.md`
- `docs/devoluciones/pendientes/09-dependencias-auditoria.md`
- `docs/devoluciones/pendientes/10-anexo-pendientes-previos.md`
- `docs/devoluciones/pendientes/11-medicion-detalle-y-sql.md`
- `docs/devoluciones/pendientes/12-app-distribuida-y-contrato-v2.md`
- `docs/devoluciones/pendientes/README.md`
- `docs/tarifador/pendientes/02-auditoria-y-reconciliacion.md`
- `docs/tarifador/pendientes/03-matriz-vigencia-2026-11-12.md`
- `docs/tarifador/pendientes/04-reglas-4b-implementadas.md`
- `docs/tarifador/pendientes/README.md`
- `sql/68_return_requests_operator_capture.sql`
- `sql/68_return_requests_operator_capture_rollback.sql`
- `sql/69_return_request_auto_approval.sql`
- `sql/69_return_request_auto_approval_rollback.sql`
- `sql/70_return_incidents.sql`
- `sql/70_return_incidents_rollback.sql`
- `src/components/feature/LandingRedirect.tsx`
- `src/components/feature/RouteGuard.test.tsx`
- `src/components/feature/RouteGuard.tsx`
- `src/components/feature/Sidebar.test.tsx`
- `src/components/feature/Sidebar.tsx`
- `src/components/feature/module-routes.ts`
- `src/components/feature/sidebar-nav-items.ts`
- `src/lib/devoluciones/solicitudes.ts`
- `src/lib/devoluciones/trips.ts`
- `src/lib/devoluciones/types.ts`
- `src/pages/devoluciones/api/devolucionesApi.ts`
- `src/pages/devoluciones/components/IncidentModal.tsx`
- `src/pages/devoluciones/components/ReceiveModal.tsx`
- `src/pages/devoluciones/page.tsx`
- `src/pages/devoluciones/parts/ReturnLinesTable.tsx`
- `src/pages/devoluciones/parts/TripCard.incidents.test.tsx`
- `src/pages/devoluciones/parts/TripCard.tsx`
- `src/pages/devoluciones/solicitudes/RequestCreation.tsx`
- `src/pages/devoluciones/solicitudes/RequestInbox.test.tsx`
- `src/pages/devoluciones/solicitudes/RequestInbox.tsx`
- `src/pages/mis-devoluciones/api/solicitudesApi.test.ts`
- `src/pages/mis-devoluciones/api/solicitudesApi.ts`
- `src/pages/mis-devoluciones/components/RequestDetail.tsx`
- `src/pages/mis-devoluciones/page.tsx`
- `src/pages/mis-devoluciones/requestDraftJournal.ts`
- `src/router/config.tsx`
- `tests/sql/67_roles_solicitudes_devolucion.test.mjs`
- `tests/sql/68_return_requests_operator_capture.test.mjs`
- `tests/sql/69_request_auto_approval.test.mjs`
- `tests/sql/70_return_incidents.test.mjs`
- `tests/sql/return_requests_access.test.mjs`
- `tests/sql/returns_pagination.test.mjs`
- `tests/sql/tarifas_marks.test.mjs`
- `tests/sql/tarifas_proforma_content.test.mjs`
