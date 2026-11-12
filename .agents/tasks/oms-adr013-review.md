# ADR-013 as-built: desacople priorización↔liberación en el OMS

El barrido del OMS que priorizaba y liberaba en un solo paso se partió en dos pasadas sobre `public.orders`, según ADR-013. `handoff_pedidos.ejecutar()` desaparece y se reemplaza por `priorizar_pedido()` (UPDATE de prioridad/score/corrida, deja `wms_situation = DISP`, no estampa `oms_processed_at`, no toca la costura) y `liberar_pedido()` (las dos escrituras del handoff: `GENE` + `oms_processed_at = now()` en orders, y `GENE`+PRIORIDAD por la costura `EscritorSituacion`). La decisión de liberar es un predicado puro `en_ventana_liberacion(dispatch_date, hoy, dias_prep_picking)` que `app.correr()` evalúa leyendo solo `orders`; la acción manual `POST /api/v1/oms/viajes/{numero_viaje}/procesar` reusa `liberar_pedido` filtrando por viaje e ignorando la ventana. Cambios acotados a `backend/oms/src/`, `backend/tests/`, `sql/`; sin commit; frontend y otros módulos intactos.

Watch for: la evidencia del run de pytest no quedó en ningún artefacto del repo, solo (según la tarea) en el mensaje final del coder — observación no bloqueante dado que el código de test es completo y coherente (confirmed). El resto del contrato se cumple en el código leído.

**Verdict**: APPROVED

## High-level view

El split es limpio: priorizar y liberar son dos funciones públicas separables con dos SQL distintos (`PRIORIZAR_PEDIDO_SQL` toca priority/oms_score/prioritization_run_id/handoff_status y deja `wms_situation` fuera del SET; `LIBERAR_PEDIDO_SQL` escribe `wms_situation='GENE'` + `oms_processed_at=now()`). La costura `EscritorSituacion`/`SimExpedicionesWriter`, el state machine `disparo_pendiente`→`completado` y la idempotencia por llave EFLOW se conservan intactos dentro de `liberar_pedido`. La semántica de `oms_processed_at` quedó re-anotada como LIBERADO (no priorizado) en código y docstrings.

La ventana de liberación se extrajo a un predicado puro con el reloj inyectado, y la liberación "por viaje gratis" cae sola porque `dispatch_date` es igual para todos los pedidos de un `numero_viaje` y el barrido solo lee esa columna de `orders` — nunca navega `plan_trips`/`routes`. La acción manual es la misma pasada de liberación filtrada por viaje, con subconjunto opcional, gated por permiso de rol.

La migración `sql/47` agrega los dos índices parciales correctos, idempotentes, con cabecera/ROLLBACK/validación y nomenclatura `idx_`/singular `order`; no crea `dispatch_date` (la crea Planificación). Los tests cubren los seis puntos del contrato (a–f), incluyendo el que falla si se rompe el predicado de ventana, y OQ-REL1 queda documentada como `ponytail:` sin reconciliación en v1.

<details>
<summary>Issues (2)</summary>

1. **Evidencia de run ausente en el repo** (no bloqueante) — el conteo de pytest vive solo en el mensaje final del coder, no en un artefacto versionado; el código de test es completo y coherente contra los módulos reales, pero no hay registro reproducible en el árbol. Guardar la salida del run junto al as-built ayudaría a auditar.
2. **`total` ausente en la respuesta manual vs. barrido** (menor, cosmético) — `procesar_viaje` devuelve `total`/`liberados`/`pendientes` pero no `priorizados`; el barrido sí expone `priorizados`. Asimetría menor en el shape, sin impacto funcional.

</details>

<details>
<summary>Details</summary>

### El split en dos pasadas y los dos SQL

`ejecutar()` se eliminó entero (no quedó un tercer camino muerto) y en su lugar hay dos funciones públicas. `priorizar_pedido(pedido, registro, corrida, *, estado=ESTADO_PRIORIZADO)` ejecuta `PRIORIZAR_PEDIDO_SQL`, cuyo SET es `priority, oms_score, handoff_status, prioritization_run_id, updated_at` — `wms_situation` y `oms_processed_at` quedan deliberadamente fuera, así el pedido sigue en `DISP` y no sale de la cola. `liberar_pedido(pedido, registro, *, escritor=None)` ejecuta `LIBERAR_PEDIDO_SQL` (`wms_situation = 'GENE'`, `handoff_status`, `oms_processed_at = now()`) y luego la costura. Ambos SQL son UPDATE por la llave EFLOW compuesta con `RETURNING id`, de modo que re-correr no duplica y un RETURNING vacío levanta `PedidoNoIngerido` — el chequeo se centralizó en `_update_orders`, reutilizado por las dos pasadas.

