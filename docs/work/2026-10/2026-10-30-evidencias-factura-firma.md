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

## Prueba en navegador (app web del chofer, Expo SDK 58, 2026-10-30)
- Login con el chofer demo OK contra el backend móvil (4100) y la lista de paradas carga bien (viaje `VJ-20261029-91FD7E11`).
- **Hallazgo 1:** el Metro que corría en 8081 tenía `EXPO_PUBLIC_API_BASE=http://localhost:4000` (el servidor del TMS, sin rutas `/api/mobile`): `OPTIONS` 501 y `POST login` 503, "Sin conexión" en pantalla. El `.env` local volvió a 4000 tras mi corrección; `.env.example` dice 4100. Se probó reiniciando Metro con la variable en 4100.
- **Hallazgo 2:** en web la sesión no sobrevive a una recarga dura (vuelve a `/login`). En el teléfono sí persiste (secure-store); solo afecta a la versión web.
- **No concluyente:** la captura de foto en web (`expo-image-picker` abre un `<input type=file capture>` dinámico y le hace `dispatchEvent(click)`) no se pudo automatizar: el selector nativo no es manejable desde la extensión y, al inyectar el archivo, `expo-image-picker` lanza `removeChild ... not a child of this node` (ExponentImagePicker.web.ts:139). Es del arnés de prueba con inyección; no se confirmó como bug de la app. La foto y la firma se probaron de punta a punta por API (sección anterior). Pendiente: probar la captura real con una persona en el navegador o en el teléfono.

### Segunda prueba en navegador: flujo completo OK (2026-10-30, 4:15-4:20 p.m.)
Parada 4 del viaje `VJ-20261029-91FD7E11` (pedido `DEMO-CR-20261023-EFLOW14-4`), app web SDK 58 + backend móvil local + bucket dev real.
- Foto de factura: la imagen se inyectó desde la página (el selector nativo no es manejable por la extensión). Subió a S3, el objeto quedó en `pedidos/DEMO-CR-20261023-EFLOW14-4/<id>/photo_invoice-*.jpg` (39 KB).
- Firma dibujada en el canvas web: `signature-*.png` (26 KB, 1502x552 px). `trimWhitespace` no aplica en web (la web usa `signature-pad.web.tsx`, un canvas propio): el PNG sale del tamaño del recuadro. Pesa poco, así que no se tocó.
- Entregar: `transicion` 200, la app muestra "4 entregadas · falta 1".
- Tracking del TMS (localhost:3000): "4 de 5 paradas 80%", la parada 4 muestra "Recibió: Receptor Prueba" y las dos miniaturas cargan desde el bucket dev (URL firmada; `naturalWidth` > 0).
- La herramienta de red del navegador mostró el `POST` a S3 con estado 503, pero el objeto existe en S3 y la confirmación respondió 201; es un artefacto de la herramienta (respuesta opaca), no un fallo real.
- Primer intento fallido: `createSyncAccessHandle ... another open Access Handle` (expo-sqlite web/OPFS permite una sola conexión; ocurre si hay otra pestaña o worker viejo con la app abierta). Se resolvió recargando. En web, abrir la app en dos pestañas impide guardar en el outbox.
- Datos de prueba en dev: parada 4 entregada (receptor "Receptor Prueba", motivo "GPS impreciso" por no haber ubicación en el navegador), 2 objetos en S3 y 2 filas en `tracking_evidences`. La parada 3 conserva su objeto de la prueba por API.
- **Ver la evidencia en Tracking (TMS):** en el panel del viaje, la parada 4 expandida muestra los enlaces "Factura firmada" y "Firma digital" (`target=_blank`, URL firmada de S3 con `X-Amz-Expires=3600`). Al abrir "Factura firmada" se ve la imagen completa (1200x900) desde el bucket dev.
