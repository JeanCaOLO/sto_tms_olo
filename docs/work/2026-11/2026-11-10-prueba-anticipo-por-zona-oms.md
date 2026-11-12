# 2026-11-10 — Prueba conjunta: días de anticipo por zona (Planificación → OMS)

## What changed

- Nada en Aurora: la prueba corrió en una sola transacción con `ROLLBACK` (verificado después: cola
  OMS en 0 y las 41 zonas en `dias_anticipo = 1`, como estaban).
- Rama local `prueba/oms-planif2` = `planificacion-2` + `oms` (no se sube).

## Why

Eduardo cerró el lado OMS (`tbl_zones.dias_anticipo`, ventana `hoy >= dispatch_date − días de la
zona`, sin zona → 1) y pidió validarlo con el plan real.

## How

Script de scratchpad `prueba_anticipo_e2e.py`, todo dentro de la transacción: ingesta eFlow CR (71
pedidos), replan programado (11, 12 y 13-nov), la `COLA_SQL` del OMS y su `en_ventana_liberacion`.

- Cola: 63 pedidos (salidas 10-nov: 8, 11-nov: 49, 12-nov: 6); 22 sin zona TMS; 0 sin
  `dispatch_date`.
- Todas las zonas en 1: liberables hoy 57/63.
- Zona 02 en 3: 63/63. Los 6 que cambian son de la zona 02 con salida 12-nov; ningún pedido sin zona
  ni de otra zona cambió.
- Sin zona: salen con `dispatch_date` (distancia) y liberan con 1 día.

## Follow-ups

- Vencidos: el replan solo arma (hoy, hoy+3]; un pedido DISP con entrega ≤ hoy nunca se planifica y
  el OMS no lo ve (solo lee planificados). Decidir quién lo cubre.
- El OMS calcula `hoy` en UTC y Planificación en hora de Costa Rica (diferencia de 6 h).
- Dos migraciones con número 64: renumerar al juntar ramas.
