# Instrucciones de prueba — U1 `motor-reglas-oms` (service)

> Intent: `260826-modulo-oms`. Unidad: U1 (kind `service`). 2026-10-01.
> Reconciliación contable: las pruebas YA EXISTEN y pasan (16/16 + 142/142). Esto
> documenta la estrategia de prueba de lo construido.

## Cómo correr

```bash
# desde backend/ (con venv de dev: pytest + pg8000)
python -m pytest tests/test_oms.py -v      # 16 tests de la unidad
python -m pytest -q                        # suite completa del backend (142)
```

El stack `oms` está registrado en `backend/tests/conftest.py`
(`STACK_SOURCES['oms']` + módulos en `STACK_MODULES`). Los tests cargan los módulos
como lo haría Lambda (`src/` en path + Layer `tms_common`) vía
`load_stack_module("oms", ...)`. No tocan DB ni red (`OMS_SOURCE=mock`).

## Cobertura por módulo

- **score.py (submódulo puro)** — 5 tests: suma ponderada por peso; ignora regla
  sin peso; más score ⇒ menor número de prioridad; acote al mínimo (1); cliente
  retira cortocircuita a prioridad máxima.
- **regla_fecha.py** — 3 tests: urgente cuando el objetivo T-1 ya llegó; menos
  puntos con más margen; fallback por centinela (`1900-01-01`), no por NULL.
- **analizador_observaciones.py** — 3 tests: detecta cliente-retira con el stub;
  neutro sin texto; degrada sin bloquear si el clasificador lanza.
- **handoff_pedidos.py** — 2 tests: el flag `escribir_prioridad_al_wms` elige el
  SQL con/sin PRIORIDAD sin lanzar en mock; `ejecutar()` completa en mock.
- **motor_reglas.py** — 1 test: prioriza cliente-retira por encima (prioridad 1).
- **app.py (corrida e2e)** — 2 tests: corrida de punta a punta en mock (4 pedidos,
  4 completados, 0 pendientes); ruta `/health` 200.

## Qué queda fuera (diferido)

- Pruebas contra EFLOW/WMS real y Bedrock real: entran al reactivar nfr/infra-design
  (el esqueleto usa mock/stub).

## Sources

- `backend/tests/test_oms.py`, `backend/tests/conftest.py`.
