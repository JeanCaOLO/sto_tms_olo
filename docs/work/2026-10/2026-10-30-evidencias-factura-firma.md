# Evidencias (foto de factura y firma) · revisión y endurecimiento

Fecha: 2026-10-30. Se revisó el flujo completo en `TRACKING_TMS/frontend` y `sto_tms_olo/backend/{mobile,tracking}` (solo lectura) antes de tocar nada.

## Hallazgo principal
La función **ya existe de punta a punta**; no faltaba un destino. Lo que nunca se hizo es probarla con la app y el S3 real.

Flujo: la app captura (foto JPEG 1600 px q0.75; firma PNG) → copia local + cola SQLite (`sync/outbox.ts`) → `POST /api/mobile/v1/paradas/{id}/evidencias/upload-url` → POST multipart directo a S3 → `POST .../evidencias` confirma (idempotente por `client_id`). Marcar entregado exige ambas (`evidence_required`, `stops.py`). Tracking firma el GET en `_evidence_url`. Bucket dev `dev-tms-mobile-evidencias-758837481569`; `sql/54` ya aplicado.

## Cambios
- **App** `sync/evidence.ts`: el POST a S3 tenía cero timeout; con señal colgada bloqueaba toda la cola FIFO. Ahora corta a los 45 s (`S3_TIMEOUT_MS`) y cuenta como error de red reintentable (backoff existente).
- **App** `signature-pad.tsx`: `trimWhitespace` recorta el margen en blanco del PNG (menos datos y menos S3).
- **App** tests nuevos `evidence-upload.test.ts`: éxito, timeout/red reintentable, 400/413/415 fallida, 5xx/403 reintentable, archivo ausente o > 5 MB.
- **Backend mobile** `.env.example`: `EVIDENCE_BUCKET` ya no es "el mismo de tracking".
- **Backend mobile** `tests/test_template.py`: contrato del bucket (cifrado, CORS solo POST, sin expiración) y del rol (solo Get/Put sobre `pedidos/*`).

## Decisiones: qué NO se hizo y por qué
- **Límite de reintentos**: no se agregó. Si la evidencia pasa a `failed`, la transición "entregado" dependiente también falla y se perdería la entrega de un chofer que estuvo horas sin señal. Hoy reintenta con backoff hasta 5 min; es lo más seguro. Falta un aviso visual "evidencia pendiente hace X" (pendiente de UI).
- **Perfiles qa/prod en `samconfig.toml`**: no se inventaron (cuentas y nombres de bucket desconocidos). Ver pendientes.
- **Flujo viejo de subida en `backend/tracking`** (`app.py` evidence_upload_url/confirm): sigue vivo con otra llave y bucket; deuda, no se tocó.
- Sin migración.

## Pendientes (los haces tú / Intelix)
1. `backend/tracking/samconfig.toml` qa y prod: pasar `MobileEvidenceBucket`; sin eso `MOBILE_EVIDENCE_BUCKET=""` y las URLs salen `null`. `backend/mobile/samconfig.toml` solo tiene `dev`.
2. CORS del bucket móvil solo admite `localhost`; si se publica Expo web hay que añadir su dominio en `EvidenceCorsOrigins`.
3. Revisar `DbSecretName` `/dev/tms/db` (mobile) frente a `/dev/tms/db-app` del inventario.
4. Prueba real en dev: entrega completa con modo avión intermedio; comprobar objeto en S3 y fila en `tracking_evidences`.

## Verificación
- Backend mobile: `pytest` 135 pasan, 24 omitidas (los tests de template se omiten sin `pyyaml`; compilan).
- App: **no ejecutado** — `TRACKING_TMS/frontend` no tiene `node_modules`. Correr `npm ci && npm test && npm run typecheck && npm run lint`.

## Prueba real contra S3 dev (API, 2026-10-30)
Backend móvil local (4100) + bucket `dev-tms-mobile-evidencias-758837481569` con credenciales SSO. Script de diagnóstico en `.test/evidencias_s3_30-10-26/audit_s3.py` (no versionado). Chofer demo `drv-eflow-14`, parada 3 del viaje `VJ-20261029-91FD7E11`.
- `upload-url` 200 → preflight desde `http://localhost:8081` 200 con `Access-Control-Allow-Origin` correcto → POST a S3 204 → confirmar 201. El bucket, la política de subida y el CORS de dev funcionan.
- **Error 1 (500 en `upload-url`):** `ModuleNotFoundError: boto3` en el servidor local; en Lambda viene en el runtime, por eso no está en `src/requirements.txt`. Se añadió `boto3` a `requirements-dev.txt`.
- **Error 2:** `TRACKING_TMS/frontend/.env` apuntaba `EXPO_PUBLIC_API_BASE` al puerto 4000 (servidor del TMS, que no tiene rutas `/api/mobile`) en vez de 4100. `.env` no se versiona; `.env.example` ya decía 4100.
- **Error 3:** `backend/local/serve.py` no definía `MOBILE_EVIDENCE_BUCKET`; el detalle de Tracking firmaba la lectura en `TRACKING_BUCKET=local-dev` y el enlace de la foto no abría. Ahora lo toma de `EVIDENCE_BUCKET` en `backend/mobile/.env`.
- Pendiente: prueba visual en el navegador (la extensión de Chrome no estaba conectada).
- Datos de prueba creados en dev: 1 objeto `photo_invoice` en `pedidos/DEMO-CR-20261023-EFLOW14-3/…` y su fila en `tracking_evidences` (parada 3 sigue `pending`).
