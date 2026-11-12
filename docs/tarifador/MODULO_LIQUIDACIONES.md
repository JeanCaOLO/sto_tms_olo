# Módulo Liquidaciones — documentación completa

> Ruta web: `/liquidaciones` · Código: `src/pages/liquidaciones/` (pantalla) y `src/lib/tarifas/` (lógica) ·
> Backend: `backend/tarifas/` · Permiso: módulo `tarifas`.
> Documento escrito el 2026-11-05 a partir de la lectura del código de la rama `dylan-tarifas`.
> Para el motor de cálculo en sí (reglas, tarifarios, estructuras de costo) ver `GUIA_TARIFADOR.md`.

---

## 1. Qué hace el módulo

Responde una sola pregunta: **¿cuánto se le paga a cada transportista por cada viaje completado, y por qué?**

- Toma los **viajes** que ya generó Guía de Despacho (`tbl_routes`), uno por uno.
- Calcula el total con el motor del tarifador (reglas, tarifario o estructura de costos, variables).
- **Emite** una *liquidación* (`LIQ-VE-001`…) que guarda el total **y el desglose completo** tal como se calculó.
- Permite **re-liquidar** (anular la vigente y emitir otra con motivo), **cambiar su estado** y consultarla en el **Historial**.
- Cada liquidación emitida **entra sola a la proforma abierta del transportista** (ver §7).

Lo que NO hace:
- No crea ni edita viajes (son de solo lectura; su dueño es Guía de Despacho).
- No cambia lo que se paga por una devolución: las devoluciones son informativas para el cálculo
  (pero **sí bloquean** la liquidación mientras estén sin recibir, ver §6).
- No borra liquidaciones: se **anulan**.

---

## 2. Pantalla (`/liquidaciones`)

| Zona | Qué muestra |
|---|---|
| Encabezado | Título, selector "ver como" (`ViewAsToggle`) y, para quien puede configurar, el interruptor de vista **simple / extendida** |
| Barra de país | País activo (`CountryScopeBar`); todo se filtra por ese país |
| 4 tarjetas | **Listos**, **Incompletos**, **Total liquidado**, **Sin aprobar** (suma de Borrador + En Revisión). Si el historial está paginado dice "(cargadas)" |
| Pestaña **Por Liquidar** | Viajes sin liquidación vigente. Chips: **Listos / Incompletos / Todos**. Botón *Liquidar* por fila y selección múltiple para *Liquidar N viajes* (lote) |
| Pestaña **Historial** | Liquidaciones emitidas (las más recientes primero, con "cargar más"), con ver desglose y re-liquidar. Fila expandible con los pedidos |
| Filtros | Rango de fechas Desde/Hasta (sobre la fecha del viaje) |

Clasificación de viajes (`tripProgress`, `src/lib/tarifas/tripOrders.ts`):
- **Listo** = viaje `completed` **y** todas sus guías entregadas **y** todas sus paradas completadas.
- **Incompleto** = cualquier otro caso (no completado, pedidos sin entregar, paradas pendientes).
- Los viajes **anulados** (`cancelled`) en Guía de Despacho nunca se listan.

Modales:
- **Liquidar viaje** (`LiquidarViajeModal`): cálculo, variables a mano, pedidos, devoluciones, notas, totales.
- **Liquidar lote** (`LiquidarLoteModal`): una fila por viaje, cada uno se emite por separado.
- **Detalle** (`DetalleLiquidacionModal`): desglose de una liquidación ya emitida.

---

## 3. Flujo de trabajo

### 3.1 Liquidar un viaje (camino normal)

1. En *Por Liquidar* se pulsa **Liquidar** (deshabilitado con el motivo en el *tooltip* si `notLiquidableReason` no es nulo).
2. Al abrir el modal se calcula (`calculateTrip`): viaje → perfil del transportista → catálogo del país → contexto → entrada → motor.
3. La persona puede:
   - cargar las **variables personalizadas por viaje** (peajes, recolectas, horas de espera…); recalcula tras una pausa al teclear;
   - **destildar líneas** del cálculo (se excluyen del total, se guardan en `excluded_seqs`);
   - **anular un pedido** o dejarlo **para liquidar después** (marca por pedido, ver §5.3);
   - informar **devoluciones** (factura, producto, parcial/total) — se precargan del tracking;
   - escribir **notas**; con vista extendida, elegir el **estado inicial** (en vista simple siempre nace `Borrador`).
