# 2026-09-24 — Frontend de la bitácora de auditoría

Backend y BD por Claude (`sql/16`, triggers en `audit.events`, endpoints; ADR
`docs/decisions/0003-bitacora-auditoria.md`). Esta entrada cubre el frontend.

## What changed
- **Pantalla "Auditoría del Sistema"** (`/auditoria`, permKey `auditoria`, en el menú
  antes de Configuración — distinta de OMS → Auditoría): lista de eventos más reciente
  primero, con badges de acción traducidos, módulo traducido, actor (usuario / Sistema +
  source / anónimo) y fecha-hora en la zona y locale del idioma. Filtros (rango de
  fechas con hoy por defecto, email, acción, tabla, tipo de actor), paginación por
  cursor ("Cargar más" → `before_id`), export a Excel de lo cargado (que a su vez se
  audita), y modal de detalle con la tabla campo / antes / después, request/ip/user-agent
  y metadata. Requiere `auditoria.view`; sin permiso → "Sin acceso".
- **Eventos del navegador** (`POST /v1/audit/events`, fire-and-forget): `view` al entrar
  a un módulo (en `RouteGuard`, una vez por navegación permitida); `export` desde la
  pantalla de auditoría. El `DataTable` expone un `onExport?(rows)` opcional para que
  cualquier listado audite su exportación sin acoplar el componente.
- **i18n ES/EN** de toda la pantalla, filtros, badges de acción y modal.

## Why
Pedido del usuario: registrar cada acción de usuario y cada cambio automático, con
fecha y hora, para control y auditoría. El backend ya audita todas las escrituras por
trigger; el frontend aporta la consola de lectura y los eventos que solo el navegador
conoce (navegación, exportaciones).

## How
- `pages/auditoria/audit-api.ts` (lectura por cursor + `postAuditEvent` fire-and-forget),
  `audit-labels.ts` (acción→label/variante, actor→label, module_key→clave de menú, con
  test), `page.tsx` (lista + export), `components/AuditFiltersBar.tsx` y
  `components/AuditDetailModal.tsx`. Ruta y menú en `router/config.tsx` y
  `sidebar-nav-items.ts`. `RouteGuard` emite el `view`. i18n en `i18n/local/{es,en}/audit.ts`
  y clave `menu.auditoria`.

## Promoted knowledge
El `view` de navegación vive en `RouteGuard` (un solo lugar). Para auditar una
exportación en cualquier listado nuevo, pasar `onExport` al `DataTable`.

## Follow-ups
- [ ] `print` / `download` en guías y documentos de contratos cuando esas acciones
      existan en la UI (hoy no hay botón de imprimir/descargar cableado). `export` con
      `onExport` del DataTable se puede sumar por pantalla cuando se quiera trazar cada
      listado, no solo la propia auditoría.
