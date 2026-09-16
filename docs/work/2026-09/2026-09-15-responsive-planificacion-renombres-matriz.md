# 2026-09-15 — Renombres de Planificación + matriz de rutas compacta

## What changed

Primeros ajustes acordados en la reunión de responsive (2026-09-15):

1. **Renombres** (la ruta ya existe; lo que se genera es la secuencia de paradas):
   - Botón `Generar Ruta` → **`Generar secuencia`** (`ConfiguracionRuta.tsx`).
   - Pestaña `Nueva Ruta` → **`Nueva secuencia de paradas`** (`PlanificacionTabs.tsx`);
     el texto vacío de `RutasGeneradas.tsx` se alineó al nuevo nombre.
2. **Matriz de rutas (EFLOW) más compacta:** el nombre de la ruta pasa a una 2ª
   línea atenuada **bajo el código**, y se elimina la columna `Nombre`. Se hizo
   genérico: `ColumnDef.sub?` (key de una línea secundaria en la misma celda),
   renderizado en `DataMatrix.tsx`. Sirve para cualquier sistema de la matriz.

## Why

En la reunión se pidió: (a) nombrar la acción por lo que hace (genera la
**secuencia**, no la ruta), y (b) en responsive compactar la matriz para no
scrollear horizontalmente — juntar código+nombre y dejar solo las columnas de
días.

## How

Verificado: `tsc --noEmit` limpio; `vitest run src/pages/planificacion` → 70/70.
El campo `route_name` sigue viniendo del loader EFLOW; solo dejó de ser columna
propia (ahora es el `sub` del código).

## Follow-ups (de la misma reunión, aún NO hechos)

- Matriz: agregar **hora de despacho** (ambos Excel traen horas de salida).
- Reparto de flota: **sugerencia automática** de distribución por peso/capacidad
  (bloqueado por capacidad de vehículos en 0 — falta el dato real).
- **Filtro por compañía** (no solo país).
- Persistir secuencias en BD propia + **API** para Tracker; viaje↔ruta N:N.
- Ver nota Notion "Reunión 2026-09-15 — Responsive + estándares".