4. **Emitir** (`useEmitTrip.emitir`):
   1. valida las devoluciones y las variables numéricas;
   2. **recalcula sin cachés** (`recheckBeforeEmit`): si el total cambió (alguien tocó una tarifa/regla/pedido), no emite, muestra "total anterior / total actual" y pide revisar;
   3. `emitSettlement`: bloquea si el motor reporta *blocking issues*; **relee el viaje** y vuelve a evaluar `notLiquidableReason`; genera el número `LIQ-<PAÍS>-NNN`;
   4. inserta la liquidación **y** la fila de bitácora en **una sola transacción**;
   5. sella el origen de reclamo si venía de uno (`stampClaimOrigin`) y la **asigna a una proforma** (`autoAssignSettlement`).
5. La pantalla recarga, pasa al **Historial** y resalta la liquidación nueva.

Protección contra doble clic: un `inFlight` ref bloquea el segundo envío durante la revalidación de red.

### 3.2 Lote

- Selección de hasta **10 viajes** (`MAX_LOTE`), solo viajes **listos** (sin pedidos pendientes y sin `notLiquidableReason`).
- Cada viaje calcula por su cuenta; se pide confirmación con cantidad y total (solo si es una moneda).
- Se emiten **en secuencia**; los que fallan quedan abiertos con su motivo. No es atómico entre viajes.

### 3.3 Re-liquidar

- Desde el Historial (botón ↻), solo si la liquidación no está anulada ni reemplazada y el usuario tiene `edit`.
- **Exige un motivo.**
- Bloqueos (`reliquidateLogic.ts`): la liquidación ya anulada; de otro viaje; **dentro de una proforma** (hay que excluirla o anular la proforma primero); el viaje ya no completado.
- En **una transacción**: anula la vigente (`status='Anulado'`, `superseded_by=<nueva>`), inserta la nueva y escribe **dos** filas de bitácora.
- La anulada conserva su snapshot; el historial dice qué se pagó antes, ahora y por qué.

### 3.4 Cambiar el estado

Transiciones permitidas (`statusTransitions.ts`):

| Desde | Hacia |
|---|---|
| Borrador | En Revisión, Aprobado, Pagado, Anulado |
| En Revisión | Borrador, Aprobado, Pagado, Anulado |
| Aprobado | Pagado, Anulado, En Revisión |
| Pagado | Anulado |
| Anulado | — (no se reactiva) |

- Una liquidación **reemplazada** (`superseded_by`) no se puede reactivar.
- Pedir confirmación en pantalla (`confirmStatusChange`); en bitácora `Aprobado`/`Pagado` se registran como `AUTHORIZE`.
- Al **anular**, el viaje **vuelve a la bandeja** *Por Liquidar* (`hadAnnulledSettlement`); si se anuló por reclamo de proforma, se muestra el motivo como indicación para re-liquidar.
- En el servidor, el `UPDATE` de estado es condicional: si otro usuario se adelantó responde **409**.

---

## 4. Qué datos consume

### 4.1 Lecturas (vía `GET/POST /api/tarifas/{tabla|vista}`)

| Entidad (frontend) | Tabla/vista | Para qué |
|---|---|---|
| `trip` | vista `tarifas_v_viajes` (sobre `tbl_routes`, `tbl_stores`, carriers, drivers, vehicles, zones) | El viaje: transportista, flota propia, conductor, vehículo (tipo y capacidad), zona destino, km, paradas, peso/volumen, horas, `guide_count`, `delivered_guides`, `return_count`, `settlement_id` |
| `dispatchGuide` / pedidos | `tbl_dispatch_guides` + pedidos | Pedidos del viaje (una guía = un pedido): valor, peso, volumen, casa comercial, estado de entrega |
| `tripReturn` | `tarifas_v_devoluciones` (sobre `tbl_returns`) | Devoluciones del viaje; las **sin recibir** (`pending`/`approved`) bloquean |
| `settlement` | `tbl_tarifas_settlements` | Liquidaciones vigentes y anuladas (flags del viaje), historial, números ya usados |
| catálogo (`loadTarifasCatalog`) | reglas, tarifarios, zonas, variables del perfil, estructura de costos, política de margen, país | Todo lo que necesita el motor |
| perfil (`getProfileForCarrierCached`) | perfil de cálculo del transportista | Reglas propias y variables PER_TRIP |
| contrato (`carrierBaseForCarrier`) | `carriers.rate_type` y contrato | Forma de cobro del tercero; vencimiento |
| `tripOrderMark` | `tbl_tarifas_trip_order_marks` | Marcas ANULADO/DIFERIDO por pedido |
| `proforma*` | tablas de proformas | Para asignar la liquidación |

### 4.2 Escrituras

