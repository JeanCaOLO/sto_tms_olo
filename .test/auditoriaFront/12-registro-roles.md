# Registro — Fase 3 (roles Liquidador y Desarrollador)

Fecha: 2026-10-08.

- Nuevo `sql/26_roles_liquidador_desarrollador.sql` (idempotente; **NO ejecutado contra Aurora**, requiere aprobación explícita; alternativa: crear los roles en Configuración → Roles).
  - **Liquidador**: `tarifas` view/create/edit/export. Sin `tarifas.config` → no ve Costos Flota ni Reglas de Tarifa, y siempre usa la vista simple (`useLiquidadorVista`: `puedeConfigurar = can('tarifas.config','view')`).
  - **Desarrollador**: `tarifas` y `tarifas.config` con view/create/edit/delete/export. No recibe `configuracion` ni se agrega a `ADMIN_ROLES`.
  - El seed solo se aplica si el rol no tiene filas (no pisa lo editado), igual que `sql/15`.
- Sin cambios de código de permisos: el mecanismo ya existía (`permKey` del menú + `RouteGuard` + `tarifas.config` exigido por el backend para escribir). Probador y Bitácora viven dentro de Reglas (`tarifas.config`), por eso no hizo falta una clave nueva ni gating por pestaña.
- Prueba nueva `src/components/feature/sidebar-nav-items.test.ts`: Liquidador ve solo Liquidaciones; Desarrollador ve Liquidaciones, Costos Flota y Reglas de Tarifa.
- Pendiente de operación: aplicar el SQL (o crear los roles por UI) y asignarlos a usuarios.
