# 02 — Pedidos vencidos en bandeja

**Estado:** pendiente por verificar

## Hecho (2026-11-13)

Acordado con Eduardo (opción b): la bandeja marca con el badge **"Vencido"** los pedidos
(no las devoluciones) cuya fecha de entrega es menor que hoy, y se planifican a mano
(cambio de fecha desde el detalle, `cambio_fecha`). Código: `vencido()` en
`src/pages/oms/bandeja/page.tsx`. El 2026-11-13 eran 44 (16 Cofersa y 28 EPA).

## Qué falta

- Confirmar con Ana si prefiere la opción (a): que el replan los arrastre solo.
- Verificar el badge en la bandeja desplegada.

## Por qué

El replan solo arma (hoy, hoy+3], así que un DISP/DISP vencido nunca se planifica y el OMS
(que solo lee planificados) tampoco lo libera. Ocultarlos los dejaría invisibles.

## Cómo hacer la opción (a), si Ana la elige

En `replan._PENDIENTES`, tratar `delivery_date <= hoy` como mañana (definir con operación qué
fecha nueva reciben) y el OMS los libera por ventana como a los demás.
