# Pendientes de revisión — Bloque 1 (Seguridad y datos falsos)

Sesión: sábado 31-10-2026. Origen: auditoría frontend de Tarifas y Tracking.
Estas pruebas requieren la app corriendo contra el backend real, así que quedan pendientes hasta que el túnel esté abierto.
Los tests automáticos (vitest), eslint y tsc de cada paso ya se corrieron en verde; aquí solo va lo que falta probar a mano.

Estado de los pasos:

| Paso | Hallazgo | Estado del código | Prueba manual |
|---|---|---|---|
| 1 | #16 ErrorBoundary | Hecho | Pendiente |
| 2 | #14 RouteGuard fail-closed | Hecho | Pendiente |
| 3 | #3 `/seed` fuera de producción | Hecho | Pendiente (el build ya se verificó sin túnel, falta solo el 404 en el navegador) |
| 4 | #15 401 vuelve a `/login` | Hecho | Pendiente |
| 5 | #4 API EFLOW con auth | Hecho | Pendiente |
| 6 | #2 sin datos inventados | Hecho | Pendiente |

Actualizar la tabla y marcar las casillas a medida que se prueba.

## Preparación general

1. Levantar el frontend: `pnpm dev` en `TMS AHORA SI/`.
2. Abrir el túnel/VPN y confirmar que el login funciona con un usuario real (no mock). `VITE_MOCK_AUTH` debe estar en `false` en `.env.local`.
3. Tener DevTools abierto (pestañas Console, Network y Application).
4. Tener a mano un usuario Admin y un usuario con pocos permisos (por ejemplo Chofer o Cliente) para el paso 2.

---

## Paso 1 — ErrorBoundary (#16)

Qué cambió: `src/components/feature/ErrorBoundary.tsx`, montado en `src/App.tsx`. Si una pantalla falla al renderizar, o un chunk lazy ya no existe, se muestra una pantalla de recuperación con botón "Recargar" en vez de pantalla en blanco. Sidebar y Header siguen visibles.

### Prueba 1.A — Chunk lazy caído (mensaje "versión nueva")
- [ ] Con la app abierta en `/dashboard`, ir a DevTools → Network → clic derecho sobre cualquier archivo `/assets/*.js` de una página que aún no se ha visitado (por ejemplo la de tracking) → "Block request URL". Si no aparece aún porque no se ha cargado, abrir Network → "Request blocking" y agregar el patrón `*tracking*`.
- [ ] Navegar a esa página desde el menú.
- [ ] Esperado: se ve "Hay una versión nueva de la aplicación" con botón Recargar; el Sidebar y el Header siguen visibles.
- [ ] Quitar el bloqueo y pulsar Recargar. Esperado: la página carga normal.

### Prueba 1.B — El boundary se reinicia al cambiar de ruta
- [ ] Con la pantalla de error de 1.A visible, hacer clic en otro módulo del menú (por ejemplo Zonas).
- [ ] Esperado: carga el otro módulo sin necesidad de recargar.

### Prueba 1.C — Error de render genérico (opcional, solo desarrollo)
- [ ] Editar temporalmente cualquier página y añadir `throw new Error('prueba')` al inicio del componente, guardar y abrirla.
- [ ] Esperado: "Algo salió mal" con botón Recargar y el error en la consola (`[ErrorBoundary]`).
- [ ] Revertir el cambio temporal.

---

## Paso 2 — RouteGuard fail-closed (#14)

Qué cambió: `src/components/feature/RouteGuard.tsx`. Mientras cargan los permisos, una ruta protegida muestra un spinner en vez de montar la página (antes la montaba y la página ya disparaba llamadas a la API antes de saber si el usuario tenía permiso).

### Prueba 2.A — No se montan páginas protegidas mientras cargan los permisos
- [ ] DevTools → Network → throttling "Slow 3G" (o bloquear la URL `*me/permissions*` por unos segundos).
- [ ] Recargar con F5 estando en `/tracking`.
- [ ] Esperado: se ve el spinner; en Network no aparecen llamadas a `/viajes` ni `/choferes` hasta que `me/permissions` responda.
- [ ] Al responder los permisos, la página aparece y empiezan las llamadas.

### Prueba 2.B — Falla la carga de permisos
- [ ] Bloquear la URL `*me/permissions*` (Block request URL) y recargar.
- [ ] Esperado: no se queda el spinner para siempre. Se ve el banner de error de permisos con botón de reintento y, en la ruta protegida, la pantalla "sin acceso".
- [ ] Quitar el bloqueo y pulsar reintentar. Esperado: la página aparece.

### Prueba 2.C — Usuario sin permiso
- [ ] Entrar con un usuario sin `view` en un módulo (por ejemplo Chofer) y escribir a mano la URL `/liquidaciones` o `/proformas`.
- [ ] Esperado: pantalla "sin acceso", sin llamadas a la API de ese módulo en Network.

### Prueba 2.D — Rutas sin módulo siguen funcionando
- [ ] Con cualquier usuario, abrir `/` y `/dashboard`.
- [ ] Esperado: cargan normal.

