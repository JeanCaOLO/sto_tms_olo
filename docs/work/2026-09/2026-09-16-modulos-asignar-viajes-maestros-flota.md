# 2026-09-16 — Módulos "Asignar Viajes", "Maestros" y sugerencia de flota

## What changed

Nuevas piezas en Planificación pedidas por Ana (reunión 2026-09-15):

1. **Módulo "Asignar Viajes"** (pestaña nueva): eliges una ruta, ves sus pedidos
   y creas viajes (mock) a los que asignas pedidos. Una ruta puede tener varios
   viajes y **un pedido puede ir en 2 viajes** (nota de Ana). Todo el dato origen
   es de lectura; los viajes se persisten en localStorage (mock-store) hasta que
   exista la BD propia del TMS.
   - `viaje-asignacion-mock.ts` (store), `asignar-viajes-helpers.ts` (selectores
     puros), `use-asignar-viajes.ts` (estado), `AsignarViajesTab.tsx` +
     `ViajeAsignacionCard.tsx` (UI).
2. **Módulo "Maestros"** (pestaña nueva): vista de solo lectura de transportistas
   con sus conductores y su flota, con buscador y tarjetas de resumen.
   - `MaestrosTab.tsx` + `TransportistaMaestroCard.tsx`. Requirió exponer
     `carrier_id` en `Vehiculo` (el mapper lo descartaba) para agrupar la flota
     por transportista.
3. **Reparto de flota — sugerencia por capacidad**: botón "Sugerir vehículos por
   capacidad" que auto-elige la menor cantidad de vehículos (mayor capacidad
   primero) que cubren el peso/volumen del pool, y llena los slots. El usuario
   sigue pudiendo ajustar a mano.
   - `fleet-suggest.ts` (`sugerirVehiculos`, puro + test), enganchado en
     `use-flota-split.ts` y `FlotaSplitTab.tsx`.

De paso: se estabilizó el test flaky de `getFallbackPedidos` (order_date pasó de
`now()` a una fecha sintética determinista por índice).

## Why

Aterrizar en la app las tres cosas que Ana pidió: ver pedidos y asignarlos a
viajes, una vista de maestros para revisar los datos, y que el reparto sugiera
los vehículos por capacidad (no 100% manual). La capacidad real de EFLOW viene
en 0, así que la sugerencia usa la capacidad estimada por marca del catálogo.

## How / evidencia

`tsc --noEmit` limpio; `vitest run` completo → **74/74** (11 archivos), estable en
3 corridas seguidas. Deploy a Amplify (job siguiente).

## Follow-ups

- Persistir viajes/asignaciones y secuencias en **BD propia del TMS** + API para
  Tracker (hoy localStorage) — decisión de arquitectura de la reunión.
- Reparto: falta poder **elegir un viaje** y asignar qué camión lleva cada viaje
  (hoy la sugerencia trabaja sobre el pool de la ruta).
- **Capacidad real** de vehículos: EFLOW en 0 → mantenimiento propio de flota.
- Matriz: agregar hora de despacho; filtro por compañía en todo el módulo.
