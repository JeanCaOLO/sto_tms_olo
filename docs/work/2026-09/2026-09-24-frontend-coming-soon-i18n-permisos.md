# 2026-09-24 — Frontend: Coming Soon, multilenguaje ES/EN y matriz de permisos por rol

## What changed
Tres pedidos del usuario, todo el frontend (backend por Claude, ya desplegado):
1. **Coming Soon**: Contratos y Reportes quedan apagados y no navegables en el menú, con
   etiqueta "Coming Soon"; entrar por URL muestra un placeholder en vez del módulo.
2. **Multilenguaje ES/EN** con i18next: español por defecto, selector en el Header que
   recuerda la elección. Traducido el primer lote (menú, DataTable, comunes); el resto de
   pantallas queda como trabajo incremental.
3. **Matriz de permisos por rol**: en Configuración → Roles, un modal con matriz
   módulos × acciones (Ver/Crear/Editar/Eliminar/Exportar) + países visibles. Toda la app
   respeta los permisos: el menú solo lista módulos con `view`, la URL a un módulo sin
   `view` muestra "Sin acceso", y los botones de acción se ocultan sin su permiso.

## Why
El usuario pidió las tres cosas. La matriz de permisos hace que el rol (Operaciones,
Chofer, Cliente) determine qué ve y qué puede hacer cada usuario; los admins conservan todo
por código. Coming Soon evita mostrar módulos a medio hacer. El multilenguaje abre la app a
usuarios en inglés sin recompilar por idioma.

## How
- **Coming Soon**: `comingSoon?` en `MenuItem` (`sidebar-nav-items.ts`); `SidebarNavLink`
  renderiza un `div` apagado con badge; `src/pages/ComingSoon.tsx` para la ruta directa
  (router apunta Contratos/Reportes ahí; las páginas reales siguen en el repo).
- **i18n**: `src/i18n/index.ts` sin `lng` fijo (`fallbackLng: 'es'`, `supportedLngs`).
  Traducciones planas por módulo en `src/i18n/local/{es,en}/*.ts` (glob existente).
  `LanguageSwitcher.tsx` en el Header (el LanguageDetector persiste en localStorage).
  `DataTable` traducido con `t('table.*')`, dejando `searchPlaceholder`/`emptyMessage` como
  override opcional para no romper los call-sites.
- **Permisos**: `usePermissions()` (`src/hooks/usePermissions.tsx`) carga
  `GET /v1/me/permissions` tras login y expone `can(modulo, accion)`; `PermissionsProvider`
  montado en `App.tsx`. Gating: `Sidebar` filtra por `view`; `RouteGuard.tsx` frena la URL
  directa (mapea `pathname → permKey` desde `navItems`); en las pantallas los botones usan
  `can()` (aplicado en Puntos de Entrega como patrón). La matriz vive en
  `configuracion/components/PermissionsModal.tsx` (catalog + rolePermissions + países;
  toggle celda/fila/columna; PUT reemplaza la matriz; 409 de rol admin → bloqueada y toda
  marcada). API en `configuracion/admin/admin-api.ts`.
- **Backend (Claude)**: `sql/15`, `app_modules`/`role_permissions`/`role_countries`,
  endpoints `/v1/me/permissions`, `/v1/admin/permissions/catalog`,
  `GET|PUT /v1/admin/roles/{id}/permissions`, y enforcement en `/api/data`.

## Promoted knowledge
None — el contrato de permisos y el modelo son del backend (ver `backend/README.md`, ya
actualizado por Claude; y `.agents/CANAL.md`). El README del frontend puede mencionar
`usePermissions()`/`can()` y el flujo i18n cuando se estabilice.

## Follow-ups
- [ ] i18n incremental: traducir Configuración, Puntos de Entrega y el resto de pantallas
      módulo por módulo (la infraestructura y el primer lote ya están).
- [ ] Aplicar el gating de botones `can()` en el resto de pantallas (hoy hecho en Puntos de
      Entrega como patrón).
- [ ] Probar en el navegador como usuario no-admin (rol Operaciones o Cliente) que el menú,
      las rutas y los botones se recorten como corresponde.
