# 01 — Aplicar m08, desplegar y dar permiso S3 al módulo

**Estado:** pendiente por verificar. **m08 NO está aplicada en Aurora** (`tms_olo`): verificado el 2026-11-05, la restricción `ck_tracking_evidence_kind` no admite `photo_return` y un INSERT de prueba fue rechazado. El despliegue de `backend/mobile` y `backend/admin` y el permiso S3 no se pudieron verificar desde el repo; lo hace Intelix.

## Qué falta
1. Aplicar `backend/mobile/sql/m08_photo_return.sql` (amplía `ck_tracking_evidence_kind` con `photo_return`) con `python scripts/migrate.py sql/m08_photo_return.sql --execute`. Hoy, sin ella, la foto desde la app falla: `evidence.confirm` no puede insertar `kind='photo_return'`, la devolución queda esperando en el outbox del chofer (`frontend/src/sync/outbox.ts:39`, `:191-197`) y no llega a Devoluciones (ver `docs/devoluciones/MODULO_DEVOLUCIONES.md` §10.1).
2. Desplegar `backend/mobile` (`python scripts/sandbox/deploy_backend.py mobile`): rutas nuevas `GET /paradas/{id}/articulos` y `POST /paradas/{id}/devoluciones` con `items[]` y `photo_client_id`.
3. Desplegar `backend/admin` pasando el parámetro `MobileEvidenceBucket` (output `EvidenceBucket` del stack mobile).
4. Dar `s3:GetObject` sobre `arn:aws:s3:::<bucket>/pedidos/*` al rol Lambda compartido (`${CommonStackName}-LambdaRoleArn`, en `backend/common-services`). Es el mismo permiso que ya tiene `backend/tracking/template.yaml` (líneas 121-122, condicionado a `HasMobileEvidenceBucket`). En el repo, `backend/common-services` no concede `s3:GetObject` sobre `pedidos/*`.

## Por qué
`tbl_returns.photo_url` guarda la llave S3, no una URL. `backend/admin/src/admin_media.py` firma la lectura; sin bucket o sin permiso devuelve `None` y la pantalla solo deja de mostrar «Ver foto» (no falla).

## Cómo verificar
Con un chofer demo en el sandbox: registrar una devolución desde la app con foto → en el módulo Devoluciones, el viaje debe mostrar el badge «Contracamión» y abrir la foto.
