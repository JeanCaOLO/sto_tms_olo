# 01 — Desplegar y dar permiso S3 al módulo (m08 ya aplicada)

> **Verificado en AWS/BD el 2026-11-11:** m08 admite photo_return y `mobile_api/stops.py` publicado coincide con el local. Lo que falta para fotos en administración es configurar el bucket y permisos de lectura; admin aún no tiene los cambios nuevos. Ver [estado actual y evidencia](../ESTADO_ACTUAL.md). La instrucción antigua de redesplegar mobile no se considera necesaria sin cambios adicionales.

**Estado (2026-11-11):** m08 y el archivo móvil revisado están verificados contra Aurora/Lambda. Sigue pendiente configurar bucket/permisos y publicar los cambios nuevos de administración. La evidencia del sandbox está en la matriz enlazada arriba; QA y producción no se comprobaron.

## Qué falta
1. ~~Aplicar `m08_photo_return.sql`~~ — hecho (verificado 2026-11-06 contra la restricción real). Rollback en el encabezado del archivo (solo si no hay filas `photo_return`).
2. **Verificado:** `mobile_api/stops.py` desplegado coincide con el local e incluye artículos y `photo_client_id`. No redesplegar mobile por este punto sin cambios nuevos; queda la prueba real con dispositivo.
3. Desplegar `backend/admin` pasando el parámetro `MobileEvidenceBucket` (output `EvidenceBucket` del stack mobile).
4. Dar `s3:GetObject` sobre `arn:aws:s3:::<bucket>/pedidos/*` al rol Lambda compartido (`${CommonStackName}-LambdaRoleArn`, en `backend/common-services`). Es el mismo permiso que ya tiene `backend/tracking/template.yaml` (líneas 121-122, condicionado a `HasMobileEvidenceBucket`). En el repo, `backend/common-services` no concede `s3:GetObject` sobre `pedidos/*`.

## Por qué
`tbl_returns.photo_url` guarda la llave S3, no una URL. `backend/admin/src/admin_media.py` firma la lectura; sin bucket o sin permiso devuelve `None` y la pantalla solo deja de mostrar «Ver foto» (no falla).

## Cómo verificar
Con un chofer demo en el sandbox: registrar una devolución desde la app con foto → en el módulo Devoluciones, el viaje debe mostrar el badge «Contracamión» y abrir la foto.
