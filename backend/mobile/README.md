# backend/mobile · API de la app del chofer.

Python 3.13 + AWS Lambda (SAM) detrás de un HTTP API propio. Misma BD que el TMS (Aurora `tms_olo`), autorización
propia: solo usuarios con rol `Chofer` enlazados a un conductor (`drivers.app_user_id`), y cada chofer solo ve y
escribe SUS viajes.

## Desarrollo
```powershell
cd mobile\backend
pip install -r requirements-dev.txt
python -m pytest                      # pruebas con BD simulada, sin AWS
copy .env.example .env                # completar BD y JWT_SECRET (no se sube)
python local/serve.py                 # API local en http://localhost:4100 (requiere túnel a Aurora)
python scripts/migrate.py sql/m01_mobile_base.sql            # dry-run (rollback)
python scripts/migrate.py sql/m01_mobile_base.sql --execute  # aplica (BD compartida: pedir OK antes)
```

## API `/api/mobile/v1`
| Ruta | Acceso | Qué hace |
|---|---|---|
| `GET salud` | pública | chequeo |
| `POST auth/login` · `auth/refresh` · `auth/logout` | pública | sesión: JWT 1 h + refresh 30 días con rotación |
| `GET mi-viaje` | chofer | viajes en tránsito y planificados por salir, con paradas, ETA y retraso |
| `POST viajes/{id}/iniciar` | chofer | inicia SU viaje planificado (crea ruta + paradas); idempotente |
| `POST posiciones` | chofer | lote ≤ 200, idempotente por `client_id` |
| `POST paradas/{id}/transicion` | chofer | entregado / fallido / pendiente; geocerca de 150 m |
| `POST paradas/{id}/novedades` · `devoluciones` | chofer | novedad (`incident`/`pickup`) y devolución |
| `POST paradas/{id}/evidencias/upload-url` · `evidencias` | chofer | foto de factura y firma: subida directa al bucket PROPIO de la app (`<stack>-evidencias-<cuenta>`), en `pedidos/<número>/<id del pedido>/<tipo>-<uuid>.<ext>`; la fila de `tracking_evidences` guarda pedido, número y bucket (sql/54) |
| `POST consentimiento-gps` | chofer | consentimiento por versión del aviso |

Respuesta: `{ "data": ..., "error": null }` o `{ "data": null, "error": { "message", "code" } }`.

## Estructura
`src/app.py` (entrada) · `src/mobile_api/` (código) · `sql/` (migraciones `m01_…`) · `scripts/migrate.py` ·
`local/serve.py` · `tests/` · `template.yaml` + `samconfig.toml` (despliegue: solo Intelix).
