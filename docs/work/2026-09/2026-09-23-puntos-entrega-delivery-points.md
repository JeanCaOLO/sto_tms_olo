# 2026-09-23 — Puntos de Entrega migrado de `stores` a `delivery_points`

## What changed
Se reescribió por completo la pantalla Puntos de Entrega (`src/pages/tiendas/`) para
que lea y escriba sobre `delivery_points` en lugar de `stores`. La lista muestra cada
punto ligado a su cliente (Cofersa/EPA vía `delivery_points → final_customers →
customers`), su zona/ruta, dirección y estado de geocodificación. El alta/edición/baja
usa los endpoints atómicos del backend en vez de escrituras sueltas por `/api/data`.
Se borró `StoreModal.tsx` y se quitó la importación CSV de esta pantalla.

## Why
Decisión del usuario: los puntos de entrega de cliente pertenecen a `delivery_points`
(el CD/origen se queda en `stores`). El requisito "cada punto ligado a un cliente" lo
cumple el modelo nuevo. La escritura toca tres tablas (`final_customers`, `addresses`,
`delivery_points`), que por `/api/data` serían tres llamadas sueltas sin transacción;
por eso el backend expone endpoints atómicos.

## How
- Lista: query embed `delivery_points(... final_customer:final_customers(...,customer),
  address, zone)` por el shim `supabase.from(...).select(...)`. Paginación cliente
  (`pageSize=25`) para ~1582 filas. Badge geocoding OK/PENDING/FAILED.
- Escritura: `apiFetch` a `POST /v1/delivery-points`, `PATCH /v1/delivery-points/{id}`,
  `DELETE /v1/delivery-points/{id}` (contrato de Claude, ver `.agents/CANAL.md`).
- `delivery-point-payload.ts` arma el body (crear vs editar; lat/lon juntas o ninguna),
  con `delivery-point-payload.test.ts` (vitest, 4 casos).
- Archivos: `src/pages/tiendas/page.tsx`, `components/DeliveryPointModal.tsx`,
  `delivery-point-payload.ts` (+ test); borrado `components/StoreModal.tsx`.

## Promoted knowledge
None — el contrato de endpoints vive en `.agents/CANAL.md` (coordinación con backend)
y el modelo de datos es propiedad del backend (Claude).

## Follow-ups
- [ ] Probar la lista con datos reales cuando Claude confirme la ingesta de los 1576
      puntos de Cofersa; luego borrar `.tmp-claude/cofersa-puntos-entrega.csv` y su
      entrada en `.gitignore`.
