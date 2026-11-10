# 04 — Push remoto y recordatorio de factura

**Estado:** idea.

## Qué falta

La app no tiene notificaciones push (no hay `expo-notifications`, FCM ni APNs). Solo existe el permiso `POST_NOTIFICATIONS` y la notificación fija del servicio GPS. El blueprint proponía un recordatorio local de la factura al llegar; `lib/arrival.ts` solo vibra, no avisa de la factura.

## Por qué

- El servidor no puede avisar al chofer (replanificación, parada cancelada, mensaje de Planificación).
- Complementa el correo de aviso a la siguiente parada ([`../../pendientes/01`](../../pendientes/01-correo-aviso-siguiente-parada.md)), que va al cliente, no al chofer.

## Cómo hacerlo

1. Instalar con `npx expo install expo-notifications` (revisar la versión de docs del SDK 58 antes).
2. Guardar el token del dispositivo (tabla nueva, p. ej. `mobile_push_tokens` ligada a `app_user_id` + `device_id`) en el login/refresh.
3. Backend: un publicador (Lambda) que envíe por el servicio de push de Expo o FCM/APNs; no mezclarlo con `backend/mobile` hasta decidir dueño.
4. Recordatorio de factura: notificación **local** programada desde `useArrival` al detectar la llegada (`lib/arrival.ts`), sin servidor.
