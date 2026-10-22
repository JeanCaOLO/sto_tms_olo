# Plan de implementación — OMS ADR-013 (desacople priorización → liberación) — U1 as-built

Rama: `oms` (NO cambiar de rama, NO crear worktree). Idioma de código/comentarios: español.
Alcance: SOLO backend Python bajo `backend/oms/src/`, `backend/tests/` y `sql/`. NO tocar frontend ni otros módulos del TMS. NO planear commits.

## Contexto y decisiones de diseño (ADR-013, contrato cerrado con Planificación)

El motor del OMS hoy prioriza y libera en un mismo paso: `handoff_pedidos.ejecutar()` escribe `wms_situation='GENE'` + `oms_processed_at=now()` (escritura 1) y luego fija GENE+PRIORIDAD por la costura (escritura 2). ADR-013 pide **desacoplar** eso en dos pasadas de un único barrido sobre `public.orders` (grano pedido):

- **PrioritizadorPass**: cola = `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` → calcula priority/oms_score/prioritization_run_id; deja `wms_situation = DISP`; NO escribe GENE; NO estampa `oms_processed_at`. Idempotente (re-prioriza lo no liberado en cada barrido → absorbe replan).
- **LiberadorPass**: de lo priorizado-no-liberado, los pedidos cuyo `now() >= dispatch_date − dias_prep_picking` (default 1) → escribe GENE+PRIORIDAD por la costura `EscritorSituacion` y estampa `oms_processed_at = now()`. "Por viaje gratis": `dispatch_date` es igual para todos los pedidos de un `numero_viaje`, así que cruzan la ventana juntos; se lee SOLO `orders`.
- **Acción manual "Procesar a Eflow"** (gated por rol, nombre temporal) = LiberadorPass filtrada por `numero_viaje` (+ subconjunto opcional de pedidos), **ignorando la ventana temporal**.

Decisiones de diseño tomadas aquí (una frase de razón cada una):

- **Reparto del split**: se parte `handoff_pedidos.ejecutar()` en dos funciones públicas, `priorizar_pedido()` y `liberar_pedido()`, en vez de un flag, porque el flag `escribir_prioridad_al_wms` ya se eliminó del contrato y ADR-013 pide dos pasadas separables sin reescribir la costura. `ejecutar()` desaparece (no se conserva un tercer camino muerto); los tests que lo usaban se reescriben contra las dos funciones nuevas.
- **Dos SQL de escritura 1**: la priorización y la liberación tocan columnas distintas de `orders`, así que se parte `ACTUALIZAR_PEDIDO_SQL` en `PRIORIZAR_PEDIDO_SQL` (priority/oms_score/prioritization_run_id/handoff_status, deja `wms_situation` en DISP, NO toca `oms_processed_at`) y `LIBERAR_PEDIDO_SQL` (wms_situation='GENE' + oms_processed_at=now() + handoff_status), ambos UPDATE por la llave EFLOW → idempotentes.
- **`handoff_status` en priorización**: la priorización deja `handoff_status` en un estado nuevo `'priorizado'` (ni pendiente ni completado), para distinguir "ya priorizado, aún no liberado"; la liberación lo lleva a `disparo_pendiente` → `completado` como hoy. Se conserva el state machine de dos escrituras dentro de `liberar_pedido()`.
- **Predicado de ventana puro**: el cálculo `now() >= dispatch_date − dias_prep_picking` se extrae a una función pura `en_ventana_liberacion(dispatch_date, hoy, dias_prep_picking) -> bool` (sin reloj interno, `hoy` inyectado) para poder probarlo sin DB, coherente con la Testing Posture del proyecto (lógica de negocio en módulo puro).
- **Orquestación del barrido**: `app.correr()` ejecuta primero la pasada de priorización sobre toda la cola y luego la de liberación sobre los que cruzan la ventana; la selección de la ventana usa `dispatch_date` del `PedidoCandidato`, sin navegar `plan_trips`/`routes`.
- **Frecuencia del barrido**: v1 = 5×/día se documenta como constante `BARRIDO_VECES_POR_DIA = 5` en `models.py` (hora de corte / por compañía = futuro), NO se implementa scheduler (el schedule se cablea en infrastructure-design, diferido).
- **SQL índices**: estándar OLTP Intelix (`idx_` + entidad en singular `order`), parciales, idempotentes (`create index if not exists`), con cabecera de comentario + ROLLBACK + validación, siguiendo el patrón de `sql/46`. La columna `dispatch_date` NO se crea (la crea Planificación, sql/37); solo se indexa.

OQ-REL1 (abierta, NO bloquea v1, NO implementar): un pedido ya liberado (`oms_processed_at` sellado) que un replan mueva a otro viaje/fecha queda potencialmente stale; `oms_processed_at` no se limpia automáticamente. Se documenta como comentario `ponytail:` / nota en código, sin reconciliación.