Solo sobre las tablas de liquidación (`LIQUIDATION_TABLES`): `tarifas_settlements`, `tarifas_audit_log`, `tarifas_trip_order_marks`; y las de proformas (las crea/alimenta solo, ver §7). Todo lo demás es de solo lectura.

### 4.3 Qué guarda una liquidación (`SettlementRecord`)

El desglose se guarda **desnormalizado y sin referencias a reglas**, a propósito: una liquidación emitida se relee tal cual se emitió aunque la regla cambie o se borre.

Incluye, entre otros: `number`, `trip_id`, `trip_number`, `settlement_date` (fecha del viaje), `status`, `currency`, `total_amount`, `cost_total`, `margin_*`, `cargo_value`, `allocation` (reparto por casa comercial), `orders` (pedidos y qué se hizo con cada uno), `trip_info` (**foto del viaje releído al emitir**), `trip_edits` (variables cargadas), `trip` (contexto del motor), `trace` (línea por línea), `discarded`, `stage_subtotals`, `warnings`, `overrides`, `adhoc_rules`, `rules_used`, `excluded_seqs`, `base_change`, `returns`, `superseded_by`, `void_kind/void_reason`, `from_claim_id`.

---

## 5. Cómo se calcula (resumen)

### 5.1 Cadena (`src/lib/tarifas/tripSettlement.ts`, camino único)

`viaje` → `perfil del transportista` → `base de cobro` → `catálogo del país + perfil` → `detectMissingLogic` → `toTripContext` (puro) → `buildCalculateInput` (puro) → `calculate` (motor, puro).

- **Flota propia** (`is_flota_propia`): siempre su estructura de costos.
- **Tercero**: la forma de cobro del catálogo de Transportistas (`carriers.rate_type`, sin default; con TENDERING el monto es el adjudicado). Si falta, **se bloquea** con el motivo (`BASE_NO_DEFINIDA`).
- El tipo de flota sale **solo** de `carriers.is_flota_propia`.
- `clientCount` = paradas **completadas** (se paga lo hecho, no lo planificado).
- Zona del viaje = solo **destino**; el origen queda vacío.
- Capacidad del vehículo en kg/m³ (el motor usa toneladas). Sin capacidad, las reglas por volumen/tonelaje valen 0 y se avisa.
- Fases del total: `BASE`, `VARIABLE`, `ADJUSTMENT`, `TAX` (las 6 etapas antiguas se normalizan al leer).
- Sin lógica de costos para la flota del viaje, o ninguna regla aplicada a un tercero → `catalog-error` con enlace para configurarla (no se inventa un total).
- Contrato **vencido**: avisa, **no bloquea**.

### 5.2 Margen (auditoría)

`margen = valor de la mercancía − gastos`, `pct = margen / valor`. Estados `OK / WARN / CRITICAL / LOSS` según la política. **No bloquea, no cambia lo que se paga**; sin valor de mercancía no se inventa (`basis = NONE`).

### 5.3 Marcas por pedido

Quien liquida puede **anular** un pedido (exige motivo; no entra al reparto ni a la mercancía auditada) o marcarlo **DIFERIDO** (se reparte, pero su proforma queda pendiente). Ninguna marca cambia el pago al transportista.

### 5.4 Devoluciones en la liquidación

Se guardan en `returns` (factura, producto, PARCIAL/TOTAL, notas) y se añaden a la nota. **No entran al cálculo.**

---

## 6. Relación con el módulo Devoluciones (regla de bloqueo)

Un viaje con devoluciones **sin recibir** no se puede liquidar.

- **Qué cuenta**: devoluciones en estado `pending` o `approved` (las `received` y `cancelled` no bloquean).
- **Frontend** (`tripContext.notLiquidableReason`): el viaje trae `openReturns` (`openReturnCounts` en `trips/queryHelpers.ts`) y el botón queda deshabilitado con el mensaje
  *"No se puede liquidar el viaje X porque tiene N devolución(es) sin recibir. Recíbelas en el módulo de Devoluciones y vuelve a intentarlo."*
  Lo usan la tabla, el cálculo, el lote y la emisión.
- **Backend** (`backend/tarifas/src/returns_gate.py`): rechaza con **409** el `INSERT` de `tarifas_settlements` (también en `/tx` y `insert_many`). Activo con `TMS_RETURNS_GATE=on` (en `template.yaml`; sin la variable, el código por defecto es `off`).
- **Quién decide de verdad**: el backend. Si el frontend no puede leer las devoluciones, no se cae (devuelve conteo vacío y avisa en consola) y el servidor igual rechaza.
- Detalle y despliegue: `DESPLIEGUE-DEVOLUCIONES.md` (raíz).
- **Re-liquidar** también inserta una liquidación nueva, así que el backend lo rechaza (409) si el viaje tiene devoluciones sin recibir. En pantalla, la re-liquidación solo valida que el viaje siga completado; el bloqueo por devoluciones llega como error del servidor.

