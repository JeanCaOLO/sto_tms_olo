# 2026-09-23 — Catálogos: Zonas (ex-Rutas), fix CSV transportistas, CRUD Licencias

## What changed

Tres cambios de frontend en catálogos, a pedido del negocio.

### 1. Catálogo de "Rutas" → "Zonas"
- Nuevo módulo `src/pages/zonas/` (`page.tsx` + `components/ZonaModal.tsx`). Es un catálogo CRUD sobre la tabla `route_types` (lo que antes se llamaba "tipo de ruta"), presentado como **Zona ligada a un país**. Usa el `DeleteConfirmModal` genérico de `paises/`.
- Borrado el viejo `src/pages/rutas/` completo: el tab "Rutas" y sus modales (`RouteModal`, `RouteTypeModal`, `RouteTypeDeleteModal`). La entidad operativa `routes` **NO se tocó** — sigue viva y la usan tracking, liquidaciones, guías, reportes y dashboard; solo dejó de gestionarse desde este catálogo.
- Router: `/rutas` → `/zonas` (+ nueva `/licencias`). Sidebar: "Rutas" → "Zonas".

### 2. Fix del "Importar CSV" de Transportistas
- El botón usaba `<Button>` sin `variant` (quedaba `primary` teal) más un `className` que peleaba con las clases del variant → se veía mal. Ahora `variant="secondary"` + icono `ri-file-upload-line`, igual que el resto del sistema (patrón de Países).
- Bug funcional corregido: las props pasadas a `CsvImportModal` no coincidían con su interfaz (`onSuccess` en vez de `onImportComplete`, `fields` con `name` en vez de `key`, faltaba `organizationId`). La importación estaba rota, no solo fea. Ahora usa `useAuth` para el `organizationId`.

### 3. CRUD de Licencias de conducir
- Nuevo módulo `src/pages/licencias/` (`page.tsx` + `components/LicenciaModal.tsx`) sobre la tabla `driver_license_types` (ya existía en backend y estaba whitelisted, sembrada a Costa Rica). Patrón Países, con selector de país.
- El `DriverModal` de Conductores ya leía `driver_license_types` para su select "Tipo de Licencia", así que este catálogo lo alimenta automáticamente.

## Why

Pedido del negocio (2026-09-23): el catálogo de rutas pasa a ser de Zonas (ligadas a país; todas las actuales de Costa Rica), se elimina la gestión de "rutas" de ese catálogo; el botón CSV de transportistas tenía los estilos mal; y el formulario de conductores pedía un tipo de licencia que no tenía catálogo propio con CRUD.

## Reparto Kiro/Claude

Todo lo anterior es frontend (Kiro). Se le pidió a Claude (backend) por `.agents/CANAL.md`: agregar columna `country_id` (FK a `countries`) a `route_types` y whitelistearla, para que las Zonas se liguen a país en datos reales. El front ya escribe/lee `country_id`; funciona en cuanto la columna exista.

## Verificación

- `npm run type-check`: 0 errores en los módulos nuevos/tocados (zonas, licencias, transportistas). El total del repo bajó de 34 a 20 errores preexistentes, porque el `pages/rutas/` borrado arrastraba varios (`variant="outline"`, que no existe en el `Button` base).
- Dev server responde 200.

## Actualización — alineado con la migración de Claude (misma jornada)

Claude entregó la BD (`sql/09_zonas_y_licencias.sql`, `sql/10_licencias_costa_rica.sql`, aplicadas). El frontend se alineó a ese esquema real:
- `route_types` **se renombró a `zones`** (mismas filas/ids). El catálogo de Zonas ahora usa `from('zones')` con embed `country:countries(name)`; el ZonaModal escribe `code` (único por país, código de ruta WMS) y `country_id` (obligatorio, 409 si falta). Ya no depende de la vista de compatibilidad `route_types`.
- Licencias: `driver_license_types` con `code` único por país y columna `description` (agregada al modal). Datos CR actualizados por Claude a categorías oficiales A1–A3/B1–B4/C1/C2 (se borraron B/A4/A5).
- `routes` = los VIAJES (aclaración de Claude): confirmado que no se toca; solo se quitó la pantalla del catálogo.

## Follow-ups

- [ ] Probar Zonas y Licencias contra la API real (login `admin@ologistics.com` + túnel Aurora) — hecho hasta aquí con type-check; falta corrida con datos reales.
- [ ] Claude puede retirar la vista de compatibilidad `route_types` en lo que respecta a este catálogo (ya no la uso); confirmar antes que Tarifas/Liquidaciones/Tracking no la sigan necesitando por `route_type_id`.
- [ ] Bug preexistente no abordado aquí: `variant="outline"` se usa en otros modales del repo (devoluciones, etc.) y no existe en `Button`; quedan ~20 errores de type-check de esa y otras deudas previas, ajenas a este cambio.
