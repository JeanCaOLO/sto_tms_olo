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
