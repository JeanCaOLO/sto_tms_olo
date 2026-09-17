# 2026-09-17 — Correcciones: "Secuencia", matriz simplificada, check de día

## What changed

- **"Ruta en Construcción" → "Secuencia en Construcción"** (`RutaEnConstruccion`).
- **Matriz de Rutas:** se quitó el selector de sistemas (Días de ruta EFLOW /
  COFERSA Excel / Asignación de Viajes) — ahora al entrar muestra directo el
  original **Días de ruta (EFLOW)** (`MatrizRutasTab`).
- **Check de día:** el día en que la ruta sale se muestra como un **círculo teal
  con check** (`bg-teal-100 text-teal-600` + `ri-check-line`), en vez del cuadro
  diagonal. `eflow-dias.ts` marca el día activo como `'sale'` y `DataMatrix.DiaCell`
  lo pinta con ese diseño (aria "Sale <día>").

## Why

Correcciones pedidas por el usuario tras revisar el módulo.

## Nota — dato "rural"
No existe un campo rural/urbano en la BD. Las rutas se ligan a
`distribution_zones` por `zone_id`, pero esas zonas son **cantones (CR)** /
**estados (VE)** (San José, Alajuela… / Anzoátegui, Carabobo…), no una
clasificación rural/urbano. Se podría **derivar** con una heurística (GAM = urbano,
resto = rural) o mostrar el cantón/estado, pero es una regla nuestra, no un dato.

## How

`tsc` limpio; `vitest` 78/78. Deploy a Amplify `dev`.
