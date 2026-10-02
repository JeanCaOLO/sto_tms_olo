# Resumen de código — U1 `motor-reglas-oms` (service)

> Intent: `260826-modulo-oms`. Unidad: U1 (kind `service`). 2026-10-01.
> Reconciliación contable: el código YA existe y pasa 16/16 (unidad) + 142/142
> (suite backend). Este resumen documenta lo construido.

## Archivos (en `backend/oms/`)

| Archivo | Rol |
|---|---|
| `src/models.py` | Dataclasses frozen de dominio: `PedidoCandidato`, `PedidoPK`, `ResultadoRegla`, `RegistroPrioridad`, `PedidoOMS`, `ConfiguracionReglas`. |
| `src/score.py` | **Submódulo PURO testeable**: `score_ponderado`, `score_a_prioridad` (prioridad numérica invertida). Sin I/O. |
| `src/regla_fecha.py` | Regla T-1 sobre `FECHAEXPEDICIONPLANIFICADA`; fallback por valor centinela; `evaluar(pedido, config, hoy)` pura. |
| `src/analizador_observaciones.py` | Clasificación cliente-retira; `clasificador_stub` determinístico (Bedrock diferido, TODO); degrada sin bloquear. |
| `src/cola_candidatos.py` | Adaptador de lectura EFLOW/WMS; filtro DISP + sin cierre + sin viaje; mock por `OMS_SOURCE` (réplica diferida, TODO). |
| `src/handoff_pedidos.py` | Dos escrituras (D6): tabla OMS + `TPEXSI='GENE'` en WMS. Idempotencia por PK, `estado_handoff`, flag `escribir_prioridad_al_wms` parametrizable (TODO negocio). |
| `src/motor_reglas.py` | Orquesta: `priorizar(...)` resuelve reglas por scope, score ponderado, efecto cliente-retira; `config_por_defecto` (TODO CatalogoReglas). |
| `src/app.py` | Handler Lambda `tms_handler(ROUTES)`: `GET /api/v1/oms/health`, `POST /api/v1/oms/corridas`; `correr()` orquesta la corrida. |
| `template.yaml`, `samconfig.toml` | SAM (patrón context); `OMS_SOURCE=mock`; TODO EventBridge/infra diferido. |

## Tests

- `backend/tests/test_oms.py` — 16 tests verdes (score puro, ReglaFecha,
  observaciones, handoff, motor, corrida e2e, health).
- `backend/tests/conftest.py` — stack `oms` registrado.
- Suite completa del backend: 142/142.

## Decisiones clave reflejadas

- Motor PROPIO del OMS desde cero (C2-RESUELTO): sin AST compartido, sin tocar
  Liquidaciones.
- Multi-compañía por SCOPE (C3-SUPERSEDE): la especificidad vive en la config por
  scope, no en una Lambda por compañía.
- functional-design compensado inline (firmas tipadas + docstrings de contrato).

## Deuda / diferido (gate de reactivación en external-dependency-map.md)

- Réplica EFLOW real (mock hoy), Bedrock real (stub hoy), despliegue SAM/infra,
  destino de `PRIORIDAD` al WMS (flag). nfr-requirements + nfr-design +
  infrastructure-design DEBEN reactivarse antes de datos reales / sandbox / prod.

## Sources

- `backend/oms/src/*.py`, `backend/oms/template.yaml`, `backend/tests/test_oms.py`.
