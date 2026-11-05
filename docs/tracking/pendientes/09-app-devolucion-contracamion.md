# 09 — App del chofer: verificar la devolución contracamión

**Estado:** pendiente por verificar (código y pruebas unitarias listos; no probado en dispositivo ni contra el sandbox).

## Qué falta
- Probar en teléfono real: formulario (`TRACKING_TMS/frontend/src/components/return-button.tsx`), cámara, envío offline y reenvío (foto → devolución por el outbox, ligadas por `photo_client_id`).
- Los artículos del pedido se piden al abrir el formulario (`GET /paradas/{id}/articulos`, caché en `kv`). Sin señal y sin caché la lista sale vacía y el chofer escribe a mano. Idea: precargar los artículos de todas las paradas al refrescar `mi-viaje`.
- En web la foto vive en memoria: si se recarga la página antes de enviar, hay que tomarla otra vez (igual que las evidencias).
- Tracking web no muestra la evidencia `photo_return` (`backend/tracking/src/tracking_logic.py` no la lista a propósito: se ve en Devoluciones). Si Tracking debe mostrarla, agregarla a `EVIDENCE_KINDS` y `EVIDENCE_KINDS_SQL`.
- Requiere aplicar m08 y desplegar: ver `docs/devoluciones/pendientes/01-despliegue-contracamion.md`.

## Por qué
Mobile y web comparten BD; sin m08 la subida de la foto falla en el servidor.
