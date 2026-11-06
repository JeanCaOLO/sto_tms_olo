# 01 — Desplegar y dar permiso S3 al módulo (m08 ya aplicada)

**Estado:** pendiente por verificar. **m08 YA está aplicada en Aurora** (`tms_olo`): verificado el 2026-11-06, `ck_tracking_evidence_kind` admite `photo_return`. El despliegue de `backend/mobile` y `backend/admin` y el permiso S3 no se pueden verificar desde el repo; lo hace Intelix.

## Qué falta
1. ~~Aplicar `m08_photo_return.sql`~~ — hecho (verificado 2026-11-06 contra la restricción real). Rollback en el encabezado del archivo (solo si no hay filas `photo_return`).
2. Desplegar `backend/mobile` (`python scripts/sandbox/deploy_backend.py mobile`): rutas nuevas `GET /paradas/{id}/articulos` y `POST /paradas/{id}/devoluciones` con `items[]` y `photo_client_id`.
3. Desplegar `backend/admin` pasando el parámetro `MobileEvidenceBucket` (output `EvidenceBucket` del stack mobile).
4. Dar `s3:GetObject` sobre `arn:aws:s3:::<bucket>/pedidos/*` al rol Lambda compartido (`${CommonStackName}-LambdaRoleArn`, en `backend/common-services`). Es el mismo permiso que ya tiene `backend/tracking/template.yaml` (líneas 121-122, condicionado a `HasMobileEvidenceBucket`). En el repo, `backend/common-services` no concede `s3:GetObject` sobre `pedidos/*`.

## Por qué
`tbl_returns.photo_url` guarda la llave S3, no una URL. `backend/admin/src/admin_media.py` firma la lectura; sin bucket o sin permiso devuelve `None` y la pantalla solo deja de mostrar «Ver foto» (no falla).

## Cómo verificar
Con un chofer demo en el sandbox: registrar una devolución desde la app con foto → en el módulo Devoluciones, el viaje debe mostrar el badge «Contracamión» y abrir la foto.
