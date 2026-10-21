# 2026-10-15 — Vista tabla del calendario + fuente eFlow-sim en localStorage

## What changed
El calendario de Planificación ganó un **modo Tabla** (por cada día: zona → N viajes, clickable al modal de viajes) junto a la cuadrícula, con un toggle Cuadrícula/Tabla, **filtro por zonas** (chips) y botón de refrescar. La fuente de datos cuando no hay planes en Aurora pasó a ser el **API simulado de eFlow mapeado a `RoutePlan[]` y cacheado en `localStorage`** (no se escribe en Aurora): un solo mapper `mapExpediciones` sirve tanto para la data real del sim como para un dataset eFlow-shaped generado (`eflow-sim-seed`). Se eliminó `calendario-demo` (reemplazado por el seed) y se extrajeron `ControlesVista` y `DetalleModal` para respetar el techo de líneas de componentes.

## Why
La reunión 2026-10-14 avisó que el cliente pedirá, además del calendario, una **vista tipo tabla filtrable/exportable** (formato torre de control/WMH). Y se decidió **simular la API de eFlow** mientras ePrac no la entrega, avanzando sin tocar Aurora para no bloquear el entregable de fin de mes.

## How
- `eflow-sim-seed.ts`: genera cabecera+detalle (Expedicion*) de la semana con zonas/coords GAM y conteos que dan 1–3 viajes por zona.
- `eflow-sim-store.ts`: `mapExpediciones(cab, det)` agrupa por `FECHAENTREGA`→plan, `RUTA`→zona, parte en viajes de ~3 paradas; loader con cache en `localStorage` (API del sim → seed si no responde).
- `use-eflow-sim-planes.ts`: hook con `regenerar()` (refrescamiento manual).
- `calendario.ts`: `filtrarPorZonas` (puro). Componentes nuevos: `VistaTabla`, `FiltroZonas`, `ControlesVista`, `DetalleModal`.
- Verificado: `tsc` limpio, `eslint` limpio, `vitest` 9/9 (4 nuevos del mapper + 5 de calendario).

## Promoted knowledge
- Nada de este work es verdad vigente por sí mismo; el comportamiento vive en el código del módulo. El caso EPA (prioridad por línea) y los gaps de Aurora quedaron en memoria de proyecto (no en guías aún), pendientes de la reunión con Jean.

## Follow-ups
- Vista tabla **exportable** (CSV/PDF del rango) — pedida implícitamente por el cliente.
- EPA: prioridad "falla" por línea (split a hoy) — delegada a Kiro en la rama `epa-falla-prioridad`, pendiente de review/push.
- Aurora: falta tabla de detalle de expedición de eFlow + prioridad por línea + trazabilidad eFlow↔pedido (llevar a la reunión con Jean).
