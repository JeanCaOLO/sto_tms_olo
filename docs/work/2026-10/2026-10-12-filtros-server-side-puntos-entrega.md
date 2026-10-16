# 2026-10-12 — Filtros server-side (país/almacén/cliente + búsqueda) en Puntos de Entrega

> Continúa `2026-10-12-paginacion-servidor-puntos-entrega.md`. Tras mover la
> paginación al servidor, el usuario reportó que los filtros de `/tiendas` no
> funcionaban (los de columna del `DataTable` solo ven la página de 50).
> Claude dejó el backend listo (filtros por tabla padre multinivel en
> `/api/data`, almacenes VE reales en `sql/33`); esta entrada cubre **mi parte**
> (frontend), que cableó esos filtros.

## What changed

- `src/pages/tiendas/page.tsx`: filtros **server-side** tomando el contexto
  global `useOperationalContext()` (país → almacén → cliente) + búsqueda
  server-side con debounce. Vuelve a página 1 al cambiar cualquier
  filtro/contexto/búsqueda. Se quitaron los filtros de columna en memoria.
- `src/lib/supabase.ts`: nuevo `.ilike(column, pattern)` (admite `"a|b"` para OR
  entre columnas, contrato de Claude). Se quitó el `ponytail:` de `range()`
  (el backend ya respeta `offset`).
- `src/components/base/DataTable.tsx`: nueva prop `hideSearch` (aditiva, default
  false) para ocultar el buscador interno en memoria cuando la pantalla busca
  del lado del servidor. No cambia el comportamiento de ningún otro call-site.
- `src/i18n/local/{es,en}/deliveryPoints.ts`: placeholder de búsqueda ajustado
  a búsqueda global por nombre/código.

## Why

Con paginación servidor, el buscador y los filtros por columna del `DataTable`
solo operan sobre las ~50 filas cargadas, así que "ver solo un país" no servía.
El usuario quería filtrar por país (y de ahí bajar a almacén y cliente). El
selector país→almacén→cliente del header (`useOperationalContext`) ya existe;
reusarlo evita inventar selectores nuevos y le da al usuario el control que ya
conoce.

## How — contrato de filtro (de Claude, canal 2026-10-12)

Columnas de filtro por **tabla padre** (nombre de la tabla, no el alias del
embed), un/varios niveles por la FK:

| Filtro | Columna |
|---|---|
| País | `final_customers.customers.country_id` |
| Almacén | `final_customers.customers.warehouse_id` |
| Cliente | `final_customers.customer_id` |
| Búsqueda | `name\|external_code` con `ilike` |

Se combinan (AND) con `range()` + `count:'exact'`; el `count` respeta los
filtros, así el "Total" y el "X de N" son del conjunto filtrado.

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/pages/tiendas`: **4/4 verdes**.
- Nota: la construcción de filtros es declarativa (encadenar `.eq()`
  condicionales); los nombres de columna están confirmados por Claude y el
  backend responde 400 si están mal. Prueba de punta a punta: al desplegar al
  sandbox con `sql/33` (almacenes VE), el selector del header filtra la lista.

## Follow-ups

- [ ] Claude: desplegar al sandbox junto con el backend de `sql/33` (según el
      canal, se sube todo junto).
- [ ] Opcional: KPIs "Activos/Geocodificados/Clientes" como total filtrado
      (hoy "en esta página") usando `head:true` + el mismo filtro.
- [ ] Opcional: export del total filtrado (hoy exporta la página); necesita un
      endpoint de export del backend.
