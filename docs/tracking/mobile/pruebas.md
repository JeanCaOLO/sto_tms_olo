# Tracking móvil — pruebas

## Suites

| Suite | Dónde | Cómo correr | Alcance |
|---|---|---|---|
| Backend móvil (pytest) | `sto_tms_olo/backend/mobile/tests/` | `cd backend/mobile && pip install -r requirements-dev.txt && pytest` | ~151 pruebas con BD simulada, sin AWS |
| App (Jest) | `TRACKING_TMS/frontend/src/__tests__/` | `cd frontend && npx jest` | 18 archivos |
| Tipos / lint / deps (app) | `TRACKING_TMS/frontend` | `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` | Se corren antes de cerrar cualquier tarea |
| Monitor web (Vitest) | `sto_tms_olo/src/pages/tracking/__tests__/` | `npm test` | `api`, `cluster`, `components`, `mis-entregas`, `mock-backend`, `page`, `stop-order`, `tracking-logic`, `usePolling` |
| E2E web (Playwright) | `sto_tms_olo/e2e/tracking.spec.ts` | Playwright (modo mock) | Monitor en navegador |
| Contrato / E2E real | `scripts/tracking-contract-check.mjs`, `scripts/tracking-e2e-real.mjs` | Requieren túnel a Aurora | Contrato v2 contra backend real |

### Backend móvil — archivos

`test_auth.py` (25), `test_driver_api.py` (63), `test_stop_visits.py` (15), `test_presence.py` (19), `test_start_trip.py` (9), `test_web_contract.py` (8), `test_template.py` (5), `test_dev_evidence.py` (4), `test_db.py` (3), `conftest.py`.

`test_web_contract.py` comprueba que lo que escribe la app coincide con lo que lee el monitor web.

### App — archivos

`arrival`, `config`, `connectivity`, `evidence-upload`, `geo`, `gps-policy`, `gps-sync`, `http`, `my-trips`, `outbox`, `permissions`, `presence`, `return-form`, `screens` (`.tsx`), `session`, `today`, `trip-label`, `trip-stop` (`.tsx`). La lógica pura (`gps/policy.ts`, `backend/mobile/.../logic.py`) está aislada para probarse sin montar React ni BD.

> Las cifras de `TRACKING_TMS/DEPLOY.md` («108 passed / 2 skipped», «jest 78 passed») son **antiguas**; ver [pendientes/01](./pendientes/01-contratos-y-docs-desactualizados.md).

## Qué NO cubren

- **No hay pruebas contra Aurora real** ni en teléfono físico (pendientes [`02`](../pendientes/02-aplicar-migraciones-y-prueba-e2e.md) y [`11`](../pendientes/11-permisos-primer-uso-verificar.md) del módulo).
- **Transición de recolecta** (`collection`) no está probada en el sandbox (`TRACKING_TMS/PENDIENTES_BACKEND.md`) — [pendientes/02](./pendientes/02-recolecta-sin-probar-sandbox.md).
- GPS en segundo plano, batería y servicio en primer plano **solo se prueban en un teléfono** (Expo Go corre en modo foreground).
- Subida real a S3 (en local se simula con `local/dev_evidence.py`).

## Plan de verificación en teléfono

Con un chofer demo, en horario de Aurora (L–V 5 am–5 pm CR):

1. **Instalación y login:** instalar el APK, iniciar sesión, aceptar consentimiento y permisos en cadena.
2. **Iniciar viaje:** con un plan confirmado de hoy; comprobar 409 `no_carrier` y `trip_in_progress` con datos de prueba.
3. **GPS en segundo plano:** guardar la app, caminar/conducir 10 min; en el monitor web debe verse el camión con «hace X» < 5 min y bajar la batería.
4. **Sin señal:** modo avión, entregar una parada con foto + firma, volver la red; todo debe salir en orden y el estado cambiar en el monitor sin duplicados.
5. **Geocerca:** entregar a > 150 m: debe pedir motivo y aparecer `geofence_out` en la bitácora.
6. **Evidencias:** intentar entregar sin foto/firma → `evidence_required`.
7. **Devolución contracamión:** varios artículos + foto; revisar filas en `tbl_returns` y vista web de Devoluciones.
8. **Cierre automático:** registrar la última parada; el viaje debe pasar a Completado y la app mostrar el resumen.
9. **Recolecta:** repetir 4–8 con una parada `collection` (foto de producto + firma).
10. **Cambio de chofer:** cerrar sesión e iniciar con otro; las colas del anterior deben vaciarse.