---

### 6.1 Orden de validaciones al liquidar (`notLiquidableReason`)

1. Viaje **no completado** → "Solo se liquidan viajes completados en guía de despacho".
2. Ya tiene **liquidación vigente** → usar re-liquidar.
3. Tiene **devoluciones sin recibir** → mensaje de §6.
4. Sin **transportista** asignado.

Luego, en el cálculo: base de cobro definida, zona destino válida, lógica de costos/regla aplicable, *blocking issues* del motor.

---

## 7. Con qué se comunica

```
Guía de Despacho (tbl_routes, guías, pedidos) ──▶ tarifas_v_viajes ──┐
Tracking mobile (devoluciones, entregas) ──▶ tbl_returns ──▶ Devoluciones ──(recibir)──┤
Catálogos: Transportistas, Conductores, Vehículos, Zonas, Países ─────┤
Tarifador (reglas, tarifarios, costos, variables, margen) ────────────┤
                                                                       ▼
                                                            LIQUIDACIONES (/liquidaciones)
                                                                       │
                     ┌──────────────────────┬──────────────────────────┤
                     ▼                      ▼                          ▼
              Bitácora (audit)      Proformas (auto-asignación)   Historial / Detalle
```

- **Proformas** (`proformas/autoAssign.ts`): al emitir o re-liquidar, la liquidación entra a la proforma **"En Revisión" sin fases decididas** del transportista; si no hay, se crea una. Sin fases configuradas en el país **no se crea nada** y queda en Borrador (un barrido posterior, `assignPendingSettlements`, la agrupa). Un fallo aquí **nunca tumba la emisión** (solo `console.warn`).
- **Reclamos**: una fase de proforma puede anular la liquidación (`void_kind='reclamo'`); el viaje vuelve a la bandeja con el motivo.
- **Bitácora** (`tarifas_audit_log`): append-only; el servidor fija usuario y rol con los del token.

---

## 8. Backend (`backend/tarifas`)

ORM genérico (`app.py`): no existe un endpoint "liquidar"; el frontend inserta filas.

| Ruta | Uso |
|---|---|
| `GET /api/tarifas/{table}`, `/{table}/{id}` | Lecturas |
| `POST /api/tarifas/{table}/find`, `/batch` | Lecturas largas / hasta 25 en una llamada |
| `POST /api/tarifas/{table}` · `PATCH` · `DELETE` | Escrituras sueltas |
| `POST /api/tarifas/tx` | Transacción todo-o-nada (emitir/re-liquidar) |
| `POST /api/tarifas/proformas/{id}/decision` | Decisión de proforma |

Reglas del servidor:
- **Permisos**: módulo `tarifas` (view/create/edit/delete) para liquidar; `tarifas.config` para configuración; `tarifas.proformas` para proformas. Un rol de liquidación **no puede escribir configuración**.
- **País**: se filtra por los países del rol y se valida al escribir.
- **Entidades externas** (viajes, transportistas, conductores…) son solo lectura: escribir da 405.
- **Transportistas (rol carrier)** no pueden escribir (`forbid_write`).
- Integridad por Postgres: FK/unicidad llegan como **409** con SQLSTATE.
- `/tx` reintenta ante deadlock (40P01) o serialización (40001); todo se valida antes de abrir la transacción.
- Tope de **5000 filas** por consulta; el encabezado `X-Tarifas-Truncated` avisa del recorte.

Índices clave de `tbl_tarifas_settlements`:
- `trip_vigente_uq`: **una sola liquidación no anulada por viaje**.
- `country_number_uq`: número único por país.

---

## 9. Precauciones