El nuevo estado `ESTADO_PRIORIZADO = "priorizado"` distingue "ya priorizado, aún no liberado" de los estados de la liberación. Dentro de `liberar_pedido` se conserva el orden fijo escritura-1→escritura-2 sin 2PC: si la costura falla devuelve `ESTADO_PENDIENTE` sin lanzar (reconciliable), y si todo va bien re-escribe orders con `ESTADO_COMPLETADO`. El comentario `ponytail:` de no-2PC sigue en su lugar.

### La costura y la semántica de oms_processed_at

`EscritorSituacion` (Protocol) y `SimExpedicionesWriter` (destino actual `sim_expedicionescabecera`, UPSERT por la llave EFLOW, `TPEXSI='GENE'`, `TPEXES` intacto en DISP) no cambiaron: la escritura 2 sigue detrás de la interface y el OMS nunca escribe a eFlow real. El docstring del módulo y el de `models.PedidoCandidato.oms_processed_at` se reescribieron para dejar explícito que `oms_processed_at` = LIBERADO a eFlow, precisando la lectura de ADR-007. `motor_reglas` sumó una nota de que es la pasada de priorización y no usa `dispatch_date` ni libera.

### La ventana de liberación y la liberación por viaje

```
en_ventana_liberacion(dispatch_date, hoy, dias_prep_picking):
    dispatch_date is None            -> False      (pedido sin plan: no se libera)
    hoy >= dispatch_date - dias_prep -> True/False (comparación a nivel día)
```

El predicado es puro, con `hoy` inyectado y normalización `date`/`datetime` vía `_solo_fecha`, lo que permite probarlo sin DB. `app.correr()` prioriza toda la cola y luego construye `en_ventana` filtrando por `pedido.dispatch_date` y `resolver_config(pedido).dias_prep_picking`, leyendo únicamente esa columna del `PedidoCandidato` — no se toca `plan_trips`/`routes`. Como Planificación estampa el mismo `dispatch_date` para todo un `numero_viaje`, los pedidos de un viaje cruzan la ventana juntos sin lógica extra.

### La acción manual "Procesar a Eflow"

`procesar_viaje(event)` exige `permissions.for_event(event).require("oms", "edit")` antes de nada (gating por rol; `# TODO(rol)` marca que el módulo/acción exactos se confirman cuando el RBAC del OMS se cierre), toma `numero_viaje` del path y un `id_expediciones` opcional del body para restringir a un subconjunto. Prioriza esos pedidos primero (por si aún no se priorizaron) y los libera con `liberar_pedido` **ignorando** `en_ventana_liberacion`. Reusa la misma pasada de liberación, sin duplicar lógica. El shape de respuesta omite `priorizados` (que sí aparece en el barrido) — asimetría cosmética, sin efecto funcional.

### sql/47 — índices de liberación

```sql
create index if not exists idx_order_release on orders (dispatch_date)
  where oms_processed_at is null and planning_run_id is not null;
create index if not exists idx_order_numero_viaje on orders (numero_viaje)
  where oms_processed_at is null;
```

Los dos índices parciales coinciden exactamente con el contrato: el primero sirve la cola de liberación por fecha de salida, acotado a no-liberados con plan; el segundo sirve el filtro por viaje de la acción manual. Idempotente (`create index if not exists`), envuelto en `begin;`/`commit;`, con cabecera de propósito, ROLLBACK comentado y un bloque `do $$` de validación que aborta si falta cualquiera de los dos. Nomenclatura OLTP Intelix (`idx_` + entidad singular `order`). La columna `dispatch_date` no se crea aquí — se documenta que la crea y puebla Planificación (sql/37) y el OMS solo la indexa.

### Cobertura de tests (a–f)