## Archivos a tocar (exhaustivo)

- `backend/oms/src/handoff_pedidos.py` (split)
- `backend/oms/src/cola_candidatos.py` (dispatch_date en COLA_SQL + mapeo)
- `backend/oms/src/models.py` (dispatch_date en PedidoCandidato; dias_prep_picking + BARRIDO_VECES_POR_DIA en config)
- `backend/oms/src/motor_reglas.py` (sin cambio funcional de reglas; ver ítem 4 — solo si hace falta pasar dispatch_date; se decide abajo)
- `backend/oms/src/app.py` (orquestación de las dos pasadas + ruta manual)
- `backend/tests/test_oms.py` (tests nuevos/actualizados)
- `sql/47_orders_release_indexes.sql` (nuevo)

---

## Pasos

- [ ] 1. **models.py — datos y config.** Agregar `dispatch_date: datetime | None = None` a `PedidoCandidato` (columna `orders.dispatch_date`, la puebla Planificación, `date` = `delivery_date − lead_time_days`, igual por viaje; puede venir NULL). Agregar a `ConfiguracionReglas` el campo `dias_prep_picking: int = 1` (política del OMS, parametrizable por compañía a futuro). Agregar a nivel módulo la constante documentada `BARRIDO_VECES_POR_DIA = 5` (v1; hora de corte / por compañía = futuro; NO scheduler). Actualizar los docstrings de ambas dataclasses para reflejar la nueva semántica.
      Files: `backend/oms/src/models.py`
      Verify: `backend/.venv/Scripts/python -m pytest tests/test_oms.py` desde `backend/` — importa sin error (los tests existentes que construyen `ConfiguracionReglas`/`PedidoCandidato` siguen pasando porque los campos nuevos tienen default).

- [ ] 2. **cola_candidatos.py — dispatch_date en la cola.** Añadir `o.dispatch_date` al `SELECT` de `COLA_SQL` (el `WHERE`/filtro de cola NO cambia: sigue `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`). Mapear `dispatch_date=fila.get("dispatch_date")` en `_desde_fila`. Añadir `dispatch_date` a los pedidos del dataset mock `_mock_candidatos()` con valores coherentes (p.ej. uno con dispatch_date ya dentro de la ventana respecto al ancla, uno fuera, uno NULL) manteniendo `numero_viaje`/`planning_run_id`/`oms_processed_at`.
      Files: `backend/oms/src/cola_candidatos.py`
      Verify: `backend/.venv/Scripts/python -m pytest tests/test_oms.py -k cola` desde `backend/` — el test live afirma `dispatch_date` en el SQL y el mock lo expone.

- [ ] 3. **handoff_pedidos.py — split en priorizar / liberar.** Partir `ejecutar()` en dos funciones públicas, conservando la costura `EscritorSituacion`/`SimExpedicionesWriter` intacta, la idempotencia por llave EFLOW y el manejo `disparo_pendiente`/`completado`:
      - Partir `ACTUALIZAR_PEDIDO_SQL` en:
        - `PRIORIZAR_PEDIDO_SQL`: `UPDATE orders SET priority=%s, oms_score=%s, handoff_status=%s, prioritization_run_id=%s, updated_at=now() WHERE <llave EFLOW> RETURNING id` — NO toca `wms_situation` (queda DISP) ni `oms_processed_at`.
        - `LIBERAR_PEDIDO_SQL`: `UPDATE orders SET wms_situation=%s, handoff_status=%s, oms_processed_at=now(), updated_at=now() WHERE <llave EFLOW> RETURNING id`.
      - Añadir constante de estado `ESTADO_PRIORIZADO = "priorizado"`.
      - `priorizar_pedido(pedido, registro, corrida, *, estado=ESTADO_PRIORIZADO) -> None`: ejecuta `PRIORIZAR_PEDIDO_SQL` en live (reusa `PedidoNoIngerido` si el RETURNING viene vacío); no-op observable en mock. NO llama a la costura.
      - `liberar_pedido(pedido, registro, *, escritor=None) -> str`: ejecuta `LIBERAR_PEDIDO_SQL` con `estado=ESTADO_PENDIENTE` (escritura 1 de la liberación), luego `escritor.marcar_generada(pedido.pk, registro.prioridad)` (escritura 2, misma costura/orden/idempotencia que hoy); si la costura falla devuelve `ESTADO_PENDIENTE` (reconciliable, sin lanzar); si ok, re-escribe `LIBERAR_PEDIDO_SQL` con `estado=ESTADO_COMPLETADO` y devuelve `ESTADO_COMPLETADO`. Mantiene el orden escritura-1-antes-de-2 y el comentario `ponytail:` de no-2PC.
      - Factorizar un helper privado `_update_orders(sql, params, pedido)` que encapsule el `pg.query` live + `PedidoNoIngerido` + no-op mock (reutilizado por ambas SQL).
      - Eliminar `ejecutar()` y `_escribir_pedido_oms()`; dejar `SITUACION_GENERADA`, `PedidoNoIngerido`, la costura y `_escritor_por_defecto()` como están.
      - Documentar OQ-REL1 con comentario `ponytail:` en `liberar_pedido` (pedido ya liberado que un replan mueva queda stale; no se limpia `oms_processed_at`; sin reconciliación en v1).
      Files: `backend/oms/src/handoff_pedidos.py`
      Verify: `backend/.venv/Scripts/python -m pytest tests/test_oms.py -k handoff` desde `backend/` — pasan los tests de handoff reescritos (ver paso 7).

