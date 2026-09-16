# 2026-09-16 — Fix tabs en blanco + Reparto de Flota por viaje real

## What changed

1. **Fix bug: "Asignar Viajes" y "Maestros" salían en blanco.** En `page.tsx`
   estaban los `import` de `AsignarViajesTab`/`MaestrosTab` pero **faltaban las
   ramas de render** (`{tab === 'asignar' && …}` / `{tab === 'maestros' && …}`) —
   se perdieron cuando el hook de tamaño rechazó la edición y solo quedó el
   import. Con `noUnusedLocals:false` tsc no avisó, y rollup **tree-shakeó** los
   componentes (por eso ni aparecían en el bundle). Se agregaron las dos ramas.
2. **Reparto de Flota ahora trabaja sobre un VIAJE real** (pedido de Ana): se
   elige ruta → **viaje de esa ruta** → se cargan los **pedidos reales** del
   viaje (`fetchPedidosDeViaje`) y se reparten. Antes cargaba un pool mock por
   ruta.
3. **"Sugerir vehículos por capacidad" ahora calcula el reparto de una** →
   muestra ya los pedidos del viaje repartidos en cada vehículo (tarjetas de
   `FlotaResultadoPreview`).
4. **No se puede agregar el mismo vehículo dos veces** (ya lo filtraba el picker;
   se reforzó también en el hook) y se arregló la etiqueta `NISSAN UD NISSAN UD`
   con `marcaModelo` (marca+modelo sin repetir).

## Why

Los dos módulos nuevos no renderizaban nada (bug de integración). Y Ana pidió que
el reparto sea por viaje con datos reales, que la sugerencia muestre los pedidos
por vehículo, y que no se repita el mismo vehículo.

## How / evidencia

`tsc --noEmit` limpio; `vitest run src/pages/planificacion` → **74/74**. Verificado
en el build: los strings de `AsignarViajesTab`/`MaestrosTab`/reparto por viaje ya
quedan en el chunk `page-*.js` (antes ausentes por el tree-shake). Deploy a
Amplify.

## Follow-ups

- Reparto: permitir asignar manualmente qué viaje va en qué camión cuando una
  ruta tiene varios viajes.
- Capacidad real de vehículos (EFLOW en 0) sigue pendiente para que la sugerencia
  sea exacta.