Los tests reescritos mapean uno a uno al contrato:
- (a) `test_priorizar_live_deja_disp_y_no_estampa_oms_processed_at`: afirma que el SQL de priorizar NO contiene `oms_processed_at` ni `wms_situation`, que los params son `[prioridad, score, ESTADO_PRIORIZADO, corrida, ...llave]`, y que no se llamó a la costura ni a eFlow real.
- (b) `test_liberar_live_escribe_gene_y_estampa_oms_processed_at`: `UPDATE orders` con `oms_processed_at = now()`, params `["GENE", ESTADO_PENDIENTE, ...llave]`, y escritura 2 a `sim_expedicionescabecera` nunca a `EXPEDICIONESCABECERA`.
- (c) `test_liberar_queda_pendiente_si_falla_la_escritura_2`: costura rota → `ESTADO_PENDIENTE`.
- (d) `test_procesar_viaje_manual_ignora_la_ventana` + `..._filtra_subconjunto...` + `..._requiere_permiso` (403 sin `edit`): la acción manual libera por viaje fuera de ventana, filtra subconjunto, y está gated.
- (e) `test_corrida_dos_pasadas_prioriza_todo_libera_solo_ventana` (`hoy=10-01` → priorizados 4, liberados 1) y `..._cuando_avanza_el_dia` (`hoy=10-07` → liberados 2): consistentes con los `dispatch_date` del mock (1001=10-02, 1004=10-08, 1002=10-10, 1003=NULL) y el predicado `>=`.
- (f) `test_en_ventana_un_dia_antes_es_false` es el test que falla si el predicado se rompe: un día antes de la apertura devuelve False, lo que rompería si alguien cambia `>=` por `>` o invierte el signo de `dias_prep_picking`. Complementado con borde exacto (True), día posterior (True), NULL (False) y aceptación de `datetime`.
- Idempotencia: `test_reprioriza_idempotente_sin_duplicar_el_no_liberado` corre dos barridos con el mismo `hoy` y afirma el mismo conteo.

El comentario `ponytail:` de OQ-REL1 (pedido ya liberado que un replan mueva queda stale; `oms_processed_at` no se limpia; sin reconciliación en v1) está presente en `liberar_pedido`. Los helpers de test usados (`make_permissions`, `caller_permissions`, `http_event`, `path_param`, `json_body`, `PedidoCandidato.pk`, `permissions.ACTIONS` con `edit`/`view`) existen y encajan — verificado por lectura, no por ejecución.

Sobre la evidencia del run: la tarea indica que el coder dejó el conteo y los comandos en su mensaje final y pide no re-correr pytest. Ese mensaje no quedó como artefacto en el árbol del repo; busqué en `.agents/tasks/`, la etapa `nfr-requirements` y breadcrumbs de recovery sin encontrar una salida de run guardada. Lo trato como observación no bloqueante porque el código de test es completo, coherente contra los módulos reales y cubre los seis puntos del contrato incluido el guard del predicado; no re-corrí las suites, como pide la tarea.

</details>

<details>
<summary>Archivos cambiados</summary>

- `backend/oms/src/handoff_pedidos.py` — split de `ejecutar()` en `priorizar_pedido`/`liberar_pedido`, dos SQL, `en_ventana_liberacion` puro, `_update_orders` centralizado, OQ-REL1.
- `backend/oms/src/app.py` — `correr()` en dos pasadas, ruta y handler `procesar_viaje` gated por rol, resumen con `priorizados`/`liberados`.
- `backend/oms/src/cola_candidatos.py` — `o.dispatch_date` en `COLA_SQL` y mapeo; `dispatch_date` en el mock (1001/1002/1004 set, 1003 NULL).
- `backend/oms/src/models.py` — `dispatch_date` en `PedidoCandidato`, `dias_prep_picking=1` en `ConfiguracionReglas`, `BARRIDO_VECES_POR_DIA=5` documentado (sin scheduler).
- `backend/oms/src/motor_reglas.py` — nota de docstring: priorización deja DISP, liberación vive en el barrido.
- `backend/tests/test_oms.py` — tests reescritos/nuevos (a–f) + idempotencia.
- `sql/47_orders_release_indexes.sql` — nuevo; dos índices parciales idempotentes.

Diff completo: `git diff -- backend/oms/src backend/tests sql` en la rama `oms`.

</details>
