# Evaluación de calidad de código — STO / TMS OLO

> Observada el 2026-09-30 (re-corrida por el pivote WMH). Deuda relevante para el
> OMS y Planificación, fundada en código leído.

## Hallazgos (por impacto sobre el OMS/Planificación)

1. **Gap de capacidad peso/volumen (crítico).** `wms_expediciones` es el HEADER
   de la expedición; no trae peso ni volumen (viven en `EXPEDICIONESCABECERA` en
   EFLOW, hoy mock). `backend/planning/src/app.py` los devuelve `null` con
   `capacity_known: false` (nunca 0) — decisión correcta para no asignar camiones
   con datos inventados, pero **Planificación no puede asignar por capacidad**
   hasta que EFLOW pase a live. El motor de planificación del frontend ya opera
   con capacidad desactivada tras flag (`USAR_CAPACIDAD=false`).

2. **Motor de reglas ausente en backend (deuda del pivote).** La lógica madura de
   priorización/tarifación vive en **TypeScript del frontend** (`src/lib/tarifas/`
   `calculate()`, `src/pages/oms/engine/priorityEngine.ts`), no en Lambdas.
   Reubicarla al backend Python es trabajo pendiente (decisión C2, abierta): hay
   que decidir si se porta el AST a Python, con tests de regresión sobre
   Liquidaciones (ya en uso) antes.

3. **Vocabulario de estados dependiente del WMS.** El "alistado" del OMS se
   codifica como `situacion = 'GENE'` sin viaje WMH (magic string del WMS en
   `planning_sql.py`). No hay un enum de estados propio del OMS todavía.

4. **EFLOW en mock.** Todo `eflow` corre con datos fijos; `rutas-dias` en live
   responde 501 hasta portar su SQL (vive en repo externo TMS-Backend). Rutas
   EFLOW **públicas** (sin authorizer) — pendiente de seguridad reconocido.

5. **Credenciales en `.env` versionado.** `.env` (trackeado) contiene claves
   Supabase (anon del prototipo / del Liquidador). El propio archivo documenta que
   los secretos reales se movieron a `.env.local` (gitignored) y hay un aviso de
   seguridad ya reportado. Riesgo: el archivo sigue trackeado. **Acción
   independiente del rediseño**: rotar/sacar del historial.

6. **TLS a Aurora sin validar CA** (`rejectUnauthorized:false`, paridad con el
   Express) — pendiente reconocido.

7. **Dependencias de arrastre.** `firebase`, `@stripe/react-stripe-js` en
   `package.json` sin uso claro en los módulos revisados.

## Lo que está bien

- **Tests presentes**: `backend/tests/` (15 archivos pytest, sin AWS/BD, con
  dobles): admin, audit, auth, context, data_app, delivery_points(+csv),
  eflow_app, eflow_mock, mutations, permissions, planning, responses,
  select_query. Frontend con Vitest (`.test.ts` en `oms/engine`, `planificacion/*`,
  `tarifas/__tests__`) y Playwright e2e.
- **Disciplina de tipos**: backend con type hints y dataclasses frozen
  (`scopes.py`); frontend con dinero como `Money = string` (decimal.js) en tarifas.
- **Seguridad de datos**: API genérica bloquea escritura de `app_users`/`roles`/
  `user_scopes` (cierra auto-escalada de rol); RBAC por scope fail-closed;
  bitácora de auditoría por trigger de BD, particionada, con actor.

## Contradicción documental heredada (a resolver en Requirements)

`CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §7.0 (aprobación humana del
OMS) están **desactualizados** frente a la Adenda del 2026-08-26 (cálculo 100%
automático, sin aprobación). Ya recogido como corrección en `project.md`.

## Sources

- `backend/planning/src/app.py` (gap peso/volumen), `planning_sql.py`.
- `backend/eflow/src/app.py` (mock/live, rutas públicas).
- `backend/tests/` (suite pytest), `src/lib/tarifas/__tests__/`.
- `.env` (credenciales versionadas), `backend/README.md` (pendientes).
- `src/lib/tarifas/`, `src/pages/oms/engine/priorityEngine.ts` (motor en TS).

## Assumptions & Open Questions

- EFLOW live y la réplica de `EFLOW_OLO` desbloquean el gap de capacidad y el
  ingreso real de pedidos.
- La portabilidad del motor de reglas a backend (C2) es la mayor incógnita
  arquitectónica para el OMS de reemplazo.
