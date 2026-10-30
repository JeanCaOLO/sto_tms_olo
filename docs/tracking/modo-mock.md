# Modo mock (sin túnel)

Mientras no hay túnel a Aurora se trabaja en modo mock. La web usa **el mismo cliente** que en producción (`src/pages/tracking/api.ts`); solo cambia el transporte: en vez de `apiFetch` responde un backend simulado en memoria con el **mismo contrato** ([contrato-api-v2.md](./contrato-api-v2.md)). Así un error de contrato aparece antes de conectar el túnel (mismo enfoque que el tarifador).

## Cómo correrlo

1. En `.env.local`: `VITE_MOCK_AUTH=true`.
2. `npm run dev` y entrar con cualquier correo y clave (login mock).
3. Abrir **Tracking** desde el menú.

Solo funciona en desarrollo: `MOCK_AUTH_ENABLED` exige `import.meta.env.DEV`, así que un build desplegado nunca carga el mock.

| Pieza | Archivo |
|---|---|
| Activación | `src/main.tsx` importa `mock/installTrackingMock.ts` si `MOCK_AUTH_ENABLED` |
| Transporte simulado | `mock/fakeTrackingBackend.ts`: rutas `GET /viajes`, `/viajes/{id}`, `/planificados`, `POST /viajes/{id}/iniciar`; sobre `{data}/{error}` y códigos como el backend |
| Simulación | `mock/sim.ts`: viajes en memoria, reloj acelerado, reglas iguales a `tracking_logic.py` |
| Escenarios | `data/viajes-demo.json` (tiempos relativos a "ahora", en minutos) |

## Qué hace la simulación

- **Reloj propio**: velocidad 0,5× a 60× y pausa (controles arriba a la derecha). "Hace X" usa ese reloj.
- **Camiones por calles**: al arrancar pide a OSRM la ruta hasta las paradas pendientes (y rehace por calles el tramo ya recorrido del escenario). Las peticiones van de a una (el OSRM público admite ~1/s). Si OSRM no responde, el camión va en línea recta: la simulación nunca se bloquea.
- Al llegar a una parada la marca entregada con factura + firma; con la última, el camión se detiene y el viaje sigue activo ("Sin paradas pendientes"): en real lo termina Planificación. En el mock solo aparecen cerrados los escenarios completados del JSON.
- Refresco cada 3 s (en real, 15 s).
- **Iniciar viaje (pruebas)**: inicia los planes de `planned` del JSON.
- **Simular cierre de Planificación**: en el panel de un viaje activo, un recuadro "Pruebas (mock)" con *Completar* / *Cancelar* simula que Planificación termina el viaje (`mock/CierrePlanificacion.tsx` → `simPlanClose`). Sirve para ver cómo Tracking muestra un viaje terminado (sale de Activos, Completado/Anulado). En real no existe: se hace en Planificación.
- Reiniciar (⟲) vuelve al estado inicial. El estado no persiste al recargar.

## Escenarios de `viajes-demo.json`

| Viaje | País | Qué muestra |
|---|---|---|
| VJ-DEMO-CR-01 | CR | En ruta, en movimiento, a tiempo |
| VJ-DEMO-CR-02 | CR | Retrasado (40 min) |
| VJ-DEMO-CR-03 | CR | Sin señal (45 min) |
| VJ-DEMO-CR-04 | CR | Por salir (en la sede) |
| VJ-DEMO-CR-07 | CR | Por salir **sin GPS todavía** (señal `none`, sin alerta) |
| VJ-DEMO-CR-05 | CR | Detenido 28 min |
| VJ-DEMO-CR-06 | CR | En movimiento con una parada fallida |
| VJ-DEMO-VN-01 / 02 / 03 | VN | En ruta · retrasado 95 min · por salir |
| VJ-DEMO-CR-C1, VN-C2, CR-C3, VN-C4 | CR/VN | Completados (C3 con fallida y una entrega sin firma) |
| `planned`: plan-cr-01, plan-cr-02, plan-vn-01 | | Para "Iniciar viaje (pruebas)" |

Campos de un escenario (`TripDef` en `sim.ts`): `startedMinAgo`, `lastSignalMinAgo`, `endedMinAgo` (completado), `at` (`origin`, `stop:N` o `[lat, lng]`), `moving`, `stoppedMin`, `delayMin` (retraso deseado de la próxima parada, solo informativo), `daysLate` (días pasados de la fecha de entrega: es lo que dispara `late`), `noGps`, y por parada `state`, `arrivedMinAgo`, `evidence` (`full` = factura + firma, `invoice` = solo factura, `none`) y `recipient`.

**Agregar un escenario:** copiar uno parecido en `trips`, cambiar `id` / `route_number` / `invoice`, ajustar los campos y comprobar con `npx vitest run src/pages/tracking`.

## Pruebas

- `__tests__/mock-backend.test.ts`: el backend simulado cumple el contrato (forma, KPIs, país, cursor, 404/400, sin GPS, calles).
- `__tests__/api.test.ts`: el cliente arma bien las URLs y traduce errores.
- `__tests__/page.test.tsx`: la página entera sobre el backend simulado (cambiar de viaje sin ver el detalle anterior, una sola llamada lista + KPIs, nunca `/viajes/null`, filtro por KPI, cierre simulado de Planificación).
- **E2E** `e2e/tracking.spec.ts` (Playwright, navegador real): KPIs y lista, panel de solo lectura con factura + firma, filtro por KPI, agrupación de camiones y cierre simulado. Requiere la app en `http://localhost:3000` en modo mock (`VITE_MOCK_AUTH=true npm run dev`) y país Costa Rica en el selector; correr con `npx playwright test e2e/tracking.spec.ts`. No depende de OSRM.
- El equivalente contra el backend real es `scripts/tracking-contract-check.mjs` (necesita túnel; ver [pendientes-tunel.md](./pendientes-tunel.md#t3--verificar-el-contrato-v2-contra-el-backend-real)).

## Límites del mock (lo que solo se valida con túnel)

- No hay permisos por rol ni países del rol (el mock ve todo).
- Las URLs de evidencias son imágenes SVG en línea, no S3 firmado.
- No hay gzip ni latencia real de Lambda/Aurora.
- No se ejercita la ingesta (`POST /posiciones`, transiciones, evidencias): eso lo hace la app o `scripts/simular-posiciones.mjs` contra el backend real.
