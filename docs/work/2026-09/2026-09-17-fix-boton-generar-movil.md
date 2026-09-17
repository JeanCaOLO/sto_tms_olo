# 2026-09-17 — Fix: botón "Generar N Ruta(s)" se salía en móvil

## What changed

En Reparto de Flota, la fila de acciones (`Calcular Reparto` + `Generar N
Ruta(s)`) era `flex gap-3` sin wrap: en móvil los dos botones (nowrap) no caben y
se salían del contenedor. Se cambió a `flex flex-wrap`, así el botón "Generar"
baja de línea en pantallas angostas en vez de desbordar.

## How

Una clase Tailwind en `FlotaSplitTab.tsx`. `tsc` limpio. Deploy a Amplify `dev`.
