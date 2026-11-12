# Historias de usuario — Módulo de Planificación

Módulo que arma el plan de reparto de un día: toma los pedidos planificables, los agrupa por
zona, los asigna a vehículos por capacidad, secuencia las paradas (2-opt sobre ruta OSRM) y
deja un plan editable, confirmable y con estado por viaje.

Contexto de negocio: la **ruta ya no es fija** — el viaje se dispara por los pedidos del día y
su zona; la **fecha de entrega la pone el cliente y no se modifica** (solo se ajusta
prioridad/estado). País/almacén/compañía salen del **contexto operativo del headbar**.

Las 001–006 y 008 describen comportamiento **ya entregado** (reflejan el estado actual del
módulo); 007 es trabajo pendiente surgido de la reunión 2026-10-05. El contrato técnico que
sostiene estas historias vive en [requerimientos de planificación](../../requirements/planificacion/documento-de-requerimientos-planificacion.md).

## Índice

| # | Historia | Estado | Depends on |
|---|----------|--------|------------|
| [001](#001--generar-el-plan-del-día) | Generar el plan del día | Delivered | — |
| [002](#002--regenerar-el-plan-y-alerta-de-pedidos-nuevos) | Regenerar el plan y alerta de pedidos nuevos | Delivered | 001 |
| [003](#003--editar-mover-pedidos-y-confirmar-el-plan) | Editar (mover pedidos) y confirmar el plan | Delivered | 001 |
| [004](#004--estado-por-viaje-completar--cancelar--reabrir) | Estado por viaje: completar / cancelar / reabrir | Delivered | 003 |
| [005](#005--ver-pedidos-paradas-y-mapa-de-la-ruta) | Ver pedidos, paradas y mapa de la ruta | Delivered | 001 |
| [006](#006--filtrar-planificaciones-por-estado-y-por-contexto) | Filtrar planificaciones por estado y por contexto | Delivered | 001 |
| [007](#007--pedido-entregado-en-varias-guías-split-por-línea) | Pedido entregado en varias guías (split por línea) | Draft | 001 |
| [008](#008--entregar-el-plan-al-oms-estampar-el-pedido-y-limpiar-al-re-planificar) | Entregar el plan al OMS (estampar + limpiar al re-planificar) | Delivered | 001, 002 |

---

## 001 — Generar el plan del día

- **Status:** Delivered · **Date:** 2026-10-06 · **Branch:** planificacion-2 · **Depends on:** None

### Narrative

Como planificador, quiero generar el plan de reparto de un día elegido a partir de los pedidos de ese día, para obtener los viajes con sus paradas sin armarlos a mano.

### Acceptance criteria

1. Elijo un día en el selector; el sistema muestra cuántos pedidos y cuántos vehículos hay para ese día (en el contexto operativo activo).
2. Al pulsar **Generar plan**, el sistema crea un plan en estado `draft` con uno o más viajes.
3. Los pedidos se **agrupan por zona de entrega**; dentro de cada zona se asignan a vehículos por **capacidad** (peso/volumen), priorizando la **flota propia**.
4. Dentro de cada viaje, las paradas quedan **secuenciadas** (orden de entrega optimizado), no en orden de llegada.
5. Los pedidos que no caben por capacidad aparecen listados como **sin asignar**.
6. Si el día no tiene pedidos, el botón se deshabilita y se muestra un aviso ("No hay pedidos para este día").

### Edge cases

- Día sin pedidos → no se puede generar; mensaje claro.
- Pedido sin coordenadas → entra al plan pero queda fuera del dibujo de ruta en el mapa.
- Sin vehículos disponibles → los pedidos quedan sin asignar.

### Test scenarios

- **Generar un plan de un día con varias zonas**
  - **Steps:** Login → Planificación → elegir día `2026-10-09` → Generar plan → ver los viajes.
  - **Data:** pedidos `SEEDC-20261009-*` en Aurora (zona foco con 16-20 pedidos + 2 zonas secundarias), vehículos de Costa Rica.
  - **Expected result:** se crea un plan `draft` con varios viajes; al menos un viaje con ~16 paradas; 0 pedidos sin asignar.

### Out of scope

- Edición de paradas (003), estado por viaje (004) y confirmación (003).
- Regla de piso de capacidad mínima 80% (requirement pendiente).

### Validation

- Verificado end-to-end el 2026-10-06 generando el plan de `2026-10-09`: viaje de zona "07 Carretera" con 16 paradas, 0 sin asignar.

---

## 002 — Regenerar el plan y alerta de pedidos nuevos

- **Status:** Delivered · **Date:** 2026-10-06 · **Branch:** planificacion-2 · **Depends on:** 001

### Narrative

Como planificador, quiero poder **regenerar** el plan cuando entran pedidos nuevos para el día que estoy planificando, y que el sistema me **avise** que llegaron, para no quedarme con un plan desactualizado.

### Acceptance criteria

1. Cuando aún no hay plan, el botón dice **"Generar plan"**; una vez generado, el mismo botón pasa a decir **"Regenerar plan"** (con icono de refresco).
2. Al regenerar, el plan se rearma tomando **los pedidos actuales** del día (incluye los que llegaron después de la primera generación).
3. Si entran pedidos nuevos para ese día después de generar, aparece una **alerta visible en el botón**: se pone ámbar/pulsante con un **badge que indica cuántos pedidos nuevos** hay.
4. La alerta se recalcula periódicamente sin recargar la página.
5. Tras regenerar (que ya incluye los nuevos), la alerta vuelve a cero.
6. Al regenerar, los pedidos que **dejaron de quedar** en el plan se **limpian** (quedan sin marca de planificación) para que no le sigan apareciendo al OMS — ver [008](#008--entregar-el-plan-al-oms-estampar-el-pedido-y-limpiar-al-re-planificar).

### Edge cases

- No hay plan todavía → no se muestra alerta (no hay base contra la cual comparar).
- Se cae la red al consultar → la alerta no molesta (no muestra números erróneos).
- Cambiar de día o de contexto operativo → la base de comparación se reinicia.

### Test scenarios

- **Llega un pedido nuevo y el botón avisa**
  - **Steps:** generar plan de `2026-10-13` → en otra terminal `node agregar_viajes_para_recalcular.js 2026-10-13 3` → esperar ≤15 s → ver el badge "3" sobre "Regenerar plan" → pulsar → el plan incorpora los 3.
  - **Data:** plan `draft` de `2026-10-13` ya generado; pedidos base `SEEDC-20261013-*`.
  - **Expected result:** aparece badge rojo "3" (botón ámbar/pulsante); tras regenerar, badge en 0 y los 3 pedidos están en el plan.

### Out of scope

- WebSocket real (hoy es polling cada 15 s; la detección vive aislada en `use-nuevos-pedidos.ts` para enchufar WS cuando haya infra — ver requirement 005).

### Changes

- 2026-10-21: agregado el criterio 6 (limpieza del sello al re-planificar; detalle en 008).

### Validation

- Verificado 2026-10-06: el badge aparece tras agregar pedidos al día y desaparece al regenerar.
- Verificado 2026-10-20: un pedido sacado del plan al regenerar queda sin marca y sale de la cola del OMS.

---

## 003 — Editar (mover pedidos) y confirmar el plan

- **Status:** Delivered · **Date:** 2026-10-06 · **Branch:** planificacion-2 · **Depends on:** 001

### Narrative

Como planificador, quiero ajustar un plan en borrador moviendo pedidos entre viajes y luego confirmarlo, para dejarlo listo para operación cuando esté conforme.

### Acceptance criteria

1. Solo un plan en estado `draft` es editable.
2. En cada parada de un viaje `draft` hay un selector **"Mover a…"** con los otros viajes del plan como destino.
3. Al mover un pedido a otro viaje, el servidor **revalida la capacidad** del viaje destino y **recalcula la secuencia** de paradas; si el pedido no cabe, la operación se rechaza.
4. El botón **Confirmar** pasa el plan de `draft` a `confirmed`; a partir de ahí deja de ser editable.
5. Tras confirmar, la vista cambia a la pestaña de Planificaciones.

### Edge cases

- Mover el último pedido de un viaje → el viaje queda vacío (se maneja sin romper el plan).
- Intentar editar un plan ya confirmado → no se ofrecen controles de edición.
- Mover un pedido que haría exceder la capacidad del destino → rechazo con el margen (85% peso / 95% volumen).

### Test scenarios

- **Mover un pedido entre viajes y confirmar**
  - **Steps:** generar plan `draft` → en una parada elegir "Mover a" otro viaje → ver que la parada aparece en el destino con la secuencia recalculada → Confirmar → el plan queda `confirmed` y no editable.
  - **Data:** plan `draft` con ≥2 viajes de `2026-10-09`.
  - **Expected result:** el pedido queda en el viaje destino; al confirmar, estado `confirmed` y controles de edición ocultos.

### Out of scope

- Estado por viaje (completar/cancelar/reabrir) → story 004.

### Validation

- Comportamiento disponible en `PlanEditor` (draft editable) + endpoint PUT /planes/{id} que revalida capacidad y recalcula secuencia.

---

## 004 — Estado por viaje: completar / cancelar / reabrir

- **Status:** Delivered · **Date:** 2026-10-06 · **Branch:** planificacion-2 · **Depends on:** 003

### Narrative

Como planificador, quiero marcar cada viaje de un plan confirmado como completado o cancelado (y poder reabrirlo), para reflejar lo que pasó en operación sin tocar el resto del plan.

### Acceptance criteria

1. En un plan **confirmado** (no editable), cada viaje muestra su estado (`pending` / `completed` / `cancelled`) y las acciones disponibles.
2. **Completar** lleva el viaje a `completed`; **Cancelar** lo lleva a `cancelled`; **Reabrir** lo devuelve a `pending`.
3. El estado es **por viaje e independiente del plan y de los demás viajes**.
4. Las transiciones son **reversibles** (reabrir siempre disponible salvo cuando ya está `pending`).
5. La pestaña de Planificaciones refleja los viajes completados/cancelados por plan.

### Edge cases

- Reabrir un viaje ya `pending` → la acción no se ofrece.
- Transición inválida en backend → se rechaza (`TransicionViajeInvalida`) sin dejar el viaje en estado inconsistente.

### Test scenarios

- **Completar y luego reabrir un viaje**
  - **Steps:** confirmar un plan → en un viaje pulsar Completar (queda `completed`) → pulsar Reabrir (vuelve a `pending`).
  - **Data:** plan `confirmed` con ≥1 viaje.
  - **Expected result:** el pill de estado del viaje cambia a Completado y luego a Pendiente; los otros viajes no cambian.

### Out of scope

- Estatus de **entrega/recepción** de devoluciones (pendiente, ligado a IPRAC — ver reunión 2026-10-05).

### Open questions

- Falta el estado de **recepción** para devoluciones (no se puede liquidar sin recepción). Owner: negocio/Ricardo.

### Validation

- Backend: `estados_viaje.py` (máquina PENDING/COMPLETED/CANCELLED) + rutas /viajes/{tripId}/completar|cancelar|reabrir. Front: botones en `PlanTripCard`.

---

## 005 — Ver pedidos, paradas y mapa de la ruta

- **Status:** Delivered · **Date:** 2026-10-06 · **Branch:** planificacion-2 · **Depends on:** 001

### Narrative

Como planificador, quiero ver cada viaje con su mapa, su secuencia de paradas y el detalle de los pedidos, incluso cuando varios pedidos se entregan en el mismo punto, para revisar el reparto de un vistazo.

### Acceptance criteria

1. Cada tarjeta de viaje muestra: zona, vehículo (placa + si es flota propia), barras de capacidad (peso/volumen) y un **mapa** con las paradas numeradas y la ruta por calles (OSRM).
2. Los pedidos que van al **mismo punto** (mismas coordenadas) comparten **color** en la lista y en el pin del mapa.
3. La lista de paradas muestra las **primeras 3**; si hay más, un botón **"Ver las N paradas" / "Ver menos"** las expande/colapsa.
4. Al tocar un pin del mapa que agrupa **varios pedidos**, se abre una **tabla del punto** (#, cliente, nº pedido, peso); al tocar una fila se abre el **detalle del pedido** (encima de la tabla). Si el punto tiene un solo pedido, va directo al detalle.
5. Botón **"Ver pedidos"** lista todos los pedidos del viaje **agrupados por punto**.
6. Cualquier modal se cierra al **hacer click fuera** o con **Escape**.

### Edge cases

- Viaje sin coordenadas → el mapa muestra "Sin coordenadas" en vez de romperse.
- Punto con 1 solo pedido → no se muestra la tabla intermedia, va al detalle.
- Viaje con ≤3 paradas → no aparece el botón "Ver todas".

### Test scenarios

- **Punto compartido en el mapa**
  - **Steps:** generar plan → en el mapa tocar un pin con 2 pedidos (mismo color) → ver la tabla del punto → tocar una fila → ver el detalle encima → cerrar detalle (vuelve a la tabla) → click afuera (cierra).
  - **Data:** un viaje con ≥2 pedidos en el mismo punto de entrega (mismas coordenadas).
  - **Expected result:** tabla con los pedidos del punto; el detalle abre **delante** (no detrás); los modales cierran al click afuera/Escape.

### Out of scope

- Edición/estado (stories 003-004).

### Validation

- `TripMapa` (Leaflet + OSRM), `PlanTripCard` (lista colapsable, color por punto), `PuntoModal` (tabla del punto), `ParadaModal` (detalle), `ViajePedidosModal` (agrupado), `AdminModal` (cierre al click afuera/Escape). Verificado 2026-10-06 incl. fix de z-index del detalle sobre la tabla.

---

## 006 — Filtrar planificaciones por estado y por contexto

- **Status:** Delivered · **Date:** 2026-10-06 · **Branch:** planificacion-2 · **Depends on:** 001

### Narrative

Como planificador, quiero ver la lista de planificaciones filtrada por estado y acorde al país/almacén/compañía que elegí en el headbar, para encontrar lo que me interesa sin recargar la página.

### Acceptance criteria

1. La pestaña **Planificaciones** lista los planes con su fecha, estado, nº de rutas y paradas.
2. Hay filtros por estado: todas / borrador / confirmado / completado / cancelado. "Completado" y "Cancelado" filtran por el **estado de los viajes** (un plan entra si tiene ≥1 viaje en ese estado); "Borrador"/"Confirmado" por el ciclo de vida del plan.
3. Al cambiar **país / almacén / compañía** en el headbar, **tanto la pestaña de Planificaciones como la de Generar se re-consultan en vivo** (sin recargar la página).
4. Cada plan se expande para ver sus viajes con el mismo detalle de la story 005.

### Edge cases

- Contexto sin planes → estado vacío con mensaje.
- Cambiar de compañía a media sesión → la lista se refiltra sola.

### Test scenarios

- **Cambiar de compañía refiltra en vivo**
  - **Steps:** en Planificaciones con compañía A → cambiar a compañía B en el headbar → la lista cambia sin recargar.
  - **Data:** planes de dos compañías distintas (COFERSA y EPA) en el mismo almacén.
  - **Expected result:** la lista pasa a mostrar los planes/pedidos de la compañía seleccionada sin F5.

### Out of scope

- La selección en sí del contexto (vive en el headbar / `useOperationalContext`).

### Validation

- `usePlanesList` y `usePedidosDia` dependen del contexto operativo (país/almacén/cliente) en su efecto → re-fetch al cambiar. Verificado 2026-10-06.

---

## 007 — Pedido entregado en varias guías (split por línea)

- **Status:** Draft · **Date:** 2026-10-06 · **Branch:** (pendiente) · **Depends on:** 001

### Narrative

Como planificador, quiero que un pedido pueda despacharse en **varios viajes/guías** (parte de sus líneas en un viaje y el resto en otro), para reflejar casos reales (p. ej. EPA, o cuando no cabe todo en un camión), sin perder el control de qué línea va en cuál guía.

### Acceptance criteria

1. Un pedido puede repartirse entre **más de un viaje**, a nivel de **línea** (no solo cabecera).
2. Cada guía (viaje) sabe exactamente **qué líneas** del pedido lleva; la suma de líneas entre guías = el pedido completo.
3. La vista del viaje muestra, para un pedido partido, **qué parte** lleva (líneas/peso), no el pedido entero duplicado.
4. Un pedido parcialmente despachado no se marca como entregado hasta que todas sus líneas lo estén.

### Edge cases

- COFERSA normalmente va completo; el split es común en EPA o cuando no cabe por capacidad.
- Backorder: líneas faltantes se liberan después como otro pedido de la misma orden de compra (planificación desde antes de facturar).

### Test scenarios

- **(pendiente — definir con Ricardo/negocio los datos reales de un pedido partido)**

### Out of scope

- Liquidación de guías (OMS/tarifas).

### Open questions

- ¿El modelo actual (`plan_stops` por pedido) debe pasar a **nivel de línea**? Afecta el snapshot. Owner: Jesús + Ricardo.
- ¿Regla exacta para partir (por capacidad, por decisión del cliente)? Owner: Ricardo.

### Validation

- (pendiente)

---

## 008 — Entregar el plan al OMS (estampar el pedido y limpiar al re-planificar)

- **Status:** Delivered · **Date:** 2026-10-21 · **Branch:** planificacion-2 · **Depends on:** 001, 002

### Narrative

Como planificador, quiero que al armar el plan cada pedido quede **marcado con su viaje y
su fecha de despacho**, para que el OMS sepa qué alistar y cuándo sin que yo le mande nada a
mano; y que si un pedido **se cae del plan** al re-planificar, deje de aparecerle al OMS.

La frontera con el OMS es un **contrato de columnas en `orders`**, no una llamada entre
módulos: Planificación estampa unas columnas, el OMS lee esa cola y pone prioridad/estado.
(El detalle técnico vive en el requerimiento 007 — [contrato de handoff](../../requirements/planificacion/documento-de-requerimientos-planificacion.md#r007--contrato-de-handoff-planificación--oms-en-orders).)

### Acceptance criteria

1. Al persistir el plan, cada pedido que quedó en él recibe: **`numero_viaje`**
   (`AAAAMMDD-seq`), **`lead_time_days`**, **`dispatch_date`** y **`planning_run_id`**.
2. `dispatch_date = delivery_date − lead_time_days` (igual para todo el viaje); si el viaje
   no tiene coordenadas y no hay `lead_time_days`, `dispatch_date` queda vacío.
3. Planificación **no** escribe la prioridad ni el estado del OMS (`priority`, `oms_score`,
   `wms_situation`, `oms_processed_at`): esas son del OMS.
4. El OMS ve como pendientes solo los pedidos **planificados y no procesados**
   (`planning_run_id` con valor y `oms_processed_at` vacío).
5. Al re-planificar un día, los pedidos que **ya no quedan** en el plan vuelven a quedar sin
   marca (`numero_viaje`/`lead_time_days`/`dispatch_date`/`planning_run_id` vacíos) y
   desaparecen de la cola del OMS; los que siguen se re-estampan con la **nueva** corrida.

### Edge cases

- Viaje sin coordenadas → `dispatch_date` vacío (no se inventa fecha); el OMS aplica su
  default.
- Pedido que cambia de día de entrega → sale del plan del día viejo (queda sin marca) y
  entra al del día nuevo.
- Re-planificar dos veces seguidas sin cambios → mismo resultado, pero `planning_run_id`
  cambia en cada corrida (es por-corrida, no estable).

### Test scenarios

- **El pedido queda listo para el OMS**
  - **Steps:** generar el plan de un día con pedidos reales → consultar `orders`.
  - **Expected result:** cada pedido del plan tiene `numero_viaje`, `lead_time_days`,
    `dispatch_date = delivery_date − lead_time_days` y `planning_run_id`; `oms_processed_at`
    sigue vacío.
- **El pedido que se cae sale de la cola del OMS**
  - **Steps:** sacar un pedido del plan (excluirlo o moverlo de día) → re-planificar el día.
  - **Expected result:** el pedido caído queda sin marca y no aparece en
    `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`; los demás se re-estampan.

Ambos verificados contra Aurora el 2026-10-20 (277 pedidos estampados; caso de caída → marca
en NULL; al restaurar, re-estampado). Ver `scratchpad/verif_limpieza2.py` y el
[plan de pruebas Planif↔OMS](../../planificacion/2026-10-21-plan-pruebas-planif-oms.md).

### Out of scope

- La prioridad y el paso `DISP`→`GENE`: los hace el **OMS**, no Planificación.
- El write-back del `numero_viaje` al WMS/eFlow (hoy **simulado** en la tabla espejo; el
  eFlow real es solo lectura).

### Open questions

- ¿La re-planificación debe re-disparar el procesamiento del OMS para los que siguen, o solo
  para los que cambiaron? (pendiente de definir con el OMS)

### Validation

- Verificado 2026-10-20 contra Aurora `tms_olo`: estampado correcto y limpieza al caerse del
  plan (atiende la "Alerta 2" que levantó el OMS).
