# Instrucciones de prueba — U1 `motor-reglas-oms` (service)

> Intent: `260826-modulo-oms`. Unidad: U1 (kind `service`). **Reconciliado as-built
> 2026-10-19 (v4 + ADR-013)**. Las pruebas YA EXISTEN y pasan (**36/36 + 287/287**).
> Esto documenta la estrategia de prueba de lo construido.

## Cómo correr (comando scoped a ESTA unidad)

```bash
# desde backend/ (con venv de dev: pytest + pg8000)
python -m pytest tests/test_oms.py -q      # 36 tests de la unidad (comando scoped)
```

Suite completa del backend (contexto, NO es el comando de la unidad):
`python -m pytest -q` → 287 (requiere boto3 + tzdata en el venv para
`test_alerts.py`/`test_realtime.py`, deps de Windows ajenas al OMS).

El stack `oms` está registrado en `backend/tests/conftest.py`
(`STACK_SOURCES['oms']` + módulos en `STACK_MODULES`). Los tests cargan los módulos
como lo haría Lambda (`src/` en path + Layer `tms_common`). No tocan DB ni red
(`OMS_SOURCE=mock`); la costura `EscritorSituacion` es inyectable.

## Cobertura por módulo (36 tests)

- **score.py (submódulo puro)** — suma ponderada por peso; ignora regla sin peso;
  más score ⇒ menor número de prioridad; acote al mínimo; cliente-retira cortocircuita.
- **regla_fecha.py** — `fecha_listo = delivery_date − lead_time_days`; `lead_time_days`
  dinámico con default 1; no modifica fechas.
- **cola_candidatos.py** — polling por `planning_run_id IS NOT NULL AND
  oms_processed_at IS NULL`; expone `dispatch_date`; mock determinista.
- **handoff_pedidos.py (ADR-013)** — `priorizar_pedido()` deja `DISP`, sin
  `oms_processed_at`, sin tocar la costura; `liberar_pedido()` en ventana escribe
  `GENE` + `oms_processed_at` por la costura; fuera de ventana no libera;
  `disparo_pendiente` si falla la escritura 2; **borde del predicado**
  `en_ventana_liberacion` (falla si se rompe `>=` o se invierte el signo);
  re-priorización idempotente.
- **motor_reglas.py** — prioriza cliente-retira (por zona) por encima; EPA
  cortocircuita.
- **app.py** — corrida e2e de dos pasadas (prioriza todo, libera los en ventana);
  acción manual `POST /viajes/{numero_viaje}/procesar` (libera por viaje, filtra
  subconjunto, deniega 403 sin permiso); health 200.

## Expected coverage / mocking

- Objetivo: happy-path + bordes por capa (score, ventana de liberación, gating).
- Mocking: `OMS_SOURCE=mock` (sin DB/red); `EscritorSituacion` inyectable (los tests
  verifican que la liberación va por la costura y NO toca eFlow real).

## Qué queda fuera (diferido)

- Pruebas contra EFLOW/réplica real y endpoint EPRAC real: entran cuando exista la
  infra/endpoint (hoy mock/costura).
- Bedrock (`analizador_observaciones`): diferido (D11), stub.

## Sources

- `backend/tests/test_oms.py`, `backend/tests/conftest.py`.
