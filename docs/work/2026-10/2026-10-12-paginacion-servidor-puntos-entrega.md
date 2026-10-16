# 2026-10-12 — Paginación servidor en Puntos de Entrega (`/tiendas`)

> Continúa el work del mismo día
> `2026-10-12-preparacion-puntos-entrega-ve-para-carga.md`: tras cargar los
> 8723 puntos VE, la lista pasó de ~1581 a ~10 304 filas y la carga del
> frontend se volvió pesada. Esta entrada cubre **mi parte** (frontend); el
> soporte de `offset` en el backend `/api/data` queda pendiente de Claude
> (dueño de backend), pedido por el canal.

## What changed

- `src/lib/supabase.ts`: nuevo método `.range(from, to)` (estilo supabase-js)
  y param `offset` en el `QueryBuilder`. Cambio aditivo, no afecta call-sites
  existentes.
- `src/pages/tiendas/page.tsx`: la lista pasó de traer todos los puntos de una
  vez (y paginar en memoria con `DataTable`) a **paginación servidor**: pide
  solo la página con `offset`+`limit`+`count:'exact'`, con controles propios
  (tamaño 25/50/100, navegación por página, "X–Y de N" con el total real).
  KPI total usa el `count` real; los otros tres se etiquetan "en esta página".
  Spinner de pantalla completa solo en la primera carga.
- `src/i18n/local/{es,en}/deliveryPoints.ts`: clave `inThisPage` y placeholder
  de búsqueda ajustado a "en esta página" (honesto: la búsqueda del DataTable
  opera sobre la página cargada, no sobre las 10k filas).

## Why

Claude cargó 8723 puntos de entrega de Venezuela (Febeca/Sillaca/Beval) a
Aurora; con Cofersa/EPA el total llegó a ~10 304. La pantalla `/tiendas`
cargaba todo del lado del cliente (`.select(LIST_SELECT).order('name')` sin
límite) con embeds anidados, y el `DataTable` paginaba en memoria. A ese
volumen la respuesta es demasiado grande por carga. El propio RESULT de Claude
lo marcó como riesgo de rendimiento.

## How — decisiones de diseño

- **No se tocó `DataTable`** (componente compartido por muchas pantallas):
  convertir su paginación interna a "controlada desde afuera" habría sido un
  refactor amplio y arriesgado. La paginación servidor vive en la pantalla; a
  `DataTable` se le pasa solo la página actual (sin `pageSize`), conservando
  búsqueda/filtros/orden/export sobre las filas visibles.
- **El cliente `supabase` ya soportaba casi todo** (`limit`, `count:'exact'`,
  filtros, `order`); solo faltaba `offset`. Se agregó como pieza reutilizable.
- **Degradación honesta**: con paginación servidor la búsqueda global, los
  filtros por columna y el export "todo" del `DataTable` solo ven la página
  cargada. Se etiquetó así en la UI en vez de aparentar que cubren el total.
  La búsqueda/filtro server-side por compañía queda para cuando Claude confirme
  el camino (ver follow-ups).

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/pages/tiendas`: **4/4 verdes** (payload del punto de entrega).

## Known ceiling (ponytail)

- La paginación **cambia de página de verdad solo cuando el backend `/api/data`
  respete `offset`**. Verificado leyendo `server/tms-routes.mjs` y
  `backend/data/src/app.py`: hoy parsean `select/filters/order/limit/count`
  pero **no `offset`**. El front ya manda `offset`; hasta que Claude lo agregue,
  el backend devuelve siempre la primera página. Marcado con `ponytail:` en
  `range()` y pedido en el canal (2026-10-12).

## Follow-ups

- [ ] Claude: agregar `offset` al GET genérico `/api/data/<tabla>` y confirmar
      que `count:'exact'` + `limit` + `offset` devuelve el total sin paginar.
- [ ] Claude: definir cómo filtrar `delivery_points` por compañía server-side
      (relación anidada `final_customer.customer_id` vs. `customer_id`
      denormalizado). Con eso Kiro cablea el selector de compañía (cambio chico).
- [ ] Opcional: `ilike` server-side para búsqueda por `name`/`external_code`, y
      endpoint de export completo si se quiere exportar más que la página.
