# 01 — Aplicar m08, desplegar y dar permiso S3 al módulo

**Estado:** pendiente por verificar (nada de esto está aplicado ni desplegado; lo hace Intelix).

## Qué falta
1. Aplicar `backend/mobile/sql/m08_photo_return.sql` (amplía `ck_tracking_evidence_kind` con `photo_return`) con `python scripts/migrate.py sql/m08_photo_return.sql --execute`. Sin ella, confirmar la foto de una devolución falla en el servidor.
2. Desplegar `backend/mobile` (`python scripts/sandbox/deploy_backend.py mobile`): rutas nuevas `GET /paradas/{id}/articulos` y `POST /paradas/{id}/devoluciones` con `items[]` y `photo_client_id`.
3. Desplegar `backend/admin` pasando el parámetro `MobileEvidenceBucket` (output `EvidenceBucket` del stack mobile).
4. Dar `s3:GetObject` sobre `arn:aws:s3:::<bucket>/pedidos/*` al rol Lambda compartido (`${CommonStackName}-LambdaRoleArn`, en `backend/common-services`). Es el mismo permiso que ya tiene `backend/tracking/template.yaml` (línea ~119).

## Por qué
`tbl_returns.photo_url` guarda la llave S3, no una URL. `backend/admin/src/admin_media.py` firma la lectura; sin bucket o sin permiso devuelve `None` y la pantalla solo deja de mostrar «Ver foto» (no falla).

## Cómo verificar
Con un chofer demo en el sandbox: registrar una devolución desde la app con foto → en el módulo Devoluciones, el viaje debe mostrar el badge «Contracamión» y abrir la foto.
