# 2026-10-14 — Vista Calendario de Planificación (matriz zonas × días)

## What changed
- Nueva **vista Calendario** como pantalla principal de Planificación (`/planificacion`), con tres vistas: **Día / Semana / Mes**.
  - **Semana** = matriz **zonas (filas) × días (columnas)** (lun–sáb); cada celda lista los viajes de esa fecha+zona como chips `V{n}` (numeración global tipo pizarrón). — `components/VistaSemanaMatriz.tsx`
  - **Mes** = rejilla estilo Google Calendar con conteo de viajes por día. — `components/VistaMes.tsx`
  - **Día** = lista de viajes del día. — `components/DetalleDia.tsx`
  - Al abrir una celda/día → modal con el detalle de los viajes, **reusando `PlanTripCard`** (mapa OSRM + secuencia de paradas + pedidos + artículos), en modo solo lectura. — `components/CalendarioPlanificacion.tsx`
- Lógica pura y testeable del calendario (rangos de fecha, agrupación, numeración `V{n}`) en `calendario.ts` + `calendario.test.ts` (5 casos).
- Dataset demo autocontenido (`calendario-demo.ts`) que solo se usa como fallback cuando `listarPlanes()` no devuelve planes, con banner "datos de ejemplo".
- `page.tsx`: nueva pestaña `calendario` por defecto; `generar` y `planes` se conservan como vistas secundarias (no se borró nada). Claves i18n nuevas en `es/planning.ts` y `en/planning.ts`.

## Why
- En la reunión del 2026-10-13 (Ana/Eduardo) se definió que Planificación pasa a ser una vista tipo calendario (matriz zonas×días con viajes en las intersecciones), con día/semana/mes y detalle de viaje con mapa + paradas + pedidos/artículos. El usuario pidió construirlo reemplazando la pantalla principal.

## How
- Capa de layout sobre el modelo existente `RoutePlan[]` (`plan_date` = columna, `trip.delivery_zone` = fila) servido por `usePlanesList()`; nombres de zona vía `useZonasNombre()`.
- Rango de fechas y rejilla con `date-fns` (`startOfWeek` lun, `diasMes` = semanas completas). El contenido de celda NO se reinventó: se compone `PlanTripCard` dentro de `AdminModal`.
- Verificado: `npm run type-check` limpio, `vitest` 5/5 en `calendario.test.ts`, `eslint` sin warnings en los archivos nuevos.

## Promoted knowledge
- La vista Calendario (zonas×días, día/semana/mes) es la nueva superficie principal de Planificación; el detalle de viaje reusa `PlanTripCard`/`TripMapa`/`ViajePedidosModal`/`ParadaModal`.

## Follow-ups
- [ ] Conectar al endpoint real de viajes por fecha+zona cuando exista (hoy cae a `calendario-demo.ts`; borrar ese archivo sin tocar la UI).
- [ ] Definir con negocio: ¿columnas lun–sáb o lun–dom?; numeración `V{n}` ¿global por semana o por día?
- [ ] Generación continua/recalculo en vivo (Paso 2 del flujo reordenado) — fuera de este slice de UI.
- [ ] Acciones completar/cancelar sobre datos demo no persisten (solo lectura); funcionan con datos reales del backend.
