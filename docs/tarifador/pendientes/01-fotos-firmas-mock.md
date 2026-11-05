# Fotos y firmas reales en la data mock

**Estado:** idea

**Qué falta:** la mock deja `photo_url` vacío y no crea `tbl_tracking_evidences`, así que Tracking y Devoluciones muestran
"sin foto".

**Por qué:** las fotos se sirven con URL firmadas de S3 (`backend/admin/src/admin_media.py`, llave
`pedidos/<n>/<uuid>/<kind>-<uuid>.(jpg|png)`); inventar llaves sin objeto no mostraría nada.

**Cómo hacerlo:** subir 2–3 imágenes de ejemplo al bucket de evidencias (`MOBILE_EVIDENCE_BUCKET`) con esa forma de llave y
referenciarlas desde `scripts/mock-tarifas/flujo.ts` (`photo_url` de `tbl_returns` y filas `photo_invoice`/`signature` en
`tbl_tracking_evidences`), borrando los objetos junto con `cargar.mjs --reset`.
