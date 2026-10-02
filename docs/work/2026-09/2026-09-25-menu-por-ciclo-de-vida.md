# 2026-09-25 — Menú reordenado por el ciclo de vida del pedido

## What changed
El menú lateral pasó de una lista plana (Dashboard, Pedidos, Devoluciones, Guías,
Planificación, Tracking, Tarifas, OMS, Catálogos, Contratos, Reportes, Auditoría,
Configuración) a estar agrupado en cuatro secciones con encabezado que siguen el
flujo logístico:
1. **Dashboard** (visión general, sin encabezado).
2. **Gestión de la Demanda** — OMS, Pedidos.
3. **Ejecución Operativa** — Planificación, Guías de Despacho, Tracking, Devoluciones.
4. **Gestión Financiera y Comercial** — Tarifas, Contratos.
5. **Administración y Análisis** — Reportes, Catálogos, Auditoría del Sistema, Configuración.

No cambió ninguna ruta, permiso (`permKey`) ni módulo: es puramente orden y
agrupación visual.

## Why
Propuesta del usuario (basada en una captura de referencia): alinear la arquitectura
de información con el ciclo de vida del pedido — el "qué" (OMS/Pedidos) antes del
"cómo" (Planificación y ejecución), luego finanzas y por último administración — para
que el menú se lea de arriba hacia abajo como una línea de ensamblaje y baje la carga
cognitiva.

## How
- Nuevo tipo `MenuSection` (encabezado no navegable) en `sidebar-nav-items.ts` +
  helper `isSection`; `navItems` reordenado con las cuatro secciones. OMS y Catálogos
  se extrajeron a constantes para legibilidad.
- `Sidebar.tsx` renderiza el encabezado (rótulo en mayúsculas cuando está expandido;
  un separador cuando está colapsado) y **oculta una sección que quede sin ítems
  visibles** tras el filtrado por permisos.
- `module-routes.ts` (mapa path→permKey compartido) ignora las secciones.
- i18n de los cuatro encabezados en `menu.ts` (ES/EN): `menu.section{Demand,Execution,
  Finance,Admin}`.

## Promoted knowledge
El orden del menú vive solo en `navItems`; agregar un módulo es meterlo en la sección
que corresponda. Las secciones son cosméticas (no afectan rutas ni permisos).

## Follow-ups
- [ ] None.
