# Functional Design — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U1 `motor-reglas-oms`
> (service, Lambda Python). 2026-10-16. **As-built**: el código ya está construido
> y verde (rama `oms`, 24 tests OMS / 275 suite); este diseño funcional documenta
> las firmas/contratos de los módulos para el registro de auditoría, coherente con
> el contrato cerrado (ADR-007 polling, ADR-008 eFlow read-only + costura).
> Nomenclatura EFLOW/EPRAC.

## Módulos de la unidad (8, con `estrategias_prioridad.py` desde v4.2) y sus contratos

| Módulo | Responsabilidad | Contrato (entrada → salida) |
|---|---|---|
| `app.py` (handler) | Entrypoint Lambda + orquestación de la corrida | evento → ejecuta corrida (polling) |
| `cola_candidatos.py` | LECTURA de `public.orders` por polling | filtro `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` → lista de `PedidoCandidato` |
| `motor_reglas.py` | Orquesta: deriva EPA, invoca reglas, score, umbral, batching por compañía | `PedidoCandidato[]` → `RegistroPrioridad[]` |
| `score.py` | **Submódulo PURO** de score ponderado → prioridad numérica invertida | pesos + señales → `(score, prioridad)` sin I/O |
| `estrategias_prioridad.py` | **Submódulo PURO** (v4.2, ADR-014): elige por config cómo se numera la prioridad (`escala_lineal` default, `dias_hasta_salida` Cofersa) | `ContextoPrioridad` → `int` sin I/O |
| `regla_fecha.py` | `fecha_listo = delivery_date − lead_time_days` (dinámico; default 1) | pedido + `lead_time_days` → contribución de score |
| `analizador_observaciones.py` | **DIFERIDO (D11)** — cliente-retira es zona, no IA | n/a en esta rebanada |
| `handoff_pedidos.py` | ESCRITURA: priorizar (DISP) + sincronizar prioridad (v4.3) + liberar (GENE); escritura 2 por costura (dos verbos) | `RegistroPrioridad` → orders + `sim_expedicionescabecera` |

> Nota: la detección de cliente-retira se hace por `delivery_zone` dentro del flujo
> (ReglaClienteRetiraZona del domain-design); EPA se cortocircuita (ReglaEPA). El
> `analizador_observaciones.py` queda diferido (D11).

## Firmas clave (Python, as-built)

### Lectura — `cola_candidatos.py`
- Consulta de polling: `SELECT ... FROM orders WHERE planning_run_id IS NOT NULL
  AND oms_processed_at IS NULL` (vía `tms_common.pg.query`). Devuelve
  `list[PedidoCandidato]`. El OMS ordena/batcha por compañía.

### Regla de fecha — `regla_fecha.py`
- `fecha_listo = delivery_date − lead_time_days`. `lead_time_days` viene por pedido
  (dinámico, de Planificación); si es NULL → default 1 día (Cofersa). No modifica
  fechas. EPA no pasa por aquí.

### Score — `score.py` (submódulo puro)
- `score_ponderado(señales, pesos) -> float`; `score_a_prioridad(score, ...) -> int`
  (invertida: menor = más urgente). Sin I/O; testeable aislado (Testing Posture).
  Desde v4.2, `score_a_prioridad` solo lo usa la estrategia `escala_lineal`.

### Estrategias de prioridad — `estrategias_prioridad.py` (submódulo puro, v4.2 / ADR-014)
- `ContextoPrioridad` (dataclass frozen): `pedido: PedidoCandidato`, `hoy: date`,
  `score: float`, `cliente_retira: bool`, `config: ConfiguracionReglas`. Lo arma
  `motor_reglas._priorizar_uno` tras calcular el score.
- `EstrategiaPrioridad = Callable[[ContextoPrioridad], int]`.
- `escala_lineal(ctx) -> int`: delega en `score.score_a_prioridad(score,
  cliente_retira, config)` → `[1, escala_prioridad]`. Comportamiento previo intacto.
- `dias_hasta_salida(ctx) -> int` (Cofersa): `piso = config.prioridad_piso`;
  cliente-retira → `piso`; ancla según `config.ancla_fecha` (`entrega` →
  `regla_fecha.fecha_entrega`; si no, `regla_fecha.fecha_alistado_objetivo`); ancla
  `None` (fecha centinela) → `piso`; resto → `max(piso, (ancla − hoy).days)`.
- `resolver(nombre: str | None) -> EstrategiaPrioridad`: busca en el registro
  `{escala_lineal, dias_hasta_salida}`; nombre desconocido o `None` → `escala_lineal`.
- Constantes (fuente única en `models.py`): `ESTRATEGIA_ESCALA_LINEAL =
  "escala_lineal"`, `ESTRATEGIA_DIAS_HASTA_SALIDA = "dias_hasta_salida"`,
  `ANCLA_ALISTADO = "alistado"`, `ANCLA_ENTREGA = "entrega"`,
  `PRIORIDAD_PISO_DEFECTO = 1`.
- Config: `reglas_config.py` lee `estrategia`, `ancla_fecha` y `prioridad_piso` de
  la fila de `oms_rule_configs` (defaults `escala_lineal` / `alistado` / 1; un
  `prioridad_piso = 0` explícito se respeta, no se coacciona a 1).