- [ ] 4. **motor_reglas.py — sin cambio funcional de reglas.** Confirmado leyendo el módulo: `priorizar()` no usa `dispatch_date` (es insumo de la *liberación*, no de las reglas de prioridad), así que la orquestación de reglas no cambia. Único retoque: actualizar el docstring de flujo del módulo para aclarar que la priorización del motor es la PrimeraPasada (deja DISP) y que la liberación vive en el barrido de `app.correr()`, no en el motor. No se agregan parámetros.
      Files: `backend/oms/src/motor_reglas.py`
      Verify: `backend/.venv/Scripts/python -m pytest tests/test_oms.py -k motor` desde `backend/` — los tests de orquestación siguen pasando sin cambios.

- [ ] 5. **app.py — barrido de dos pasadas + predicado de ventana + ruta manual.** Reescribir `correr()` para ejecutar las dos pasadas:
      1. Lee la cola (`cola_candidatos.candidatos`).
      2. Prioriza (`motor_reglas.priorizar`) y, por cada pedido, llama `handoff_pedidos.priorizar_pedido(...)` (escritura 1, deja DISP, sin `oms_processed_at`).
      3. Pasada de liberación: para cada pedido priorizado cuyo `handoff_pedidos.en_ventana_liberacion(pedido.dispatch_date, hoy, config.dias_prep_picking)` sea True, llama `handoff_pedidos.liberar_pedido(...)` y cuenta `completados`/`pendientes`.
      Añadir la función pura `en_ventana_liberacion(dispatch_date, hoy, dias_prep_picking) -> bool` (en `handoff_pedidos.py` junto a la liberación: `dispatch_date is not None and hoy >= dispatch_date − timedelta(days=dias_prep_picking)`; `dispatch_date` NULL → False, no se libera). Ajustar el resumen devuelto: `total`, `priorizados`, `liberados` (= completados), `pendientes`.
      Añadir ruta manual **"Procesar a Eflow"**: `POST /api/v1/oms/viajes/{numero_viaje}/procesar` → función `procesar_viaje(event)` que lee la cola, filtra por `numero_viaje` (+ subconjunto opcional de `id_expedicion` del body), prioriza esos pedidos y los libera con `liberar_pedido` **ignorando `en_ventana_liberacion`**. Gating por rol: usar el mismo patrón de permisos del backend (`tms_common.permissions` / `tms_handler`) que usan las otras rutas gated; marcar con un `# TODO(rol)` el permiso concreto si aún no está definido el módulo de permiso del OMS.
      Registrar la nueva ruta en `ROUTES`.
      Files: `backend/oms/src/app.py`, `backend/oms/src/handoff_pedidos.py` (solo `en_ventana_liberacion`)
      Verify: `backend/.venv/Scripts/python -m pytest tests/test_oms.py -k "corrida or ventana or procesar or viaje"` desde `backend/` — pasan los tests de barrido y acción manual (paso 7).

- [ ] 6. **sql/47_orders_release_indexes.sql — índices de liberación (nuevo).** Crear el archivo con cabecera de comentario (propósito: acelerar la cola de liberación y el filtro por viaje de la acción manual; aclara que `dispatch_date` la crea Planificación, aquí solo se indexa), estándar OLTP Intelix (prefijo `idx_`, entidad singular `order`), parciales e idempotentes, con `begin;`/`commit;`, bloque de validación `do $$ ... raise notice/exception ... $$;` y comentario de ROLLBACK, siguiendo el patrón de `sql/46`:
      ```sql
      create index if not exists idx_order_release on orders (dispatch_date)
        where oms_processed_at is null and planning_run_id is not null;
      create index if not exists idx_order_numero_viaje on orders (numero_viaje)
        where oms_processed_at is null;
      ```
      Validación: verificar vía `pg_indexes` / `pg_class` que ambos índices existen; `raise exception` si falta alguno. ROLLBACK comentado: `drop index if exists idx_order_release; drop index if exists idx_order_numero_viaje;`.
      Files: `sql/47_orders_release_indexes.sql`
      Verify: revisión de contenido (no se corre contra Aurora en esta tarea); confirmar sintaxis/idempotencia por lectura. El archivo NO afecta a los tests Python.