Nota abierta: `/` no tiene permKey y por eso no exige el permiso `dashboard` (hallazgo #8). No se tocó en este bloque para no cambiar la pantalla de entrada de usuarios sin permiso de dashboard. Decidir si se mapea `/` a `dashboard` o se redirige a `/dashboard`.

---

## Paso 3 — `/seed` fuera de producción (#3)

Qué cambió: `src/router/config.tsx`. La ruta `/seed` y su página solo existen en desarrollo (`import.meta.env.DEV`); en el build de producción cae a la página 404.

Ya verificado sin túnel: se hizo un build de producción en una carpeta temporal y el texto `Ejecutar Seed de Datos` no aparece en ningún archivo generado ni hay un chunk de seed. Test automático: `src/router/config.test.tsx`.

### Prueba 3.A — Build de producción (solo falta ver el 404)
- [ ] Correr `pnpm build` y luego `pnpm preview`.
- [ ] Abrir `/seed` con un usuario logueado. Esperado: página 404.

### Prueba 3.B — Desarrollo
- [ ] Con `pnpm dev`, abrir `/seed`. Esperado: la página sigue disponible para uso interno.

---

## Paso 4 — 401 cierra sesión y vuelve a `/login` (#15)

Qué cambió: `src/lib/supabase.ts` (nueva `expireSession()` y llamada desde `apiFetch`) y `src/lib/tarifas/data/index.ts` (`fetchExpiringSession`). Si cualquier llamada a la API devuelve 401 (token vencido o inválido), se limpia la sesión y se vuelve a `/login`. Aplica a `apiFetch` (incluye Tracking) y al módulo de Tarifas.
Protecciones: un 401 del login no cuenta, varios 401 a la vez cierran una sola vez, un 401 tardío del token viejo no borra una sesión nueva, un 403 no cierra sesión. Tests automáticos: `src/lib/expireSession.test.ts` (9 casos, en verde).

### Prueba 4.A — Token inválido en Tracking
- [ ] Con sesión iniciada, DevTools → Application → Local Storage → clave `tms_session` → editar el valor de `access_token` (cambiar algunos caracteres) sin cerrar sesión.
- [ ] Ir a `/tracking` (espera el siguiente poll de 10 s).
- [ ] Esperado: redirige a `/login` y `tms_session` desaparece de Local Storage.

### Prueba 4.B — Token inválido en Tarifas
- [ ] Iniciar sesión de nuevo, abrir `/reglas-tarifa`, alterar `access_token` como en 4.A y pulsar "Recargar" o cambiar de pestaña interna.
- [ ] Esperado: vuelve a `/login`.

### Prueba 4.C — El login incorrecto no provoca bucle
- [ ] En `/login`, escribir una contraseña incorrecta.
- [ ] Esperado: se muestra "Correo o contraseña incorrectos." y no hay recarga ni redirección extra.

### Prueba 4.D — Varias llamadas con 401 a la vez
- [ ] Repetir 4.A en una pantalla que dispara varias llamadas al abrir (Planificación).
- [ ] Esperado: un solo redirect a `/login`, sin errores repetidos en consola.

### Prueba 4.E — 403 no cierra sesión
- [ ] Con un usuario sin permiso sobre un endpoint (por ejemplo Chofer en `/tracking`), verificar que se muestra el mensaje de acceso denegado y la sesión sigue activa.

---

## Paso 5 — API EFLOW de `server/` con auth (#4)

Qué cambió: `server/index.mjs` exige token en `/api/viajes*` y `/api/catalogos/*` (`/api/health` sigue abierto) y escucha solo en `127.0.0.1` por defecto (variable `EFLOW_API_HOST` para cambiarlo). `src/pages/planificacion/eflow-api.ts` ahora envía el token (y cierra sesión si recibe 401). `vite.config.ts`: el proxy de dev apunta por defecto a `http://127.0.0.1:4000` (antes `localhost`) para coincidir con el host de escucha y evitar problemas IPv4/IPv6 en Windows. Documentado en `server/README.md`.

Ya verificado sin túnel: el middleware se probó aislado con Express y un JWT de prueba (health 200; viajes, pedidos y catálogos 401 sin token o con token malo y 200 con token válido). Tests automáticos nuevos en `eflow-api.test.ts` (cabecera con y sin sesión). Falta probarlo contra el servidor real, que necesita la base de datos (túnel).

### Prueba 5.A — Sin token
- [ ] Levantar `pnpm server` y correr:
  `curl -i http://127.0.0.1:4000/api/viajes?limit=1`
- [ ] Esperado: `401` con `{"error":"no_token"}`.
- [ ] `curl -i http://127.0.0.1:4000/api/health`. Esperado: `200` (sigue abierto).

### Prueba 5.B — Con token
- [ ] Copiar el `access_token` de Local Storage (`tms_session`) y correr:
  `curl -i -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:4000/api/viajes?limit=1`
- [ ] Esperado: `200` con datos.

### Prueba 5.C — No se expone a la red
- [ ] Desde otro equipo de la misma red (o con la IP LAN de esta máquina): `curl http://<IP-LAN>:4000/api/health`.
- [ ] Esperado: no conecta. Si se necesita acceso por LAN, poner `EFLOW_API_HOST=0.0.0.0` en `.env.local`.

### Prueba 5.D — Planificación sigue cargando datos reales
- [ ] Con `pnpm dev` + `pnpm server`, abrir `/oms/planificacion` logueado.
- [ ] Esperado: se ven viajes, rutas, conductores y vehículos reales (no los nombres mock "Viaje 1", "Viaje 2"). En Network, las llamadas a `/api/viajes` y `/api/catalogos/*` llevan el header `Authorization`.

### Prueba 5.E — Aviso para otros consumidores
- [ ] Confirmar si algo más llama a `localhost:4000` directo desde otro dispositivo (por ejemplo la app móvil). Si es así, usar `EFLOW_API_HOST=0.0.0.0` en el `.env.local` de esta máquina.

---

## Paso 6 — Sin datos inventados en producción (#2)

Qué cambió: nuevo `src/pages/planificacion/mock-fallback.ts` (`mockFallbackEnabled()` = `import.meta.env.DEV`). `plan-pedidos-api.ts` y `eflow-api.ts` (pedidos de viaje y catálogos de rutas, vehículos, transportistas y conductores) solo caen a datos de ejemplo en desarrollo; en producción lanzan el error. Un día o lista realmente vacíos devuelven `[]`, nunca ejemplo.
Pantallas: `use-catalogos.ts` ahora devuelve `error` y `guias/page.tsx` muestra un aviso rojo; `use-plan-automatico.ts`, `use-pedidos-dia.ts` y `PlanAutomatico.tsx` capturan el error y muestran un banner con "Reintentar". `use-nuevos-pedidos.ts` (alerta de pedidos nuevos en `PlanEditor`) ya ignoraba errores, así que deja de contar pedidos inventados como "nuevos".
Hallazgo al implementar: `PlanAutomatico` y `use-pedidos-dia` no están montados en ninguna página hoy (código sin uso); las pantallas realmente afectadas son Guías (conductores) y la alerta de nuevos pedidos del editor de planes. Tests automáticos: `src/pages/planificacion/mock-fallback.prod.test.ts` (11 casos, en verde).

### Prueba 6.A — Guías con el catálogo caído (build de producción)
- [ ] `pnpm build` y `pnpm preview` apuntando al backend real (túnel abierto).
- [ ] Abrir `/guias`, luego en DevTools bloquear la URL `*catalogos/conductores*` y recargar.
- [ ] Esperado: aviso rojo "No se pudieron cargar los catálogos…"; las guías se listan sin nombres de conductor inventados.
- [ ] Quitar el bloqueo y recargar. Esperado: el aviso desaparece y salen los conductores reales.

### Prueba 6.B — Alerta de pedidos nuevos sin falsos positivos
- [ ] Abrir un plan en el editor de planificación (build de producción) y bloquear `*planificacion/pedidos*`.
- [ ] Esperado: no aparece el badge de "pedidos nuevos" por culpa de pedidos inventados (antes el mock podía disparar la alerta).
- [ ] Quitar el bloqueo. Esperado: la alerta refleja solo pedidos reales.

### Prueba 6.C — Un día sin pedidos
- [ ] Elegir una fecha sin pedidos reales (por ejemplo, un domingo).
- [ ] Esperado: sin pedidos y sin error, sin direcciones de ejemplo de Costa Rica.

### Prueba 6.D — Desarrollo conserva el comportamiento
- [ ] Con `pnpm dev` y el backend apagado, abrir `/guias` y Planificación.
- [ ] Esperado: sigue funcionando con los datos de ejemplo para poder trabajar offline.

### Prueba 6.E — Decisión pendiente sobre código sin uso
- [ ] Decidir si se eliminan `PlanAutomatico.tsx`, `use-plan-automatico.ts` y `use-pedidos-dia.ts` (no se usan en ninguna ruta) o se vuelven a montar. No se tocó la decisión en este bloque.

---

## Cierre del bloque

- [x] `npx vitest run` completo tras el paso 6: 146 archivos y 1426 tests pasan, 79 omitidos. `tsc` sin errores nuevos (solo los de `@types/node` en tests).
- [x] `npx eslint src`: los 14 errores que salen ya existían y son `no-undef` por `process` en `src/__tests__/db-connectivity.test.ts` y `multi-tenant-isolation.test.ts` (no se tocaron). Ningún archivo modificado en este bloque tiene errores.
- [ ] Revisar esos dos tests de conectividad (declarar `process` o excluirlos de eslint) como tarea aparte.
- [ ] Anotar aquí cualquier prueba que falle, con captura o mensaje exacto, para corregirla antes de pasar al Bloque 2 (pérdida de datos y acciones duplicadas).