1. **Una liquidación no se borra**: se anula (dejaría huecos en la numeración y borraría la prueba de lo pagado).
2. **Re-liquidar con la liquidación dentro de una proforma está bloqueado**: excluirla o anular la proforma primero.
3. **Emitir recalcula sin cachés**: si aparece el aviso "las tarifas, reglas o pedidos cambiaron", revisar el nuevo total antes de emitir de nuevo.
4. **El historial muestra una foto**: lo emitido no cambia aunque se editen reglas, tarifas o el viaje después.
5. **Cambios de reglas/tarifas** afectan solo a liquidaciones nuevas; las viejas no se recalculan solas.
6. **Lote**: no es atómico; un fallo en un viaje no revierte los ya emitidos. Revisar el aviso final.
7. **Números `LIQ-…`**: se calculan leyendo los existentes y hay reintento ante colisión (una vez). Con mucha concurrencia por país puede aparecer un error de número repetido; reintentar.
8. **Datos de prueba**: viajes `VJ-DEMO-*` y devoluciones `DV-DEMO-*` son de prueba; no mezclar con producción.
9. **Despliegue de la regla de devoluciones**: ver `DESPLIEGUE-DEVOLUCIONES.md`. Si se despliega el frontend sin el backend, el bloqueo no se hace cumplir en el servidor; si el backend va primero, el frontend viejo recibe un 409 con mensaje.
10. **Permisos**: quien solo tiene `view` ve pero no liquida (sin botones). El rol "Devoluciones" **no** ve este módulo.

---

## 10. Limitaciones y observaciones

- **No hay endpoint de negocio "liquidar"**: las reglas viven en el frontend + validaciones del ORM. Cualquier cliente con permiso `create` podría insertar una liquidación saltándose el cálculo (el servidor solo aplica el bloqueo de devoluciones, integridad y permisos). Es una decisión de diseño conocida del ORM genérico.
- **El total lo calcula el navegador**; el servidor no lo recalcula ni lo valida.
- **Devoluciones**: el bloqueo del servidor se aplica solo a los `INSERT` de `tarifas_settlements` (emitir y re-liquidar). Anular o cambiar el estado de una liquidación existente no se toca. Un viaje ya liquidado que recibe una devolución nueva sigue liquidado; solo se frena si se intenta re-liquidar.
- **Lista de viajes** con tope de **2000** (`TRIPS_LIMIT`); si se recorta aparece un aviso y conviene acotar con fechas.
- **Historial paginado** (cursor), con "cargar más antiguas"; los KPI solo suman lo cargado.
- **Vista extendida** solo para quien puede configurar; la simple fuerza estado `Borrador`.
- **Sin devoluciones desde el módulo**: aquí solo se informan/consultan; recibirlas se hace en Devoluciones.
- **Refresco**: la bandeja se relee al volver a la pestaña tras >60 s; no hay *polling*.
- **Fotos/firmas de devoluciones** (mobile) están en desarrollo por otro dev y no afectan este módulo.
- Pruebas: `src/pages/liquidaciones/__tests__/`, `src/lib/tarifas/__tests__/` (incl. `devolucionesSinRecibir.test.ts`) y `backend/tests/test_returns_gate.py`.
- Hay una prueba de conectividad (`db-connectivity.test.ts`) que falla por nombres de tabla antiguos (vistas de compatibilidad ya no existen): **no es de este módulo**, avisar al responsable de la BD.

---

## 11. Archivos de referencia

| Tema | Archivo |
|---|---|
| Página y estado | `src/pages/liquidaciones/page.tsx`, `hooks/useLiquidacionesController.ts`, `useTripsLoader.ts`, `useSettlementsLoader.ts` |
| Modal y emisión | `hooks/useLiquidarViajeController.ts`, `useEmitTrip.ts`, `useEmissionState.ts`, `useRecheckBeforeEmit.ts`, `parts/emission.ts` |
| Tabla/lote | `parts/TripsTable.tsx`, `components/lote/LiquidarLoteModal.tsx` |
| Viaje → motor | `src/lib/tarifas/tripContext.ts`, `tripSettlement.ts`, `settlementInput.ts`, `tripOrders.ts` |
| Consultas de viajes | `src/lib/tarifas/trips/queryHelpers.ts`, `pendingTrips.ts` |
| Emitir/re-liquidar/estado | `src/lib/tarifas/settlements/` (`emitLogic`, `reliquidateLogic`, `statusTransitions`, `numberingAndIds`, `buildRowValues`, `mapToDomain`, `audit`) |
| Margen / devoluciones | `src/lib/tarifas/margin.ts`, `returnsNote.ts` |
| Proformas | `src/lib/tarifas/proformas/autoAssign.ts` |
| Backend | `backend/tarifas/src/app.py`, `returns_gate.py`, `tarifas_perms.py`, `tarifas_sql.py` |
| BD | `sql/04_tarifas.sql`, `sql/19_tarifas_aurora.sql`, `sql/27_tarifas_vista_viajes_un_recorrido.sql` |
| Despliegue regla de devoluciones | `DESPLIEGUE-DEVOLUCIONES.md` (raíz) |