- [ ] 7. **test_oms.py — tests nuevos/actualizados (a–f).** Reescribir los tests que asumen el comportamiento viejo (`handoff.ejecutar`, `ACTUALIZAR_PEDIDO_SQL` con GENE + oms_processed_at juntos, `correr()` devolviendo `completados == total`) y añadir los nuevos:
      - (a) **Priorización deja DISP y NO estampa oms_processed_at**: reemplaza/añade — `priorizar_pedido` en live ejecuta `PRIORIZAR_PEDIDO_SQL`; afirmar que el SQL NO contiene `oms_processed_at` ni `wms_situation = 'GENE'`, y que NO se llamó a la costura.
      - (b) **Liberación escribe GENE + oms_processed_at y pasa por la costura**: `liberar_pedido` en live ejecuta `LIBERAR_PEDIDO_SQL` con `wms_situation='GENE'` + `oms_processed_at = now()` y llama `EscritorSituacion.marcar_generada`; nunca toca `EXPEDICIONESCABECERA` real.
      - (c) **Liberación queda `disparo_pendiente` si la costura falla** (reusa `EscritorRoto`, afirma `ESTADO_PENDIENTE`).
      - (d) **Acción manual "Procesar a Eflow" por numero_viaje ignora la ventana**: aun con `dispatch_date` lejano (fuera de ventana), `procesar_viaje` libera los pedidos del `numero_viaje` dado; afirmar que un pedido de otro viaje NO se libera y que el subconjunto opcional de `id_expedicion` filtra.
      - (e) **Barrido de dos pasadas end-to-end en mock**: `app.correr(hoy=...)` prioriza todos y libera solo los dentro de ventana; afirmar `priorizados == total`, `liberados == <cuenta esperada>` según los `dispatch_date` del mock.
      - (f) **Predicado de ventana — test que FALLA si el predicado se rompe**: tests de `en_ventana_liberacion` que cubran el borde exacto: `hoy == dispatch_date − dias_prep_picking` → True (día de liberación); `hoy == (dispatch_date − dias_prep_picking) − 1 día` → False (un día antes, NO libera); `dispatch_date is None` → False. Este test falla si alguien cambia `>=` por `>` o invierte el signo del `dias_prep_picking`.
      Files: `backend/tests/test_oms.py`
      Verify: `backend/.venv/Scripts/python -m pytest tests/test_oms.py` desde `backend/` — toda la suite del OMS en verde.

- [ ] 8. **Verificación integral con venv temporal.** Crear venv en `backend/.venv` (Python 3.14), instalar deps de test (pg8000 vía `requirements-dev.txt`, pytest), correr la suite y limpiar. Confirmar que NINGÚN test del backend quedó rojo (no solo los del OMS), ya que el split toca módulos compartidos vía conftest.
      Files: ninguno (verificación)
      Verify (PowerShell, desde `backend/`):
      ```powershell
      cd backend
      py -3.14 -m venv .venv
      .\.venv\Scripts\python -m pip install -q -r requirements-dev.txt
      .\.venv\Scripts\python -m pytest            # testpaths=tests (pytest.ini)
      ```
      Esperado: todos los tests PASS (los del OMS reescritos + el resto del backend intactos). Limpieza: `Remove-Item -Recurse -Force .venv` tras verificar. Si `py -3.14` no está disponible, usar el intérprete 3.14 del PATH (`python -m venv .venv`); NO degradar a una versión menor sin anotarlo.

## Notas

- OQ-REL1 queda documentada en código (comentario en `liberar_pedido`) y aquí; NO se implementa reconciliación en v1.
- La columna `orders.dispatch_date` la crea y puebla Planificación (sql/37, rama planificacion-2); el OMS solo la LEE e indexa. Riesgo de despliegue (la limpieza-al-caerse vive en planificacion-2 hasta su merge) se anota como riesgo, no bloquea: la cola es segura igual (`planning_run_id IS NOT NULL AND oms_processed_at IS NULL`).
- Simulador queda FUERA del alcance de U1 (no se toca en este plan).
- Las actualizaciones de ADR-007/008/013, US1/7/8/9, historias nuevas y external-dependency-map son del ritual §13 de los artefactos AI-DLC; este archivo es el plan de implementación de código as-built que pide la tarea, no esos artefactos.
