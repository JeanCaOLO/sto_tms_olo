# 2026-10-22 — Merge de `oms` en `planificacion-2` + prueba E2E headed del handoff Planif→OMS

Rama `planificacion-2`. Cierre de la integración con el módulo OMS de Eduardo y
verificación de punta a punta de la comunicación Planif→OMS (ADR-013) contra datos
reales de Aurora, con la UI real en el navegador.

## Hecho

1. **Merge de `github/oms` en `planificacion-2`** (commit `c14a86b`, 0 conflictos).
   Trae `backend/oms/src/` completo (app.py, cola_candidatos.py, handoff_pedidos.py,
   motor_reglas.py, score.py, regla_fecha.py, oms_log.py, analizador_observaciones.py)
   + migraciones `sql/46-50`. Incluye el fix de Eduardo `49ffe35` (liberar cliente-retira
   de inmediato y usar `delivery_date` como ancla cuando no hay `dispatch_date`).
   - Previo necesario: `planificacion-2` se había puesto al día con `main` (ver
     memoria `mantener-planif2-al-dia-con-main`), lo que redujo la divergencia aparente
     contra `oms` de 9↔57 a 12↔10.

2. **Prueba E2E headed nueva** — `e2e/oms-handoff.spec.ts` (Playwright, modo `--headed`).
   Login real → Cola de Priorización (situación DISP) → dispara el barrido
   `POST /api/v1/oms/corridas` con la sesión real (lo que hace el cron) → recarga la cola.
   Aserciones sobre la respuesta del barrido (autoritativa, no sobre la tabla paginada):
   `total > 0` y `liberados > 0`. Screenshots antes/después en `test-results/`.

## Por qué

El plan de pruebas Planif↔OMS (ADR-013) necesitaba validarse de punta a punta en el
sistema real, no solo con el verificador backend. El usuario pidió verlo en la UI (flujo
completo, navegador visible). Mergear `oms` en `planif-2` era requisito: sin el backend
OMS en la rama, la UI no tenía con qué dialogar localmente.

## Cómo / Verificación

- Stack local: túnel SSM a Aurora (`127.0.0.1:15432`) + `backend/local/serve.py` (:4000,
  monta todas las Lambdas incl. `oms`) + Vite (:3000).
- Corrida **verde** con `OMS_SOURCE=live`: el barrido leyó los **31** pedidos reales en
  cola (EPA/0029), priorizó los 31 y **liberó 19** (los que cruzan la ventana: entregas
  16/19/20/23-oct), dejando **12** (entregas 25-oct, Prioridad 4, fuera de ventana). La
  UI de la Cola recargada mostró DISP 31 → 12. Liberación escrita al espejo
  `sim_expedicionescabecera` (`EFLOW_MODE=mock`), nunca al eFlow real.
- La acción no tiene botón en la UI (por diseño ADR-013 el barrido es un sweep
  programado); el test lo dispara vía el endpoint igual que el cron.

## Conocimiento promovido

- **`cola_candidatos.candidatos()` sirve un dataset mock fijo (4 pedidos sintéticos
  1001-1004) salvo que `OMS_SOURCE=live`.** `serve.py` no setea `OMS_SOURCE`, así que el
  barrido local corre en `mock` por defecto, mientras la UI de la Cola **sí lee `orders`
  real siempre** → desajuste que confunde (pantalla 31, barrido mock 4). Guardado en
  memoria `oms-source-live-para-cola-real`. El `samconfig [dev]` del template AWS ya
  pone `OmsSource=live`; el gap es solo en el serving local.

## Follow-ups

- Decidir si `backend/local/serve.py` debe default-ear `OMS_SOURCE=live` en dev (hoy hay
  que exportarlo a mano) — evita que el barrido local toque el mock por error.
- Opcional: botón "Correr barrido" en el Simulador/Panel OMS que llame a
  `POST /api/v1/oms/corridas`, para que el flujo se vea 100% desde la pantalla.
- `e2e/oms-handoff.spec.ts` está sin commitear; pendiente confirmación del usuario.
- Los 12 pedidos del 25-oct se liberarán solos cuando entren en ventana (barrido futuro).
