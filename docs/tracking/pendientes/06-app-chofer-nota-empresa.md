# 06 — Nota de la empresa en la app del chofer

**Estado:** pendiente por implementar. El backend móvil (`backend/mobile/src/mobile_api/trips.py`) ya devuelve `company_name` por parada y `customer_name` pasa a ser el punto de entrega, pero la app (`TRACKING_TMS/frontend`) todavía no muestra la empresa.

## Cómo hacerlo
- Agregar `company_name: string | null` al tipo `Stop` de `frontend/src/api/tracking.ts`.
- Mostrarlo como línea secundaria ("Pedido de Cofersa") en `app/index.tsx` y `app/parada/[id].tsx`; textos en `i18n/` (es y en).
- Ajustar `__tests__/screens.test.tsx`.
- Nota: sin punto ni cliente destino, `customer_name` llega vacío y la app ya cae a la dirección (`stop.customer_name ?? stop.address`).