### Handoff — `handoff_pedidos.py`
- **Pasada 1 — `priorizar_pedido(...)`**: `UPDATE orders SET priority, oms_score,
  handoff_status='priorizado', prioritization_run_id` por la llave EFLOW. **Deja
  `wms_situation = DISP`**, NO estampa `oms_processed_at`, NO toca la costura.
- **Pasada 1b — `sincronizar_prioridad(pedido, registro, *, escritor=None)`** (v4.3,
  SOLO Cofersa): refleja el número de prioridad en eFlow por
  `EscritorSituacion.actualizar_prioridad(pk, prioridad)` (SQL `SIM_PRIORIDAD_SQL`:
  UPSERT con `TPEXSI='DISP'`, solo toca `PRIORIDAD`). NO estampa `oms_processed_at`
  ni saca de la cola. EPA (pass-through) no se sincroniza.
- **Pasada 2 — `liberar_pedido(..., prioridad_liberacion=None)`**:
  - **Escritura 1**: `UPDATE orders SET wms_situation='GENE', handoff_status,
    oms_processed_at = now()` (+ `priority` vía `LIBERAR_PEDIDO_CON_PRIORIDAD_SQL` si
    `prioridad_liberacion` no es None; Cofersa libera con **0**). EPA pasa `None` → no
    toca `priority`.
  - **Escritura 2 (costura `EscritorSituacion`)**: `marcar_generada(pk, prioridad)` —
    impl `SimExpedicionesWriter` (hoy → `sim_expedicionescabecera`, `TPEXSI='GENE'` +
    `PRIORIDAD`), intercambiable por `EpracEndpointWriter` (futuro) sin tocar el motor.
    eFlow real NO se toca.
- La costura `EscritorSituacion` tiene **dos verbos**: `actualizar_prioridad` (solo
  número, `DISP`; pasada 1b) y `marcar_generada` (número + `GENE`; pasada 2).
- Orden 1→2, reintento idempotente, `handoff_status`
  `priorizado`/`disparo_pendiente`/`completado`.

## Flujo de la corrida (as-built)

1. Polling de `orders` (cola_candidatos) → candidatos del lote pendientes.
2. Por compañía: EPA → ReglaEPA (prioridad pre-asignada); resto → ReglaFecha +
   cliente-retira-por-zona → score (puro) → **número de prioridad con
   `estrategias_prioridad.resolver(config.estrategia)(ContextoPrioridad(...))`**
   (v4.2) → umbral.
3. **Pasada 1 (priorizar)**: `priorizar_pedido` deja `DISP`, no libera.
4. **Pasada 1b (sincronizar, v4.3 — SOLO Cofersa)**: `app._sincronizar_prioridades`
   recorre los priorizados-no-liberados **cuya prioridad cambió** (`registro.prioridad
   != pedido.priority`, write-on-delta), llama `sincronizar_prioridad` (verbo
   `actualizar_prioridad` de la costura) y cuenta `sincronizados`. No libera. EPA no
   entra (pass-through). Un sync fallido no aborta el barrido (best-effort, log).
5. **Pasada 2 (liberar)**: de lo priorizado en ventana
   (`en_ventana_liberacion`) → `liberar_pedido` con `prioridad_liberacion=0` para
   compañía priorizada (Cofersa) / `None` para EPA: escritura 1 (orders + `GENE` +
   `oms_processed_at=now()`) → escritura 2 (costura `marcar_generada`).
6. Resumen/log del barrido: `priorizados`, `liberados`, **`sincronizados`**,
   `pendientes`, `reconciliados`.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4) y `decisions.md` (ADR-007, ADR-008, ADR-009, ADR-010, ADR-011).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md` (C1, C2).
- Código as-built: `backend/oms/src/*.py`, `backend/tests/test_oms.py`.
- `docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md` (v4.2:
  `estrategias_prioridad.py`, `sql/55`; ADR-014).
- `docs/work/2026-11/2026-11-04-sync-prioridad-eflow-y-liberacion-manual.md` (v4.3:
  pasada 1b de sync, dos verbos de la costura, prioridad 0 al liberar; ADR-013 SUPERSEDE
  PARCIAL). Código: `backend/oms/src/handoff_pedidos.py`, `app.py`; `sql/57`.

## Assumptions & Open Questions

- As-built: el código ya existe y está verde; este diseño lo documenta, no lo
  re-abre.
- Pendiente externo (no bloquea): endpoint real de EPRAC detrás de `EscritorSituacion`.
- `analizador_observaciones.py` diferido (D11).
- v4.2 (ADR-014), abiertas: OQ-PRIO-A (aparcada), OQ-PRIO-B, OQ-PRIO-C.
  OQ-EPA-VAL — CERRADA 2026-10-30: EPA = 1 y 2 (confirmado por Eduardo; fuente 2026-09-01).
- **v4.3 (2026-11-04)**: la liberación de Cofersa **ya escribe prioridad 0** al WMS
  (`liberar_pedido` con `LIBERAR_PEDIDO_CON_PRIORIDAD_SQL`; `CHECK priority >= 0`,
  `sql/57`) — **ya no es follow-up**. Nuevo sync del número a eFlow desde la
  priorización (pasada 1b, `sincronizar_prioridad`/`_sincronizar_prioridades`,
  `SIM_PRIORIDAD_SQL`, `sincronizados`; SOLO Cofersa, EPA pass-through). Pendiente
  externo: endpoint real de EPRAC detrás de los dos verbos de `EscritorSituacion`
  (`actualizar_prioridad`, `marcar_generada`).
