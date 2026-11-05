# Tracking móvil — evidencias y devoluciones

## Tipos de evidencia (`logic.EVIDENCE_KINDS`)

| `kind` | Uso |
|---|---|
| `photo_invoice` | Foto de la factura firmada (entrega). |
| `photo_product` | Foto del producto (recolecta). |
| `signature` | Firma digital (entrega y recolecta). |
| `photo_return` | Foto de una devolución contracamión. |

`photo_other` figura en los CHECK de `m04`/`m08` pero el servidor lo **rechaza** (400) porque la web no lo muestra. Ver [pendientes/06](./pendientes/06-photo-other-rechazado.md).

## Flujo de subida (directo a S3)

1. La app captura la foto/firma y la guarda en la carpeta de la app (`lib/capture.ts`: lado máximo 1600 px, JPEG comprimido, sin EXIF) y la encola en el outbox como `evidence`.
2. `POST /paradas/{id}/evidencias/upload-url` `{kind, mime_type, client_id}`: el servidor valida el tipo (JPG o PNG), arma la llave y devuelve un **formulario POST prefirmado** (`url`, `fields`, `key`, `max_bytes`).
3. La app sube el archivo **directo a S3** con ese formulario (`sync/evidence.ts`, límite 5 MB también en el cliente).
4. `POST /paradas/{id}/evidencias` `{kind, key, client_id, captured_at, lat, lng}`: el servidor hace `HEAD` del objeto, valida contenido y tamaño, y guarda la fila en `tbl_tracking_evidences`. Si es `signature` actualiza la columna de firma de la guía; si es `photo_invoice`/`photo_product` actualiza la columna de foto (la guía solo tiene una).

Al entregar, la transición exige que las evidencias ya estén confirmadas (el outbox las envía antes por `depends_on`; ver [offline-y-sincronizacion.md](./offline-y-sincronizacion.md)).

## Reglas del servidor

| Regla | Valor |
|---|---|
| Vigencia del formulario | 300 s (`URL_TTL_SECONDS`) |
| Tamaño | 1 byte a 5 MB (`content-length-range`; `MAX_EVIDENCE_BYTES`) |
| MIME | `image/jpeg`, `image/png` |
| Llave aceptada | Solo la del pedido de **esa** parada y del `kind` indicado (`require_evidence_key`); si no, 400 «Llave de archivo inválida» |
| Archivo no subido / no es imagen / excede tamaño | 400 |

### Llave en S3

`pedidos/<número de pedido>/<id del pedido>/<kind>-<uuid>.<ext>`. Con el `client_id` del teléfono la llave es **siempre la misma**: reintentar una subida (timeout, URL vencida) sobrescribe el mismo objeto en vez de dejar huérfanos. Una parada sin pedido va a `pedidos/sin-pedido/<id de la parada>/`.

Metadatos del objeto: `x-amz-meta-pedido`, `-pedido-id`, `-parada-id`, `-tipo`. La fila guarda pedido, número y **bucket**, así la web firma la lectura en el bucket correcto.

El bucket es propio de la app (`<stack>-evidencias-<cuenta>`, p. ej. `dev-tms-mobile-evidencias-758837481569`; variable `EVIDENCE_BUCKET`).

## Devolución contracamión

La hace el chofer en la parada (la «recolecta» la planifica la web, ver [viaje-y-paradas.md](./viaje-y-paradas.md)). Alimenta `tbl_returns`, que lee la web de Devoluciones.

`POST /paradas/{id}/devoluciones`:

- `items[]` de 1 a **50** artículos (`product_code?`, `product_name`, `quantity` entero 1…100000). También acepta el payload plano de un solo producto (compatibilidad).
- `reason` obligatorio; `notes` opcional; una sola foto para todas las líneas.
- Foto: `photo_key` (llave ya subida) **o** `photo_client_id` (la app sube la foto por el outbox antes y la liga por su `client_id`; si aún no se confirmó → 400 «La foto de la devolución aún no se confirmó»). No pueden venir los dos.
- Una **fila por artículo** con `return_type = 'contracamion'`. Número `DV-<client_id>` (con sufijo `-n` por línea si vino como `items`): reenviar no duplica (200 `duplicate:true`).
- Registra el evento `return` («Devolución: 2 x Producto (motivo)»).
- Solo con el viaje en tránsito (409 si no).

En la app: `queueReturn` (`sync/outbox.ts`), `lib/return-form.ts`, `components/return-button.tsx`, lista de artículos `api/stop-items.ts`. Verificación pendiente en teléfono: [`../pendientes/09`](../pendientes/09-app-devolucion-contracamion.md).
