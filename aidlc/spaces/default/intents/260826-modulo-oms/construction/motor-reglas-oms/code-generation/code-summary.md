# Resumen de código — U1 `motor-reglas-oms` (service)

> Intent: `260826-modulo-oms`. Unidad: U1 (kind `service`). **Reconciliado as-built
> 2026-10-19 al modelo v4 + ADR-013**. El código YA existe y pasa **36/36 (unidad)
> + 287/287 (suite backend)** en rama `oms`. Este resumen documenta lo construido.
> Supera la versión 2026-10-01 (modelo viejo: `oms.pedidos`, cola
> `TPEXES/TPEXSI='DISP'`, dos escrituras D6, `analizador_observaciones` activo).

## Archivos (en `backend/oms/`, salvo `sql/`)

| Archivo | Rol |
|---|---|
| `src/models.py` | Dataclasses frozen: `PedidoCandidato` (con `dispatch_date`, `numero_viaje`, `planning_run_id`, `oms_processed_at`, `lead_time_days`, `delivery_zone`, `customer_type`), `PedidoPK`, `ResultadoRegla`, `RegistroPrioridad`, `ConfiguracionReglas` (`dias_prep_picking=1`), constante `BARRIDO_VECES_POR_DIA=5`. |
| `src/score.py` | **Submódulo PURO testeable**: `score_ponderado`, `score_a_prioridad` (prioridad numérica invertida). Sin I/O. |
| `src/regla_fecha.py` | `fecha_listo = delivery_date − lead_time_days` (dinámico, insumo de Planificación, default 1). No modifica fechas. No aplica a EPA. |
| `src/cola_candidatos.py` | LECTURA por **polling** de `public.orders`: `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` (ADR-007). Expone `dispatch_date`. Mock por `OMS_SOURCE`. |
| `src/handoff_pedidos.py` | ESCRITURA partida (ADR-013): `priorizar_pedido()` (UPDATE `orders`, deja `DISP`, sin `oms_processed_at`, sin costura) y `liberar_pedido()` (`GENE` + `oms_processed_at=now()` + escritura 2 por `EscritorSituacion`/`SimExpedicionesWriter` → `sim_expedicionescabecera`; `disparo_pendiente`→`completado`, idempotencia por llave EFLOW). Predicado puro `en_ventana_liberacion`. eFlow read-only. `ponytail:` OQ-REL1. |
| `src/motor_reglas.py` | Orquesta la PRIORIZACIÓN: reglas por scope → score ponderado → prioridad; EPA cortocircuita; cliente-retira por `delivery_zone` (D11). No usa `dispatch_date`. |
| `src/analizador_observaciones.py` | **Stub DIFERIDO** (D11, Bedrock futuro). NO es el camino activo de cliente-retira (que es por zona). |
| `src/app.py` | Handler Lambda: `correr()` ejecuta las DOS pasadas (prioriza todo, libera los en ventana); `POST /api/v1/oms/viajes/{numero_viaje}/procesar` (acción manual, gated por `permissions.require("oms","edit")`, ignora ventana, subconjunto opcional). Resumen: total/priorizados/liberados/pendientes. |
| `template.yaml`, `samconfig.toml` | SAM (patrón del backend); `OMS_SOURCE=mock`; infra/deploy de Intelix. |
| `sql/47_orders_release_indexes.sql` | Índices PARCIALES de la pasada de liberación (`idx_order_release`, `idx_order_numero_viaje`), idempotentes, ROLLBACK + validación, estándar OLTP Intelix. |

## Tests

- `backend/tests/test_oms.py` — **36 tests verdes**: score puro, ReglaFecha,
  priorizar (deja DISP, sin `oms_processed_at`, sin costura), liberar en/fuera de
  ventana (GENE + `oms_processed_at` por la costura), liberación por viaje, acción
  manual (por viaje, subconjunto, gating 403), re-priorización idempotente, borde
  del predicado de ventana, corrida e2e, health.
- `backend/tests/conftest.py` — stack `oms` registrado.
- Suite completa del backend: **287/287** (los errores de setup de
  `test_alerts.py`/`test_realtime.py` son deps de Windows ajenas; tras instalar
  boto3/tzdata en el venv temporal, 287 verdes).

## Decisiones clave reflejadas

- Motor PROPIO del OMS desde cero (C2-RESUELTO): sin AST compartido, sin tocar
  Liquidaciones.
- **Flujo invertido (D7/ADR-007)**: activación por polling de columna.
- **Escritura invertida (D8/ADR-008)**: eFlow read-only; escritura 2 por costura
  `EscritorSituacion` → `sim_expedicionescabecera` (mañana endpoint EPRAC).
- **Desacople priorización↔liberación (D14/ADR-013)**: dos pasadas; `GENE` +
  `oms_processed_at` solo en la liberación; liberación por viaje vía `dispatch_date`;
  acción manual "Procesar a Eflow".
- **cliente-retira por ZONA (D11/ADR-011)**: `analizador_observaciones` diferido.
- Multi-compañía por SCOPE (C3-SUPERSEDE): especificidad en la config por scope.

## Deuda / diferido

- `analizador_observaciones.py`: stub diferido (Bedrock futuro, D11).
- Escritura 2 a eFlow real = endpoint EPRAC (futuro) detrás de la costura; hoy
  simulada en `sim_expedicionescabecera`.
- Deploy/infra de Intelix (SAM): wiring W1/W2/W3 en `external-dependency-map.md`.
- **OQ-REL1** (replan de un pedido ya liberado → stale): no bloquea v1.

## Sources

- `backend/oms/src/*.py`, `backend/oms/template.yaml`, `backend/tests/test_oms.py`, `sql/47_orders_release_indexes.sql`.
- `docs/work/2026-10/2026-10-19-adr013-desacople-priorizacion-liberacion.md`.
