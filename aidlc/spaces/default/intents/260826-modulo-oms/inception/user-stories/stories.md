# Historias de usuario — Módulo OMS

> Intent: `260826-modulo-oms`. Etapa: User Stories (Inception, **re-corrida v4 por
> reuniones de negocio — inversión del flujo OMS↔Planificación**, 2026-10-16).
> Derivadas del `requirements.md` v4 y de `project.md` (`## Decided`). Formato
> Given/When/Then (BDD). Cada historia traza a su(s) FR y lleva una **etiqueta de
> entrega**: `[1ª entrega]`, `[siguiente]` o `[futuro]`. Actores en `personas.md`.
>
> **Nomenclatura (vigente)**: WMS = **EFLOW**; el módulo que asigna la prioridad de
> EPA (1 o 2) = **EPRAC**. (No "IPRAC"/"IFLOW".)
>
> **Correcciones de esta re-corrida v4** (base a corregir, no repetir):
> - **Flujo invertido (D7)**: Planificación procesa, asigna viaje y **activa al
>   OMS** (lambda asíncrona, **E0/US0**). El OMS **lee de `public.orders`** (no de
>   `EXPEDICIONESCABECERA`): US1 y US7-US9 corregidas.
> - **Escritura real a EFLOW (D8)**: US9 = UPDATE a `public.orders` + escritura a
>   **EFLOW real** (`TPEXSI='GENE'` + `PRIORIDAD`, flag TRUE). El OMS **no escribe
>   el número de viaje** (lo escribe Planificación).
> - **EPA sin cálculo (D9)**: nueva **E2b/US-EPA** — EPA cortocircuita el score;
>   prioridad pre-asignada por **EPRAC** (1 o 2; nunca 0).
> - **Regla fecha generalizada (D10)**: US7/US8 = `fecha_entrega − duración`, con
>   **duración como insumo de Planificación**.
> - **cliente retira = ZONA (D11)**: E3 (observaciones IA) pasa a **futuro**;
>   nueva US de cliente-retira-por-zona en 1ª entrega.
> - **Cambio sin anular (D12)** y **backorder/inventario (D13)**: US nuevas.
> - **(histórico v3)**: E8 (Calendario) retirada (D5); multi-compañía por scope
>   (C3); D6 (dos escrituras a tabla propia) SUPERSEDED por D7/D8.
> - **Refinamiento v4.1 (D14/ADR-013, 2026-10-19/20)**: **desacople
>   priorización↔liberación**. US9 ahora cubre solo la **priorización** (deja `DISP`,
>   no `GENE`, no `oms_processed_at`); la liberación a eFlow se difiere a
>   `dispatch_date − dias_prep_picking` y se modela en **US9b** (automática por
>   ventana, por viaje) y **US9c** ("Procesar a Eflow" manual, gated por rol).
>   `oms_processed_at` = **liberado** (no priorizado). El **Simulador (E6) sale del
>   alcance** (opcional, solo rol developer; ver "Fuera de alcance").
> - **Refinamiento v4.2 (prioridad Cofersa, 2026-10-29)** — fuente:
>   `docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md`. La
>   prioridad de **Cofersa** pasa a una escala **0..n = días hasta la salida**
>   (supera, solo para Cofersa, "EPA y Cofersa usan 2 prioridades" y "~2
>   prioridades/día"; EPA mantiene 1 y 2). `0` = liberado, **nunca en la cola** (piso de cola = 1). Se
>   recalcula en cada barrido. US10, US11 y US13 corregidas; **US10b nueva**
>   (estrategia de numeración por compañía). US-EPA sin cambio de comportamiento
>   (EPA = 1 y 2; OQ-EPA-VAL — CERRADA 2026-10-30: EPA = 1 y 2, confirmado por
>   Eduardo; fuente 2026-09-01). Abiertas: OQ-PRIO-A (aparcada), OQ-PRIO-B,
>   OQ-PRIO-C.

## Story map (épicas)

| Épica | Historias | FR cubiertos |
|---|---|---|
| **E0 — Activación por Planificación** | **US0** | **FR0** |
| E1 — Cola de Priorización | US1–US6 | FR1, FR10 |
| E2 — Motor de priorización (automático) | US7–US11b (incl. **US9b, US9c, US10b**) | FR2, FR3, FR6, FR8 |
| **E2b — EPA (prioridad pre-asignada)** | **US-EPA** | **FR6b** |
| E3 — Análisis de observaciones con IA | US12–US13 | FR6.3, FR7 **(futuro, D11)** |
| E4 — Override manual | US14–US15 | FR4 |
| E5 — Motor de Reglas (catálogo) | US16–US18 | FR5, FR6 |
| E6 — Simulador (configurador) | US19–US24 | FR9 |
| E7 — Panel y Auditoría | US25–US27 | FR11 |
| E8 — Calendario de rutas | ~~US28–US29~~ **RETIRADA (D5)** | ~~FR12~~ |
| E9 — Multi-compañía (scope) y seguridad | US30–US33 | FR13, FR14 |
| **E10 — Backorder / inventario** | **US-BO** | **FR6c (D13)** |

---

## E0 — Activación por Planificación

### US0 — Activar el OMS tras asignar el viaje `[1ª entrega]` (FR0)
Como **Planificación**, quiero avisar al OMS cuando dejo un lote con viaje, para
que el OMS priorice **después** de que asigné los viajes.
- Given un lote con viaje asignado y `oms_processed_at IS NULL`, When **aviso al
  OMS** por la **lambda/evento asíncrono** (señal; puede llevar IDs +
  `planning_run_id` para correlación), Then el OMS **resuelve de `public.orders`**
  su conjunto de trabajo por columna (`planning_run_id IS NOT NULL AND
  oms_processed_at IS NULL`) y lo prioriza. **La señal no es la fuente de verdad del
  lote; la columna sí.** **(ADR-013: v1 es polling programado; el `oms_processed_at`
  se estampa en la liberación, no al priorizar.)**
- Given un pedido ya procesado (`oms_processed_at` estampado por el handoff), When
  llega otra señal o corre el barrido, Then **no se re-prioriza** (idempotencia
  natural por la columna).
- Given que la señal se pierde, When corre el **barrido periódico** sobre
  `oms_processed_at IS NULL`, Then el trabajo pendiente igual se procesa (red de
  seguridad). El OMS procesa por compañía (batching propio).
- **Contrato RESUELTO (2026-10-16)** con el dueño de Planificación: pull por
  columna `oms_processed_at` + lambda señal (reemplaza "scope + run_id vs. llaves").

---

## E1 — Cola de Priorización

### US1 — Ver la cola de pedidos a priorizar `[1ª entrega]` (FR1, FR10)
Como **Responsable del OMS**, quiero ver los pedidos candidatos a priorizar,
para gestionar el alistamiento del día.
- Given pedidos en **`public.orders`** con **`planning_run_id IS NOT NULL AND
  oms_processed_at IS NULL`** (lote que Planificación dejó con viaje, aún no
  liberado por el OMS), When abro la Cola / corre el motor, Then veo/proceso esos
  pedidos. **(D7: el OMS ya no lee de `EXPEDICIONESCABECERA` ni usa el anti-join;
  pull por columna, contrato resuelto 2026-10-16. ADR-013: la priorización deja
  `wms_situation = DISP`; `oms_processed_at` marca "liberado", no "priorizado".)**
- Given un pedido sin viaje asignado, When Planificación aún no lo procesó, Then
  **no** aparece en la cola del OMS (lo activa Planificación, no el OMS).
- Given la Cola recién abierta, When carga, Then el filtro de situación entra
  por defecto en `DISP`.
- **UX (5 estados)**: Given la vista sin datos / cargando / sin conexión al
  motor, Then muestra el estado vacío / skeleton / error correspondiente, nunca
  una tabla en blanco.

### US2 — Filtrar la cola `[1ª entrega]` (FR10.1, FR10.2)
Como **Responsable del OMS**, quiero filtrar por situación, almacén y compañía,
para acotar lo que veo.
- Given la Cola, When cambio el filtro de situación a `GENERADA`, Then veo los
  pedidos ya generados.
- Given una compañía con varios almacenes, When selecciono un almacén, Then la
  cola muestra solo ese almacén.

### US3 — Acotar el scope (país→almacén→cliente) en la vista `[siguiente]` (FR10.2, FR13.2)
Como **Responsable del OMS**, quiero acotar mi scope (país → almacén → cliente)
dentro de la misma vista, sin cambiar de perfil, para operar los scopes que mi
RBAC permite (la compañía es un nivel del scope, no el eje).
- Given un perfil con acceso a varios scopes, When acoto el scope (p. ej. elijo
  un cliente dentro de un almacén), Then la cola muestra solo los pedidos de ese
  scope, sin cambiar de perfil.
- Given un usuario con un scope de un solo nivel (p. ej. CUSTOMER=EPA), When abre
  la Cola, Then el scope viene fijo (no ofrece scopes fuera de su permiso; se
  ocultan, no se deshabilitan para rebotar — coherente con US15).
- Nota (design D-3/D-4): el selector es jerárquico (breadcrumb país › almacén ›
  cliente), con herencia visible; el detalle de UX aterriza en refined-mockups.

### US4 — Ver el nombre de la compañía `[siguiente]` (FR10.3, FR13.4)
Como **Responsable del OMS**, quiero ver el nombre de la compañía (no el código),
resuelto contra el maestro.
- Given un pedido de la compañía `0109`, When lo veo en la cola, Then aparece
  "Cofersa" (nombre del maestro), no `0109`.

### US5 — Elegir columnas visibles `[siguiente]` (FR10.4)
Como **Responsable del OMS**, quiero elegir qué columnas veo y que se recuerden,
porque el WMS trae muchas columnas.
- Given que elijo un conjunto de columnas, When vuelvo a entrar, Then se
  conserva mi selección (persistida en `User Preference`, JSON).

### US6 — Ver el detalle de un pedido en modal `[1ª entrega]` (FR10.5, FR10.6)
Como **Responsable del OMS**, quiero abrir el detalle de un pedido en un modal,
para que la tabla use todo el ancho.
- Given un pedido en la cola, When lo selecciono, Then se abre un modal con su
  detalle y, si tengo permiso, el botón de override.
- **UX/accesibilidad**: Given el modal abierto, When se muestra, Then el foco
  entra y queda atrapado en el modal, `Esc` lo cierra, y al cerrarse el foco
  vuelve a la fila de origen (WCAG 2.1.2 / 2.4.3).

---

## E2 — Motor de priorización (automático)

### US7 — Calcular cuándo preparar por fecha (T − duración) `[1ª entrega]` (FR2)
Como **Sistema/Motor OMS**, calculo si un pedido debe prepararse según
`fecha_entrega − duración_logística`, para alistar en el momento correcto.
**Aplica a Cofersa/mayoreo; NO a EPA (ver US-EPA).**
- Given un pedido con `delivery_date` y una **duración logística** (insumo de
  Planificación; Cofersa CR = 1 día ⇒ T-1), When el motor corre y hoy es
  `fecha_entrega − duración`, Then lo marca para preparar.
- Given un pedido de **mayoreo VE** con duración **dinámica** entregada por
  Planificación, When el motor corre, Then usa esa duración (no una tabla
  zonas-días; rutas/duraciones VE pendientes con comercial).
- Given ese cálculo, When el motor actúa, Then **no escribe ninguna fecha**
  (invariante): `delivery_date` queda intacta.
- **Fallback (FR2.6)**: Given un pedido cuya `delivery_date` viene con el **valor
  por defecto/centinela** (caso Cofersa que la llena por default), When el motor lo
  evalúa, Then dispara el **fallback** (no por NULL, sino por valor centinela).

### US8 — Duración logística como insumo de Planificación + horas de corte `[siguiente]` (FR2.3, FR2.4)
Como **Sistema/Motor OMS**, tomo la **duración logística que entrega
Planificación** y aplico las horas de corte, para no adelantar ni atrasar.
- Given la duración logística que entrega Planificación en **`orders.lead_time_days`**
  (denormalizada de `plan_trips.lead_time_days`), When el motor calcula el
  `fecha_listo`, Then la **lee por pedido** (no la calcula); default 1 día para
  Cofersa si no viene.
- Given que hoy el cálculo dinámico por clúster (VE) aún no existe, When
  Planificación entrega un **mapa estático zona→días** (ej. Zona 4 = T-2, resto
  T-1), Then el motor usa ese valor igual (el enganche por columna no cambia; el
  dinámico es futuro, OQ).
- Given un pedido que entra después del corte de su ruta, When el motor lo
  evalúa, Then rueda al siguiente evento de esa ruta.

### US9 — Generar el pedido: UPDATE a orders + escritura a EFLOW `[1ª entrega]` (FR8, D7/D8)
Como **Sistema/Motor OMS**, actualizo el pedido en `public.orders` y escribo de
vuelta a EFLOW, para dejarlo alistado (el flujo lo activó Planificación, D7).
> **ADR-013 (desacople priorización↔liberación)**: US9 cubre la **priorización**
> (deja `wms_situation = DISP`, **no** escribe `GENE`, **no** estampa
> `oms_processed_at`). La escritura `GENE`+`PRIORIDAD` y el estampado de
> `oms_processed_at` se mueven a la **liberación por ventana** (**US9b**) y a la
> **acción manual** (**US9c**).

- Given un pedido cuya regla se cumple, When el motor lo **prioriza**, Then
  **(escritura 1 — priorización)** hace **UPDATE a `public.orders`** por la **llave
  EFLOW** (`eflow_id_almacen/compania/sucursal/expedicion`) con `priority` (entero),
  `oms_score`, `prioritization_run_id` y `handoff_status`, **dejando
  `wms_situation = DISP`** (no `GENE`) y **sin** estampar `oms_processed_at`. **No hay
  tabla `oms.pedidos`.**
- Given la priorización, When el motor actúa, Then **NO escribe a EFLOW todavía** (la
  escritura 2 `GENE`+`PRIORIDAD` es de la **liberación**, US9b) ni el número de viaje
  (`numero_viaje` lo escribe Planificación). **(ADR-013: `GENE` diferido a
  `dispatch_date − dias_prep_picking`.)**
- Given un pedido no ingerido en `orders`, When el motor intenta la escritura 1,
  Then es un **error** (no se priorizan pedidos que no se cargaron desde EFLOW).
- Given cualquier escritura del motor, When actúa, Then **no escribe fechas**, **no
  escribe el número de viaje** y **no toca el picking** (invariantes verificables).
- **Orden (dev/QA)**: Given las dos escrituras, When el motor procesa, Then la
  escritura 1 (`orders`, Aurora) ocurre **antes** que la 2 (EFLOW).
- **Fallo parcial (dev/QA)**: Given la escritura 1 confirmada, When la 2 (EFLOW)
  falla, Then el pedido queda `handoff_status = disparo_pendiente` y se **reintenta
  idempotente** por la llave EFLOW, sin re-crear el handoff. `ponytail:` dos stores
  (Aurora + SQL Server EFLOW) sin 2PC — techo = orden + reintento; upgrade =
  outbox/reconciliación.
- **Re-priorización idempotente (ADR-013)**: Given un pedido **priorizado pero no
  liberado** (`oms_processed_at IS NULL`), When corre otro barrido tras un **replan**
  (nuevo `dispatch_date`/`lead_time_days`), Then el motor **re-prioriza** (actualiza
  `priority`/`oms_score`/`prioritization_run_id`) para mantenerlo alineado al último
  plan, sin duplicar (UPDATE por llave EFLOW). Un pedido ya **liberado**
  (`oms_processed_at` estampado) no vuelve a la cola.

### US9b — Liberar el viaje por ventana (`dispatch_date − 1`) `[1ª entrega]` (FR8, D14/ADR-013)
Como **Sistema/Motor OMS**, libero a eFlow los pedidos **priorizados** cuando su
viaje entra en la ventana de salida, para que el picking no arranque antes de tiempo
y todos los pedidos del viaje se liberen **juntos**.
- Given pedidos priorizados-no-liberados (`oms_processed_at IS NULL`,
  `wms_situation = DISP`), When corre la **pasada de liberación** y
  `now() >= dispatch_date − dias_prep_picking` (`dias_prep_picking = 1` por defecto,
  política del OMS), Then el motor **(escritura 2)** escribe
  **`TPEXSI = 'GENE'` + `PRIORIDAD`** por la costura `EscritorSituacion` (hoy →
  `sim_expedicionescabecera`; `TPEXES` permanece `DISP`) y **estampa
  `oms_processed_at = now()`** (los saca de la cola).
- Given que `dispatch_date` es **igual para todos los pedidos de un `numero_viaje`**,
  When un viaje cruza la ventana, Then **todos sus pedidos se liberan juntos** sin
  navegar `plan_trips`/`routes` (se lee **solo `orders`**).
- Given un pedido cuya ventana **aún no llegó** (`now() < dispatch_date −
  dias_prep_picking`), When corre la liberación, Then **no se libera** (sigue en
  `DISP`, espera a la siguiente corrida).
- Given la escritura `GENE`, When falla la escritura 2 tras marcar, Then queda
  `handoff_status = disparo_pendiente` y se reintenta idempotente por la llave EFLOW
  (mismo mecanismo de US9).
- **Testabilidad**: la ventana se prueba con un `dispatch_date` relativo a `now()`
  (dentro/fuera de ventana), determinista, sin tocar eFlow real.

### US9c — Procesar a Eflow un viaje manualmente `[1ª entrega]` (FR8, FR4, D14/ADR-013)
Como **rol autorizado** (gated), quiero **adelantar** la liberación de un viaje
("Procesar a Eflow", nombre temporal) cuando picking/packing está ocioso, sin esperar
a la ventana automática.
- Given un `numero_viaje` priorizado-no-liberado, When ejecuto "Procesar a Eflow",
  Then el OMS corre la **misma lógica de liberación de US9b filtrada por ese viaje**
  (+ subconjunto opcional de pedidos) e ignora la ventana temporal para ese viaje.
- Given un usuario **sin permiso**, When intenta la acción, Then se **deniega**
  (fail-closed, coherente con US15); la acción se oculta/deshabilita en UI.
- Given la acción manual, When libera, Then usa la **misma escritura 2** (costura
  `EscritorSituacion`) y estampa `oms_processed_at = now()` igual que US9b (reusa el
  camino, no duplica lógica).
- **Auditoría**: Given una liberación manual, When ocurre, Then queda registrada como
  acción **manual** con el usuario (coherente con US33).

### US10 — Asignar prioridad numérica `[1ª entrega]` (FR3)
Como **Sistema/Motor OMS**, asigno una prioridad numérica invertida (menor = más
urgente), según la estrategia de numeración de la compañía, para ordenar el
alistamiento. **Sin niveles nombrados** (no hay crítico/alto/medio/bajo).
- Given las reglas activas que aplican a un pedido, When el motor calcula, Then
  obtiene el **score ponderado** (suma de pesos; mayor peso = cliente retira, luego
  fecha) y lo guarda en `oms_score` (auditable).
- **Cofersa — días hasta la salida (v4.2)**: Given un pedido de Cofersa en la cola
  (estrategia `dias_hasta_salida`), When corre el barrido, Then su prioridad es el
  **número de días que faltan para su salida**: sale mañana ⇒ **1**, pasado ⇒ **2**,
  en 3 días ⇒ **3**.
- **0 nunca en la cola (v4.2)**: Given un pedido de Cofersa cuya salida es hoy o ya
  pasó, When corre el barrido, Then su prioridad es el **piso de cola (1)**, **nunca
  0**. El `0` se reserva para el pedido ya liberado (situación generada).
- **Fecha centinela (v4.2)**: Given un pedido de Cofersa con la fecha de entrega
  por default/centinela, When corre el barrido, Then recibe el **piso de cola**
  (urgente, para que se revise).
- **Escala lineal (compañías sin estrategia propia)**: Given un pedido de una
  compañía con `escala_lineal` (default), When el motor calcula, Then el score se
  mapea a `[1, escala_prioridad]` invertido (comportamiento previo, sin cambio), y el
  de cliente retira obtiene **menor número** que uno solo con la regla de fecha.
- Given dos pedidos con el **mismo número de prioridad**, When el motor ordena, Then
  aplica un **desempate estable** (fecha de entrega, luego hora de entrada, luego id)
  para que el orden sea determinista entre corridas.
- **Alcance 1ª entrega**: la prioridad de Cofersa solo usa la regla de tiempo y
  cliente-retira; cómo pesan otras reglas dentro del día está aparcado (OQ-PRIO-A).

### US10b — Elegir estrategia de numeración por compañía `[1ª entrega]` (FR3)
Como **Administrador de Módulo**, quiero que cada compañía tenga su propio esquema
de numeración de prioridad, elegido por config (estrategia + parámetros por scope),
para incorporar compañías que numeran distinto sin cambiar el motor.
- Given la fila de `oms_rule_configs` de Cofersa con `estrategia =
  'dias_hasta_salida'`, When corre el barrido, Then sus pedidos se numeran por días
  hasta la salida (US10); las demás compañías siguen en `escala_lineal`.
- Given una fila sin `estrategia` o con un nombre desconocido, When corre el barrido,
  Then el motor usa `escala_lineal` (fallback seguro, sin romper la corrida).
- Given una compañía que numera igual que Cofersa pero con otra ancla o piso, When se
  ajustan `ancla_fecha` (`alistado` | `entrega`) y `prioridad_piso` en su fila, Then
  cambia la numeración **sin código nuevo**.
- Given `prioridad_piso = 0` en una fila, When se lee la config, Then se respeta el
  0 (no se fuerza a 1); el default, si la columna no viene, es 1.
- Given la vista Motor de Reglas, When se usa, Then **no** se arman fórmulas desde
  la UI: la lógica de cada estrategia vive en código; la config solo elige cuál y
  con qué parámetros (DECIDED "no es constructor dinámico"). Hoy la elección se fija
  por config/migración (`sql/55`); editarla desde la UI es posterior (E5).
- Nota: si las demás compañías de mayoreo numeran igual que Cofersa (OQ-PRIO-B, sin
  confirmar), basta con apuntar su fila a `dias_hasta_salida`.

### US11 — Revisitar prioridades periódicamente `[siguiente]` (FR3.8, NFR1)
Como **Sistema/Motor OMS**, recalculo la prioridad en cada barrido (ADR-013: 5×/día),
para que baje sola conforme se acerca la salida.
- Given un pedido de Cofersa con prioridad **2** hoy, When corre el barrido del día
  siguiente, Then su prioridad es **1** (días hasta la salida, recalculado).
- Given un pedido de Cofersa con prioridad 1, When se libera, Then sale de la cola
  (en el WMS queda como generado; el `0` = liberado nunca se muestra en la cola).
- Given pedidos de una compañía con `escala_lineal`, When el motor corre al día
  siguiente, Then su **número de prioridad no sube** respecto a la corrida anterior
  (la urgencia por fecha crece).

### US11b — Cortar por umbral de inyección `[1ª entrega]` (FR3.4, NFR4)
Como **Sistema/Motor OMS**, solo preparo pedidos hasta cierta prioridad, para no
inyectar más de lo que la capacidad soporta (~80 en proceso).
- Given un umbral de inyección `U` (configurable) y pedidos con prioridad peor
  que `U` (número mayor), When el motor corre, Then esos pedidos **no** se
  generan (no pasan a `GENERADA`) y esperan a la siguiente corrida.
- Given pedidos con prioridad ≤ `U`, When el motor corre, Then sí se generan.
- Nota: el valor de `U` se afina con OQ-5; el comportamiento de corte es
  verificable ahora con un umbral parametrizable.

---

## E2b — EPA (prioridad pre-asignada por EPRAC)

### US-EPA — Liberar los pedidos de EPA sin recalcular `[1ª entrega]` (FR6b)
Como **Sistema/Motor OMS**, para EPA **no calculo** la prioridad: la trae
pre-asignada **EPRAC** y yo solo la libero, porque EPA cortocircuita el score.
- Given un pedido de EPA (`customer_type = TIENDA`), When el motor lo procesa,
  Then **NO pasa por T−duración ni por el score ponderado**: es una **rama propia
  que cortocircuita** el motor de fecha/score.
- Given un pedido de EPA con la prioridad que le pre-asignó EPRAC, When el motor
  lo procesa, Then toma **la prioridad que trae (1 o 2) sin recalcular**; ese valor
  no cambia y nunca es 0.
- Given el flujo de escritura, When el motor procesa un pedido EPA, Then la
  **priorización** usa la escritura 1 de US9 (UPDATE a `orders`, `DISP`, sin
  `oms_processed_at`) y la **liberación** usa US9b/US9c (EFLOW `TPEXSI='GENE'` +
  `PRIORIDAD` por la costura, estampa `oms_processed_at`), sin número de viaje, con
  la prioridad que trae (1 o 2).
- **v4.2 — sin cambio**: Given el cambio de escala de Cofersa (US10/US10b), When el
  motor procesa EPA, Then **nada cambia** para EPA (`priorizar=false`; no se le
  aplica `dias_hasta_salida`).
- **Nota OQ-EPA-VAL — CERRADA 2026-10-30: EPA = 1 y 2 (confirmado por Eduardo;
  fuente 2026-09-01)** (ver ADR-009, nota de corrección). "0 = liberado" es
  convención de la estrategia `dias_hasta_salida` de Cofersa (piso de cola 1), no
  un invariante global de `orders.priority`. EPA usa 1 y 2 (nunca 0), así que no
  hay roce.

---

## E3 — Análisis de observaciones con IA `[FUTURO — D11]`

> **Desprioritizado (D11, 2026-10-16)**: "cliente retira" se modela como **zona**
> (US13), no interpretando observaciones. El análisis de observaciones por IA
> (Bedrock) **sale de esta entrega** y queda **futuro**. US12 pasa a `[futuro]`.

### US12 — Interpretar observaciones con IA `[futuro]` (FR7)
Como **Sistema/Motor OMS**, (a futuro) interpretaría el texto libre de
`observaciones` con IA (Bedrock) para salidas como cambio de dirección/cita.
- Diferido: no se construye en esta entrega. "cliente retira" ya **no** depende de
  esto (pasó a ser zona, US13). Se conserva como requerimiento futuro (FR7).

### US13 — Detectar "cliente retira" por ZONA y priorizarlo `[1ª entrega]` (FR6.2)
Como **Sistema/Motor OMS**, identifico los pedidos "cliente retira" por su **zona**
(`delivery_zone`) y les asigno la prioridad más alta **de la cola**, para segregarlos.
- Given un pedido cuya **zona** (`delivery_zone`) es la de **"cliente retira"**,
  When el motor lo procesa, Then recibe la **prioridad más alta de la cola** y se
  agrupa en su viaje/cliente correspondiente. **(D11: por zona, NO por el texto de
  observaciones ni por IA.)**
- **Piso de cola (v4.2)**: Given un pedido "cliente retira" de Cofersa
  (`dias_hasta_salida`), When el motor lo procesa, Then su prioridad es el **piso de
  cola = 1**, **nunca 0** (0 = liberado), aunque su salida sea en varios días.
- Given un pedido "cliente retira" de una compañía con `escala_lineal`, When el
  motor lo procesa, Then su prioridad es `prioridad_cliente_retira` acotado a
  `[1, escala_prioridad]`.
- **Testabilidad**: la detección se prueba con un dato de zona (zona = retira ⇒
  piso de cola; zona normal ⇒ no), determinista, sin dependencia de IA.

---

## E4 — Override manual

### US14 — Alterar la prioridad de un pedido puntual `[1ª entrega]` (FR4.1, FR4.2)
Como **Responsable del OMS** (rol autorizado), quiero cambiar la prioridad de un
pedido puntual con un motivo, para casos extraordinarios.
- Given un pedido en la cola, When ejecuto un override con un nuevo valor y un
  **motivo obligatorio**, Then la prioridad cambia y queda registrado en la
  Auditoría como cambio **manual**.
- Given un override **sin motivo** (o con valor fuera de rango), When intento
  guardarlo, Then se rechaza (criterio negativo).
- **UX (prevención de error)**: Given el formulario de override, When el motivo
  está vacío o el valor es inválido, Then el botón Aplicar está deshabilitado y
  el requisito se muestra antes de intentar guardar, no como alerta posterior.

### US15 — Impedir override sin permiso `[1ª entrega]` (FR4.3, FR14)
Como responsable de seguridad, quiero que solo roles autorizados hagan override,
para proteger el cálculo.
- Given un usuario sin permiso de override, When intenta alterar la prioridad,
  Then la acción se deniega.
- **UX**: Given un usuario sin permiso, When ve el detalle, Then las acciones sin
  permiso se **ocultan o deshabilitan con tooltip** (no se ofrecen para luego
  rebotar).

### US15b — Cambiar la prioridad sin anular (reenviar registro) `[1ª entrega]` (FR4.4, D12)
Como **Sistema/Motor OMS**, cambio la prioridad reenviando el registro mientras el
pedido esté disponible o disponible/generada, para no tener que anular.
- Given un pedido en situación **disponible** o **disponible/generada**, When
  cambia su prioridad, Then se **reenvía el registro** con la nueva prioridad (no
  se anula ni se revierte el pedido).
- Given tareas **ya generadas**, When cambia una prioridad, Then el OMS **no las
  reordena** (el cambio aplica hacia adelante, no reescribe lo ya ejecutado).
- Given un cambio de **fecha de entrega** (no de prioridad), When ocurre, Then
  **pasa por Planificación** (replanifica), no por el OMS.

---

## E5 — Motor de Reglas (catálogo semi-configurable)

### US16 — Ver el catálogo de reglas por compañía `[siguiente]` (FR5.1, FR5.3)
Como **Administrador de Módulo**, quiero ver las reglas implementadas de una
compañía, para gestionarlas.
- Given una compañía seleccionada, When abro el Motor de Reglas, Then veo sus
  reglas (nombre, descripción, estado, peso, parámetros); al cambiar de compañía
  cambia la lista.
- Given la vista, When la uso, Then **no** puedo crear reglas nuevas (la lógica
  vive en código).

### US17 — Activar/desactivar y ajustar peso de una regla `[siguiente]` (FR5.1)
Como **Administrador de Módulo**, quiero activar/desactivar una regla y ajustar
su peso, para el rollout por etapas.
- Given una regla, When la desactivo, Then deja de aplicar en el cálculo.
- Given una regla, When cambio su peso, Then el nuevo peso se usa en el score.

### US18 — Editar los parámetros de una regla `[siguiente]` (FR5.2)
Como **Administrador de Módulo**, quiero editar los parámetros de una regla
(días de T-1, horas de corte, umbral de inyección, patrón/prioridad/ventana de
cliente retira), sin tocar su lógica.
- Given una regla con parámetros, When los edito y guardo, Then se persisten;
  la **lógica/prompt no es editable** desde la UI.

---

## E6 — Simulador (configurador de simulaciones) `[FUERA DE ALCANCE — 2026-10-19/20]`

> **FUERA DE ALCANCE (2026-10-19/20, §13)**: el **Simulador** queda **fuera del
> alcance** del OMS como entrega. Es **desarrollo opcional**, visible **solo para el
> rol `Developer`**. Esta decisión **supera** el `DECIDED` "Simulador = configurador"
> (2026-09-15): **no se toma en cuenta en el diseño de U1**. US19–US24/US24b se
> conservan solo como registro (opcional/futuro, no 1ª entrega); no trazan a trabajo
> de construcción de U1. La restricción de acceso a `Developer` (FR9.0/FR14.4) sigue
> vigente **si** alguna vez se construye.

### US19 — Configurar una corrida en el modal previo `[siguiente]` (FR9.1, FR9.2)
Como **Developer**, quiero elegir qué reglas activas y qué pedidos
entran a una simulación, para acotarla.
- Given el modal previo, When lo abro, Then vienen por defecto todas las reglas
  activas y puedo desmarcar/elegir un subconjunto.
- Given el modal previo, When filtro por situación (`DISP`, `GENERADA`…), Then la
  simulación aplica a ese conjunto — incluido **re-simular sobre prioridades ya
  asignadas**.

### US20 — Ver el resultado como tabla-Cola `[siguiente]` (FR9.3)
Como **Developer**, quiero ver el resultado de la simulación como una
tabla igual que la Cola, para evaluarlo con todas las columnas.
- Given una simulación ejecutada, When se muestra, Then aparece como tabla con
  todas las columnas (o selección), no como un recuadro de "estado actual".

### US21 — Persistir la simulación (bitácora) `[siguiente]` (FR9.4)
Como **Developer**, quiero que cada simulación quede registrada, para
tener trazabilidad.
- Given una simulación, When se ejecuta, Then se persiste con fecha, autor
  (usuario/automático), reglas usadas, filtro, estado (`simulada`/`aplicada`) y
  compañía.

### US22 — Restringir a una simulación aplicada por compañía `[siguiente]` (FR9.4)
Como **Developer**, quiero que solo haya una simulación aplicada por
compañía, para evitar priorizaciones en conflicto.
- Given varias simulaciones `simuladas` de una compañía, When aplico una, Then
  queda como la **única `aplicada` de esa compañía** (la anterior deja de estarlo).

### US23 — Aplicar manual / automática / mixta `[siguiente]` (FR9.5)
Como **Developer**, quiero elegir el modo de aplicación, para validar
manualmente al inicio y automatizar cuando confíe.
- Given modo manual, When reviso y pulso "Aplicar", Then la simulación se aplica.
- Given modo automático, When se genera, Then se aplica sola.
- Given modo **mixto** con **hora de corte**, When nadie interviene antes de esa
  hora, Then se aplica sola; When alguien interviene antes, Then espera su
  decisión. Borde: una intervención **en el minuto exacto** del corte se trata
  como "antes del corte" (gana la intervención).
- **UX (acción de alto impacto)**: Given que aplicar sustituye la simulación
  aplicada vigente de la compañía (US22), When pulso "Aplicar", Then se pide una
  confirmación explícita ("esto sustituye la priorización vigente de {compañía}").

### US24 — Configurar simulaciones por compañía `[siguiente]` (FR9.6)
Como **Developer**, quiero configurar el número de simulaciones al
día, su frecuencia/horarios, el filtro de situación y el modo por simulación,
para adaptarlo a cada compañía.
- Given la configuración de una compañía, When defino varias simulaciones (p. ej.
  una para `DISP` y otra para `DISP`/`GENERADA`) con sus horarios y modo, Then el
  sistema las programa por compañía.
- Nota: esta configuración vive **dentro de la vista Simulador**, por lo que solo
  es alcanzable por `Developer` (US24b). Antes se preveía para el Administrador de
  Módulo; con la restricción del 2026-10-01 queda bajo `Developer`.

### US24b — Restringir la vista Simulador al rol Developer `[siguiente]` (FR9.0, FR14.4)
Como **sistema/seguridad**, quiero que la vista Simulador solo sea visible y
accesible para el rol `Developer`, para que sea una herramienta de
diagnóstico/pruebas y no una pantalla operativa de usuarios normales.
- Given un usuario con rol `Developer`, When entra al OMS, Then ve la entrada
  "Simulador" en la navegación y puede abrir su ruta.
- Given un usuario con cualquier otro rol (normal, Administrador de Módulo, Jefe
  de Almacén, Responsable del OMS), When entra al OMS, Then **no** ve la entrada
  "Simulador" y, si navega directo a su ruta, el acceso se **deniega
  fail-closed** (no solo oculto en UI; también denegado en el backend/matriz de
  permisos).

---

## E7 — Panel y Auditoría

### US25 — Ver la salud del motor `[siguiente]` (FR11.1)
Como **Jefe de Almacén**, quiero un panel con indicadores operativos, para
detectar anomalías.
- Given el Panel, When lo abro, Then veo al menos: nº de pedidos generados hoy,
  % de override manual (ventana configurable, US26) y nº de pedidos en proceso
  (~capacidad); cada KPI con su valor del día.

### US26 — Indicador de % de override con ventana configurable `[siguiente]` (FR11.2)
Como **Jefe de Almacén**, quiero ver el % de override manual con una ventana
temporal configurable, no fija.
- Given el indicador, When cambio la ventana (24 h / 12 h / semana), Then el %
  se recalcula para esa ventana.

### US27 — Auditar priorizaciones auto/manual `[1ª entrega]` (FR11.3)
Como **Responsable del OMS**, quiero un registro de solo lectura de las
priorizaciones ejecutadas, distinguiendo automático vs. manual.
- Given priorizaciones ejecutadas, When abro la Auditoría, Then veo cada una con
  su tipo (automático/manual) y, en manual, el usuario y motivo.
- Given un registro de auditoría, When un usuario intenta editarlo o borrarlo,
  Then la acción se deniega (solo lectura, NFR6 — criterio negativo).

---

## E8 — Calendario de rutas `[RETIRADA por D5]`

> **Épica RETIRADA.** US28 (consultar calendario) y US29 (CRUD del calendario)
> se eliminan con el ruteo dinámico multi-fuente ("la ruta manda", D5): las rutas
> dejan de ser fijas, así que no hay un calendario de rutas que el OMS consulte o
> mantenga. Se conservan aquí solo como marca de deprecación; ver "Fuera de
> alcance". El rol **Operador de Despacho** que las sostenía sale del alcance.

---

## E9 — Multi-compañía (por scope) y seguridad

### US30 — Aislar datos por scope país→almacén→cliente `[siguiente]` (FR13, NFR5)
Como responsable de seguridad, quiero que las operaciones no crucen datos entre
scopes (país/almacén/cliente), para garantizar aislamiento.
- Given un usuario con un scope (país/almacén/cliente, o GLOBAL), When lee o
  escribe, Then solo afecta datos dentro de su scope (`user_scopes`, evaluado en
  el repositorio, fail-closed).
- Given un usuario "Operativo EPA" (scope=CUSTOMER EPA), When consulta, Then
  **nunca** obtiene datos de Cofersa (criterio negativo verificable).
- **Jerárquico (QA H3)**: Given un usuario scope=COUNTRY (p. ej. CR), When
  consulta, Then ve todos los almacenes/clientes de su país y **ninguno** de otro
  país (la cobertura cascada país→almacén→cliente).
- **GLOBAL (QA H3)**: Given un usuario scope=GLOBAL, When consulta, Then ve todas
  las compañías/países (caso positivo — fail-closed no es "deniega siempre").
- **fail-closed nulo (QA H3)**: Given un usuario **sin** scope (o scope
  indeterminado), When consulta, Then obtiene **0 filas** / se deniega (nunca
  "todo").

### US31 — Regla específica por scope `[siguiente]` (FR13.1)
Como **Sistema/Motor OMS**, aplico las reglas con **scope**
(CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL) en Lambdas compartidas por función, para
respetar la lógica particular de cada compañía/cliente sin una Lambda por
compañía.
- Given un pedido de un cliente (p. ej. Cofersa), When el motor corre, Then
  aplica las reglas cuyo scope cubre ese cliente/almacén/país (la más específica
  gana), evaluadas en la Lambda compartida — no en una Lambda por compañía
  (C3-SUPERSEDE).

### US32 — Niveles de acceso `[siguiente]` (FR14.1, FR14.2)
Como responsable de seguridad, quiero tres niveles de acceso (visualización,
operación, administración), para proteger las acciones sensibles.
- Given un usuario de nivel visualización, When intenta una acción de operación
  o administración, Then se deniega.

### US33 — Registrar el autor de cada escritura `[1ª entrega]` (FR14.3)
Como responsable de gobernanza, quiero que toda escritura registre quién la
hizo, para trazabilidad.
- Given una acción de escritura (override, cambio de regla, etc.), When se
  ejecuta, Then la Auditoría registra el identificador del usuario.

## Dependencias y supuestos (Open Questions, no son historias)

Estas Open Questions del `requirements.md` condicionan varias historias pero
**no se modelan como historias** (dependen de datos/arquitectura/cliente):

- OQ-2 (réplica `EFLOW_OLO` no existe) → habilita E1/E2 en producción.
- OQ-3 (Cofersa no envía la fecha de entrega) → afecta US7 (fallback por ruta).
- OQ-4 (tabla de prioridades del cliente) → afina US10. **Resuelta para Cofersa
  (v4.2)**: número = días hasta la salida; para el resto de mayoreo sigue como
  OQ-PRIO-B.
- **OQ-PRIO-A (APARCADA por negocio, v4.2)** → cómo pesan otras reglas /
  observaciones dentro de un mismo día en la escala de Cofersa. Fuera de la 1ª
  entrega (solo fecha + cliente-retira). Afina US10 a futuro.
- **OQ-PRIO-B (v4.2)** → ¿las demás compañías de mayoreo numeran igual que Cofersa?
  Antonio lo presume, sin confirmar (falta almacén: Dylan/José). US10b lo absorbe
  por config, pero la confirmación de negocio sigue abierta.
- **OQ-PRIO-C (v4.2)** → ancla fina del día: hoy salida = fecha de alistado objetivo
  (`delivery_date − lead_time_days`); falta afinar el off-by-one frente a la ventana
  de liberación de ADR-013 (`dispatch_date − dias_prep_picking`). Afina US10/US11.
- **OQ-EPA-VAL — CERRADA 2026-10-30: EPA = 1 y 2 (confirmado por Eduardo; fuente
  2026-09-01)** → afina US-EPA.
- OQ-5 (score vs. filtro estricto; umbral de inyección) → afina US10/US11b.
- OQ-6 (duración de rutas y horas de corte) → habilita US8.
- OQ-7 (viaje cliente retira) → contexto de E3 (US13).
- OQ-8 (gap peso/volumen del handoff, `capacity_known:false`) → dependencia del
  handoff a Planificación (US9), no del cálculo de prioridad.
- OQ-1 (BD `logistica_olo`) → contexto general.
- **OQ-BO1/BO2/BO3** (backorder: tabla/estado de acciones omitidas en EFLOW,
  fuente de inventario, disparador del re-chequeo) → afinan US-BO; hechos de
  integración/negocio para la próxima reunión, no se cierran en esta rebanada.
- **OQ-REL1** (liberación, D14/ADR-013) → un pedido **ya liberado**
  (`oms_processed_at` estampado) que un **replan** mueva a otro viaje/fecha queda
  potencialmente stale. Afina US9b; **no bloquea** v1 (se acepta hasta cerrar con
  negocio si hay reconciliación/alerta).

---

## E10 — Backorder / inventario (nueva responsabilidad del OMS)

### US-BO — Re-generar las acciones omitidas por inventario cuando entra stock `[siguiente]` (FR6c, D13)
Como **Sistema/Motor OMS**, re-genero automáticamente las líneas que quedaron en
falta por inventario cuando entra stock, para no depender de que alguien lo haga a
mano.
- Given es un **loop/componente propio DESACOPLADO** de la ruta de priorización,
  When corre, Then **no** forma parte del handoff de la corrida ni de la lambda de
  activación (FR0): es una **revisión continua / por evento**.
- Given acciones liberadas que quedaron **omitidas por falta de inventario**, When
  el loop las lee, Then las identifica como backorder pendiente.
- Given que **entra stock** para una acción omitida, When el loop lo detecta, Then
  **re-manda a generar solo esa acción** (situación `GENE` con su prioridad), sin
  intervención manual.
- **Alcance de esta rebanada**: basta el **esqueleto del componente + las open
  questions** (OQ-BO1/BO2/BO3). El diseño fino (tabla/estado de origen, fuente de
  inventario, disparador) **no se cierra** aquí — son hechos de integración para la
  próxima reunión.

## Fuera de alcance (retirado en esta re-corrida)

- **E8 — Calendario de rutas (US28–US29), RETIRADA por D5.** Con el ruteo
  dinámico multi-fuente, las rutas dejan de ser fijas; el OMS ya no consulta ni
  mantiene un calendario de rutas. Se retira del cuerpo activo; el rol Operador
  de Despacho sale del alcance del OMS.
- **Armado de viajes / ruteo dinámico** — es de Planificación (intent
  `260825-route-planning-reqs`), no del OMS. Estas historias no lo modelan; solo
  citan la frontera del handoff (US9: Planificación lee la tabla del OMS).
- **E6 — Simulador (US19–US24/US24b), FUERA DE ALCANCE (2026-10-19/20, §13).**
  Desarrollo **opcional**, visible solo para rol `Developer`. Supera el `DECIDED`
  "Simulador = configurador" (2026-09-15). No entra en el diseño ni la construcción
  de U1; se conserva solo como registro para un posible futuro.

### Nota: refined-mockups debe re-correrse alineado al modelo v4

`refined-mockups` (`mockups.md`) quedó desalineado. Al re-correrse debe
reconciliar: prioridad numérica invertida (no *tiers*); Motor de Reglas como
catálogo con **selector de scope** (no *rule builder*); Simulador con modal
previo + tabla-Cola; retirar la alerta "sincronización al lago"; **retirar toda
pantalla/rastro del Calendario de rutas** (E8 retirada). **v4.2**: también debe
reconciliar la **escala 0..n de Cofersa** (número = días hasta la salida; la cola
nunca muestra 0; cliente-retira = piso de cola 1) y no mostrar los números del
universo del WMS (p. ej. 700) como si fueran de la escala del OMS. Se registra como
dependencia, no como historia.

Aportes de diseño del mob (a aterrizar en refined-mockups):
- **(D-1)** La ruta retirada del Calendario debe resolver a un **estado
  explicativo** ("el manejo de rutas se trasladó a Planificación"), no a un 404;
  retirar el ítem de navegación.
- **(D-2)** El detalle del pedido (US6) debe mostrar, **solo lectura**, la regla
  de ruta/corte aplicada (US7/US8) para que el override (US14) sea informado — sin
  reintroducir el calendario.
- **(D-4)** Selector de scope jerárquico: breadcrumb/pills del scope activo,
  herencia implícita visible, scope de un solo nivel como pill de solo lectura,
  navegable por teclado con `aria-label` de nivel.
- **(D-5)** Prioridad invertida **no dependiente solo del color** (número +
  etiqueta/ícono) y contraste AA.
- **(D-6/D-7)** Estados nuevos por la doble escritura (D6 quedó **SUPERSEDED por
  D7/D8**: escritura 1 = UPDATE a `public.orders`, escritura 2 = EFLOW real
  `TPEXSI='GENE'`+`PRIORIDAD`): **"handoff pendiente/desincronizado"**
  (`orders.handoff_status='disparo_pendiente'` si la escritura 2 a EFLOW falló tras
  la 1) y estado de handoff hacia Planificación (solo lectura, honesto si no hay
  dato). Posible historia de construcción, no de esta etapa.

Aportes de dominio/construcción del mob (a aterrizar en domain-design):
- **(dev/C2 — RESUELTO 2026-09-30)** La 1ª entrega **requiere construir el motor
  de priorización del OMS en Lambda (Python), NUEVO y propio del OMS, desde cero**:
  US9 escribe a Aurora + EFLOW, lo que el motor TS de frontend no puede hacer. El
  "esqueleto del motor de reglas propio del OMS en Lambda" es el **primer item** de
  la rebanada delgada, antes de US9. **C2 resuelto**: NO se porta el AST de
  `src/lib/tarifas/`, NO se comparte motor con el TMS, NO se toca Liquidaciones —
  "port TS→Python" y "regresión de Liquidaciones" quedan **fuera del alcance del
  OMS** (eliminados, no diferidos). OMS y TMS son módulos separados que se
  comunican.
- **(dev/US31)** La selección "la regla más específica gana" reusa la jerarquía de
  scopes (`covers()`) pero **aún no existe** en backend (hoy `covers()` resuelve
  autorización, no selección de regla) — es trabajo de domain-design/construcción.
- **(QA/US31)** Definir el **desempate de especificidad** cuando dos reglas están
  al mismo nivel de scope (determinista) — seguimiento para build-and-test.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  (**v4**, FR0–FR14 con FR12 retirado y FR7 diferido; flujo invertido D7–D13).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/personas.md`.
- `aidlc/spaces/default/memory/project.md` (`## Decided`: pivote D1–D5,
  C3-SUPERSEDE y los cambios de negocio **D7–D13** — inversión del flujo,
  escritura real a EFLOW, EPA/EPRAC, fecha generalizada, cliente-retira por zona,
  cambio sin anular, backorder).
- `aidlc/spaces/default/codekb/sto_tms_olo/business-overview.md`,
  `component-inventory.md` — dominio y componentes reales (backend Python/SAM).
- `docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md` —
  refinamiento v4.2 (US10, US10b, US11, US13, nota US-EPA).

## Assumptions & Open Questions

Ver **Dependencias y supuestos** y **Fuera de alcance** arriba. La épica
**E8/US28–US29 (Calendario de rutas) queda RETIRADA** por D5. La **Regla 5
(inventario) SÍ tiene historia ahora**: con D13 pasó a ser responsabilidad del OMS
y se modela en **E10/US-BO** (FR6c) — su diseño fino depende de **OQ-BO1/BO2/BO3**
(tabla/estado de acciones omitidas en EFLOW, fuente de inventario, disparador del
re-chequeo). La **Regla 4 (viaje/bajada)** sigue siendo `[futuro]` sin historia
propia (es de Planificación). **US12** (observaciones IA) queda `[futuro]` (D11).
La secuencia de construcción priorizará la **rebanada delgada de las reglas de 1ª
entrega**
(T-1 + cliente retira/observaciones) — decisión de negocio a aplicar en
domain-design.
