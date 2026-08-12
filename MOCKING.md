# ⚠️ Estado MOCK de esta rama (`jesus-planificacion`)

Este documento existe para que nadie confunda "funciona en mi máquina" con "está conectado a datos reales". **Todo lo listado aquí es temporal**, para poder prototipar el módulo de Planificación sin depender de un login funcional ni de escrituras a Supabase (bloqueadas por RLS mientras no haya un usuario real con `app_users` creado — ver contexto abajo).

## Por qué existe esto

1. Los accesos de demostración del login (`jalvarez@ologistics.com`, etc.) no funcionan — no son cuentas reales en este Supabase.
2. Crear un usuario real de prueba requiere confirmación de correo + que un Admin/SuperUsuario ya existente lo dé de alta en `app_users` (política RLS: no puedes insertarte tu propio perfil). No hay ninguna cuenta así disponible ahora mismo en esta rama.
3. La tabla `route_types` tiene una política RLS de lectura más estricta que el resto de catálogos y devuelve 0 filas sin sesión real.
4. Por lo anterior, cualquier escritura (crear ruta, etc.) falla con `new row violates row-level security policy` sin importar qué tan "logueada" se sienta la UI.

## Qué está mockeado, dónde, y cómo quitarlo

| Qué | Archivo | Cómo se activa | Qué hace | Cómo quitarlo cuando haya DB real |
|---|---|---|---|---|
| **Bypass de login** | `src/lib/mock-auth.ts`, usado en `src/hooks/useAuth.tsx` | Variable `VITE_MOCK_AUTH="true"` en `.env.local` (no versionado) | Salta Supabase Auth por completo; inyecta una sesión falsa con rol SuperUsuario y `organization_id` de la organización real "Transportes OLO" (`11111111-1111-1111-1111-111111111111`) | Borra `VITE_MOCK_AUTH` de tu `.env.local` (o ponlo en `false`). El código de `useAuth.tsx` vuelve a usar Supabase Auth real automáticamente — no hay que tocar nada más. |
| **Catálogo de tipos de ruta** | `src/pages/planificacion/fallback-rutas.ts`, usado en `catalogos-api.ts` | Automático: si `route_types` devuelve 0 filas (por RLS), cae a este fallback | 5 entradas con nombres descriptivos (GAM Norte/Sur/Centro/Oriente + Rural). Las 2 primeras usan los IDs **reales** que ya usan/usaban `orders` existentes (`0444c597-...`, `ac5f5e85-...`); las otras 3 son IDs sintéticos | Cuando `route_types` sea legible (RLS resuelto o sesión real), `catalogos-api.ts` deja de usar el fallback automáticamente (usa datos reales si `rutasRes.data.length > 0`). Se puede borrar `fallback-rutas.ts` y su import una vez confirmado. |
| **Pedidos por ruta** | `src/pages/planificacion/fallback-pedidos.ts`, usado en `pedidos-api.ts` | Automático: si la consulta real a `orders` (`route_type_id` + `status=pending`) devuelve 0 filas, cae a este fallback | 8 pedidos sintéticos con direcciones reales del GAM (Costa Rica) — mismos 8 sin importar la ruta elegida, para que **cualquier** ruta (real o mock) siempre tenga con qué armar un viaje, sin depender de que la base compartida tenga pedidos `pending` vivos | Cuando la consulta real a `orders` devuelva filas (datos de prueba nuevos o RLS resuelto), `pedidos-api.ts` deja de usar el fallback automáticamente. Se puede borrar `fallback-pedidos.ts` y su import una vez confirmado. |
| **Generación de rutas (escritura)** | `src/pages/planificacion/generar-ruta-mock.ts`, `src/lib/mock-store.ts`, usado en `use-generar-ruta.ts` | Automático cuando `MOCK_AUTH_ENABLED` es true | En vez de escribir en `routes`/`dispatch_guides`/`orders` de Supabase (que fallaría por RLS), guarda la ruta generada en `localStorage` del navegador | En `use-generar-ruta.ts`, la rama `MOCK_AUTH_ENABLED ? generarRutaMock(...) : await generarRutaEnDb(...)` ya usa el camino real automáticamente en cuanto `VITE_MOCK_AUTH` esté apagado. `generar-ruta-mock.ts` y `mock-store.ts` se pueden borrar cuando ya no se necesiten. |
| **Vista "Rutas Generadas"** | `src/pages/planificacion/components/RutasGeneradas.tsx`, `use-rutas-generadas.ts` | Lee siempre de `localStorage` vía `generar-ruta-mock.ts` | Lista las rutas creadas en modo mock (no existe endpoint real equivalente todavía — el sistema real no tenía una pantalla de "rutas generadas") | Cuando exista una tabla `routes` consultable, cambiar `use-rutas-generadas.ts` para leer de Supabase en vez de `localStorage`. |

## ⚠️ La base de datos es compartida con el equipo — por eso los pedidos también son mock

`fallback-rutas.ts` originalmente apuntaba solo a 2 `route_type_id` reales con pedidos `pending` de verdad. **El resto del equipo trabaja contra esta misma base de datos**: en la práctica, esos pedidos pasaron a `Asignado` (alguien generó una ruta real) y el 2026-08-12 se confirmó que la tabla `orders` completa tiene **0 pedidos `pending`** en todo el proyecto, no solo en esas 2 rutas. Por eso se agregó `fallback-pedidos.ts`: si la consulta real de pedidos de una ruta devuelve 0 filas (lo normal ahora mismo), se usan 8 pedidos sintéticos — así el flujo completo (elegir ruta → ver pedidos → armar ruta → generar) funciona siempre, sin depender de qué tan poblada esté la base compartida en ese momento.

## Limitaciones conocidas del modo mock (no son bugs)

- Las rutas "generadas" en mock **no marcan los pedidos como asignados** en la base real — la próxima vez que abras "Nueva Ruta" y selecciones la misma ruta, esos mismos pedidos van a volver a aparecer como disponibles. Es esperado: no hay escritura real.
- Las rutas mock viven **solo en tu navegador** (`localStorage`) — no las ve nadie más del equipo, se pierden si limpias el storage del sitio.
- Los 8 pedidos de `fallback-pedidos.ts` son **siempre los mismos**, sin importar qué ruta elijas — es un solo dataset de ejemplo, no uno distinto por ruta. Suficiente para probar el flujo, no para probar reglas de negocio específicas por zona.

## Checklist para cuando haya base de datos real conectada

- [ ] Confirmar que el login real funciona (usuario + `app_users` creado por un Admin, o RLS ajustado).
- [ ] Quitar `VITE_MOCK_AUTH` de todos los `.env.local` del equipo.
- [ ] Confirmar que `route_types` es legible con sesión real; borrar `fallback-rutas.ts` y su uso en `catalogos-api.ts`.
- [ ] Confirmar que `orders` tiene pedidos `pending` reales de nuevo; borrar `fallback-pedidos.ts` y su uso en `pedidos-api.ts`.
- [ ] Borrar `generar-ruta-mock.ts`, `mock-store.ts`, y la rama `MOCK_AUTH_ENABLED` en `use-generar-ruta.ts`.
- [ ] Decidir si "Rutas Generadas" pasa a leer de una tabla real `routes` o se elimina si no aplica al flujo real.
- [ ] Borrar este archivo (`MOCKING.md`) o dejarlo como registro histórico en `docs/work/`.
