# 2026-09-24 — Gating de acciones con permisos en todos los catálogos + i18n de Puntos de Entrega

Continuación de `2026-09-24-frontend-coming-soon-i18n-permisos.md`, que dejó dos
follow-ups abiertos: aplicar `can()` en los botones del resto de módulos (hasta
entonces solo Puntos de Entrega) y seguir el i18n por tandas. Esta entrada cierra
el primero y avanza el segundo.

## What changed
- **Gating de acciones en las 8 pantallas de catálogo.** Nuevo hook
  `useModulePermissions(modulo)` → `{ canCreate, canEdit, canDelete, canExport }`.
  Aplicado en Países, Zonas, Transportistas, Vehículos (vehículos + tipos),
  Conductores, Licencias, Clientes y Puntos de Entrega: el botón Nuevo / Importar
  CSV se oculta sin `create`; Editar/Eliminar por fila se ocultan sin `edit`/`delete`
  (la columna de acciones desaparece si no queda ninguna). Puntos de Entrega migró
  del `can()` inline a este hook.
- **i18n completo de Puntos de Entrega** (ES/EN): título, subtítulo, KPIs, las seis
  columnas, badges de geocodificación y estado, buscador, mensaje vacío y botón Nuevo.

## Why
El backend ya rechaza (403) las escrituras sin permiso; el frontend debe ocultar
lo que el rol no puede hacer, para que la UI sea coherente con lo que el usuario
puede ejecutar (no mostrar botones que fallarían). Un hook compartido evita repetir
la misma trecena de `can()` en cada pantalla y mantiene el criterio en un solo lugar.

## How
- `src/hooks/use-module-permissions.ts` envuelve `usePermissions().can()`.
- Cada `pages/<catalogo>/page.tsx` importa el hook, deriva los flags y condiciona
  el header (Nuevo/CSV) y el `actions` del `DataTable`.
- i18n: `src/i18n/local/{es,en}/deliveryPoints.ts` (glob existente) + `useTranslation`
  en `tiendas/page.tsx`; `GEO_CONFIG` pasó de `label` fijo a `key` i18n.

## Promoted knowledge
None nuevo — el modelo de permisos vive en `backend/README.md` y `.agents/CANAL.md`.
Cuando el i18n se estabilice, el README del frontend debería documentar
`useModulePermissions` y el flujo de traducción como el patrón a seguir.

## Follow-ups
- [ ] i18n del resto de pantallas operativas (dashboard, pedidos, devoluciones,
      guias, planificacion, tracking, tarifas, oms.*, configuracion) y los catálogos
      que ya tienen gating pero aún no i18n. Infra y patrón listos; es cablear
      `useTranslation` pantalla por pantalla.
- [ ] `can()` en pantallas operativas con acciones mutables (devoluciones cambia
      estado, liquidaciones aprueba/paga) si corresponde.
