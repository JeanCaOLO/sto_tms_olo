# Checklist de preguntas para Calzadilla — Base de datos (Planificación)

> Aterrizado en lo que **ya verificamos** (para que confirme) y lo que **falta**.
> Marca cada punto en la reunión. Fecha: 2026-09-11.
>
> **Actualizado tras la reunión 2026-09-11 (tarde).** `[x]` = respondido; `[~]` =
> parcial / pendiente de acción. Ver nota Notion "Reunión 2026-09-11 (tarde) — BD
> con Calzadilla".

## 1. Replicación y acceso (lo más importante)

- [x] ¿**Dónde se replican** las tablas? → El **Lago NO sirve** (compacta + latencia ~30 min). Lo correcto es la **"réplica IPRAX"**: copia exacta vía SymmetricDS, **tiempo real (<2s)**.
- [~] **VE ya tiene** la réplica IPRAX; **CR NO** → **ACCIÓN: solicitarla a Rafael/Alfredo** con la lista de tablas (EXPEDICIONES, ALMACENMOVIMIENTOS_CARCAM, journeys/journey_orders, CLIENTES, RUTA_DIA_AB).
- [ ] Usuario **read-only** propio para la réplica IPRAX (pedir junto con la réplica).

## 2. Pedidos — peso y volumen

- [x] **Cascada confirmada.** CR **no carga peso real** (los valores presentes son falsos); el peso debería salir del **maestro de artículos × cantidad**, pero no lo actualizan → muchos pedidos en 0. Valida exactamente la cascada implementada (cabecera → detalle → maestro).
- [x] VE cabecera en 0 → por lo mismo: no lo cargan en origen → **siempre calculamos del detalle/maestro**.
- [ ] `PESOPREPARADO/CUBICAJEPREPARADO` — se llenan **post-picking**; para planificación (pre-despacho) no sirven.

## 3. Pedidos — dirección, coordenadas y observaciones

- [ ] Confirmar que la **dirección** sale de `CLIENTES.DIRECCIONLARGA` (por `IDCLIENTE`+`IDCOMPANIA`), no del pedido.
- [ ] **Coordenadas** `CLIENTES.LATITUD/LONGITUD`: ¿por qué tan poco pobladas (~2% CR / ~6% VE)? ¿Otra fuente de geo por cliente?
- [ ] ¿**Qué campo** tiene el texto libre de "observaciones" (dirección/ruta alterna, "cliente retira") que analizaremos con IA? ¿Cabecera o detalle?

## 4. Rutas — matriz de días

- [ ] Confirmar que la matriz ruta×día es `RUTA_DIA_AB` (`ROUTE_CODE`+`ID_DIA`) + `DIA_SEMANA_AB` (1=Lun…7=Dom) + `RUTA_PROMESA_AB`. ¿Es la **autoritativa**?
- [ ] ¿**Quién mantiene** `RUTA_DIA_AB` hoy y con qué frecuencia? (el mantenimiento pasaría a Planificación).
- [ ] ¿Existe la tabla estática **cliente↔ruta** (a qué ruta pertenece cada cliente)? ¿Dónde?
- [ ] `RUTA_DIA_AB` **no distingue carga/entrega/cita** — ¿esa distinción vive en otra tabla o solo estaba en el Excel de COFERSA?

## 5. Viajes — creación y estados (la duda grande)

- [x] **Ciclo de vida del pedido:** `EXPEDICIONESCABECERA` = todos; se cruza con **`ALMACENMOVIMIENTOS_CARCAM`** ("carcán"). **No en CARCAM** = no procesado (candidato a prioridad). **En CARCAM, `número viaje = PEND`, sin guía** = en proceso. **`número viaje` ≠ PEND + `IDCONFIRMACION` (guía) + fecha cierre** = cerrado/listo.
- [~] **Viaje "completo/cerrado"** (trigger de optimización): unir CARCAM con `journey_orders` → si **TODOS los pedidos del viaje ya tienen guía**, el viaje está cerrado. Alternativa a confirmar: `situation = pendiente`. **No lo tienen 100% claro** (Windry ya no está).
- [x] **Dos números de viaje**: uno del **WMS** y otro del **WMH** — no confundir.
- [ ] `tipo` de viaje (transporte vs "cliente retira"): no hay campo; en CR el retira se detecta por **driver_id 40 y 62** (ver §6).

## 6. Choferes / vehículos / transportistas

- [x] **Dos llaves confirmadas:** `ALMACENMOVIMIENTOS_CARCAM.IDCHOFER` = **`driver_code`**; `journey_order_transportation.driver_id` = **`driver_id`** (el real, para unir con `drivers`).
- [x] **Cliente retira (CR):** `driver_id` **40 y 62** son choferes *dummy* → **no** asignarles ubicación/geo/optimización.
- [ ] Vehículo↔transportista↔conductor (relación fija/horarios/independientes) — **pendiente** (no se tocó).
- [ ] Capacidad real del vehículo (units vienen en 0) — **pendiente** (usar `vehicle_capacities` propia).

## 7. Multi-empresa / país

- [x] **Unir SIEMPRE por 4 campos:** pedido + **almacén** + compañía + sucursal. El **país lo ponemos nosotros** (la BD **no** es multipaís).
- [x] **CR:** en WMH solo **COFERSA**; el resto (EPA…) opera en **WMS/DMS** con lógica de "completo" **distinta**. 1 almacén.
- [x] **VE:** Febeca/Sillaca/Beval por WMH, **2 almacenes**. **Colombia viene** (1 compañía, 2 almacenes).
- [x] Alcance real: **todos los clientes y países** (aunque hoy el cliente solo ve COFERSA).

## 8. Estatus / campos de control

- [x] **`situation` es el campo crítico.** Al cambiar viaje/chofer/unidad **inhabilitan el viejo y crean uno nuevo** → duplicados. **NUNCA tomar `inhabilitado`/invalidated.** Valores: inhabilitado / asignado / completado / **MER** (unión de 2 viajes) / pendiente. Más confiable que las fechas.
- [x] **Predespacho/listo:** el pedido está listo cuando tiene **`IDCONFIRMACION` (guía)** en CARCAM (ver §5).

---

**Must-ask si la reunión es corta:** §1 (replicación + usuario), §5 (creación/estado de viajes), §3 (campo de observaciones), §6 (capacidad real del vehículo).

---

## Acciones pendientes (tras reunión 2026-09-11 tarde)

- [ ] **Solicitar réplica IPRAX para CR** a Rafael/Alfredo (VE ya la tiene) + usuario read-only.
- [ ] Confirmar el trigger "viaje listo": ¿todos con guía, o `situation = pendiente`?
- [ ] Validar si en VE también hay driver_id *dummy* de cliente-retira (equivalente a 40/62 en CR).
- [ ] Documentar la lógica de "completo" en **WMS/DMS** para clientes CR fuera de WMH (EPA, etc.).
- [ ] Campo de **observaciones** (dirección/ruta alterna, IA) — quedó sin cubrir en esta reunión.
