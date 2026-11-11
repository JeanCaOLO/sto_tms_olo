# 2026-11-11 — Deploy al sandbox: cron de la bandeja + historial compartido

## What changed

- Stack `dev-tms-planning` desplegado desde `planificacion-2` (a1217b3) con
  `scripts/sandbox/deploy_backend.py planning`. Schedulers activos:
  `dev-tms-planning-ingesta-bandeja` `cron(0/10 5-16 ? * MON-FRI *)` y
  `dev-tms-planning-replan-horario` `cron(0 5-16 ? * MON-FRI *)` (CR).
- Frontend desplegado a Amplify `dev-tms-frontend` (sandbox) con `scripts/sandbox/deploy_frontend.py`.
- PR #43 NO se aceptó (pedido de Jesús: solo desplegar).

## Why

La Lambda desplegada era del 9-nov: sus replans de las 5:00 y 6:00 CR no planificaron nada, mientras
que el código actual corrido desde local planificó el 13-nov.

## How

- Verificado: la primera ingesta programada (12:50 UTC) falló a propósito y dejó la fila `error`
  "Actualizar bandeja FALLÓ: eFlow no disponible (Sin credenciales EFLOW para país "cr")" en
  `tbl_oms_logs`. El secreto `/dev/tms/eflow` sigue vacío (decisión: no se carga).
- La ingesta real sigue corriendo desde la PC (`backend/local/ingesta_bandeja.py`, túnel SSM).

## Follow-ups

- El aviso de errores recientes del Panel del OMS queda encendido por las fallas de la bandeja.
