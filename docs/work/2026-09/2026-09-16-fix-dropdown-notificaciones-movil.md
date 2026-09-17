# 2026-09-16 — Fix: dropdown de notificaciones cortado en móvil

## What changed

El panel de notificaciones (Header) usaba `absolute right-0 w-80` (320px) anclado
al botón de la campana, que no está pegado al borde derecho → en pantallas
angostas el panel se salía por la izquierda (se veía "ificaciones").

Ahora en móvil es **fijo a lo ancho con gutters** (`fixed left-4 right-4 top-16`)
y en `sm+` vuelve al dropdown anclado de 320px (`sm:absolute sm:right-0 sm:w-80`).

## Why

Reporte desde el dispositivo: la ventana de notificaciones se corta.

## How

Solo clases Tailwind en `Header.tsx`; `tsc` limpio. Deploy a Amplify `dev`.
