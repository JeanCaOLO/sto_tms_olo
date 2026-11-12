# 2026-10-27 — Guía de usuario del módulo de Planificación

## What changed

- Se generó (vía kiro-cli, worktree hijo) `docs/guides/modulo-reglas-oms.md` y luego
  se **eliminó**: documentaba el Motor de Reglas del **OMS**, que no es nuestro módulo.
- Se creó `docs/guides/modulo-planificacion.md`: guía de usuario de **Planificación**
  (Pedidos en Bandeja + Planificador), reemplazando a la anterior.
- Commits en `planificacion-2`: `4442037` (doc OMS, merge FF) y `5c683c5`
  (reemplazo por doc de Planificación). Pusheados a github.

## Why

- La reunión del 2026-10-27 pidió "documentar el módulo de reglas"; se interpretó
  literal como el Motor de Reglas del OMS. Pero nuestro equipo es **Planificación**:
  la documentación debía ser de **nuestro** módulo, no del OMS.

## How

- Se replicó el estilo/estructura de la guía previa, reenfocado al flujo propio:
  ingesta DISP/DISP de eFlow → `orders`, Bandeja (todos los disponibles), ventana
  de 3 días del Planificador, T-1 dinámico por zona, persistencia en
  `route_plans`/`plan_trips`/`plan_stops` y escritura de `NUMEROVIAJEWMH` en el
  espejo `sim_expedicionescabecera` (eFlow real = solo lectura).

## Promoted knowledge

- Refuerzo del límite **Planificación ≠ OMS**: Planificación arma viajes y calcula
  `dispatch_date` (T-1); **no prioriza** (eso es del OMS) y **nunca** escribe en
  eFlow real. Ya registrado en memoria (`planif-bandeja-flujo-eflow`) y Notion.

## Follow-ups

- Sincronizar el espejo GitLab (`origin`) con este push a github `planificacion-2`.
- Eliminar el worktree hijo `JesusAraujoDEV/doc-reglas-oms` si ya no se necesita.
