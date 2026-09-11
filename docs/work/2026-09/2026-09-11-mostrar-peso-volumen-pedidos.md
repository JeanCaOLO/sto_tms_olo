# 2026-09-11 — Mostrar peso/volumen real de los pedidos

## What changed

`src/pages/planificacion/eflow-mappers.ts` (`mapPedido`): dejaba `total_weight: 0`
y `total_volume: 0` **hardcodeados**. Ahora usa `row.total_weight` /
`row.total_volume` que el backend ya resuelve. Se añaden esos campos a `PedidoRow`.

## Why

Aunque el backend enviara el peso, el mapper lo descartaba y siempre se mostraba
0. Junto con el fallback del backend (cabecera → detalle → calculado), ahora se
muestran valores reales (CR ~74%, VE ~99% de los pedidos con peso).

## Follow-ups

- Cuando exista qa/prod del backend, apuntar el build a esa URL.
