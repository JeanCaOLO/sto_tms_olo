# Mapeo de pedidos: EFLOW → `orders` (Aurora) → Cola del OMS

> **Actualización 2026-10-16:** el plan definitivo de columnas, maestros (sucursales, clientes únicos con `type`) y
> llave de `orders` está en [`2026-10-16-plan-modelo-pedidos-clientes-eflow.md`](../work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md);
> donde difiera de §3–§5 de este documento, manda ese plan. El OMS no tiene esquema propio: todo va en `public`.

> **Revisado el 2026-10-09.** Compara, campo por campo, de dónde sale cada dato que muestra la Cola de
> Priorización del OMS (`src/pages/oms/cola/page.tsx`), de qué campo de `EFLOW_OLO.dbo.EXPEDICIONESCABECERA`
> (SQL Server del WMS) viene, y en qué columna de `public.orders` (Aurora `tms_olo`) se guarda.
> La estructura de `orders` se leyó directamente de Aurora ese día; ver también
> [`diccionario-datos-tms-olo.md`](diccionario-datos-tms-olo.md).
>
> Solo se listan los campos de EFLOW que el OMS va a usar. Quedan fuera, entre otros: `IDCLIENTEPROPIETARIO`,
> `MUELLEEXPEDICION`, `IDUNIDADTRANSPORTE`, `CLASIFICACION1..4`, `REF1..3`, `KITS*`, `DUA`, `TPDECO`.

**Leyenda de "Match":** ✅ la columna ya existe y sirve tal cual · 🔧 existe pero hay que ajustarla ·
🟡 existe algo parecido pero no sirve como está · ➕ no existe, hay que agregarla · ⚙️ la calcula el OMS.

La columna "Fecha Alisto" se retiró de la Cola, del detalle del pedido y del Simulador el 2026-10-09: ese campo
ya no se usa (no existe una fecha de alisto; el OMS decide con la fecha de entrega).

## 1. Campos que se muestran en la Cola del OMS

| # | Columna en la Cola | Campo EFLOW (`EXPEDICIONESCABECERA`) | Tipo EFLOW | Columna en `orders` | Tipo `orders` | Match | Nota |
|---|---|---|---|---|---|---|---|
| 1 | Prioridad | `PRIORIDAD` | `int NOT NULL` | `priority` | `varchar(50)`, default `'normal'` | 🔧 | Pasa a `integer` (confirmado). Hoy ya guarda `'1'`…`'5'` como texto, así que la conversión es directa. Es la prioridad que calcula el OMS y que se escribe de vuelta en EFLOW. |
| 2 | Pedido | `IDEXPEDICION` | `varchar(50)` | `order_number` | `varchar(100) NOT NULL` | 🔧 | Hoy `order_number` lleva sufijos (`EDI0120068-M`) o códigos aleatorios (`2000018120-1d3c7c91`). Ver §3: `IDEXPEDICION` sola no es única. |
| 3 | ID Almacén | `IDALMACEN` | `varchar(4)` | — | — | ➕ | `orders` no tiene almacén. `store_id` no sirve: para Cofersa es la bodega de origen y para EPA la tienda de destino. Agregar `eflow_id_almacen` (texto) y `warehouse_id` (FK, ya planificada en el ERD §8). |
| 4 | ID Compañía | `IDCOMPANIA` | `varchar(4)` | `customer_id` | `uuid` FK → `customers` | 🟡 | Compañía = cliente de OLO (`0029` = EPA, `0109` = Cofersa, deducido de los datos; **confirmar**). `customer_id` identifica la compañía, pero no guarda el código EFLOW. Agregar `eflow_id_compania` (texto) en `orders` y el código en el maestro `customers`. |
| 5 | ID Sucursal | `IDSUCURSAL` | `varchar(4)` | — | — | ➕ | No existe en ninguna tabla salvo el staging `wms_expediciones`. Agregar `eflow_id_sucursal` (texto). |
| 6 | Tipo de Orden | `TPEXPE` | `varchar(6)` | — | — | ➕ | Ej. `EXPERP`. Agregar `order_type` (texto). |
| 7 | Cliente | `IDCLIENTE` | `varchar(30)` | `delivery_point_id` | `uuid` FK → `delivery_points` | 🟡 | `IDCLIENTE` es el **destinatario** (tienda EPA `T006`, cliente de Cofersa `020301017`), no la compañía. En Aurora el destinatario es `final_customers` / `delivery_points` (resolver por `external_code`). `delivery_point_id` existe pero solo 108 de 1.234 pedidos lo tienen. Agregar `final_customer_id` (planificada en el ERD §8) y, para no perder el dato si no se resuelve, `eflow_id_cliente` (texto). El **nombre** sale de `EFLOW_OLO.dbo.CLIENTES`. |
| 8 | Zona | `RUTA` | `varchar(50)` | `delivery_zone` | `varchar(100)` | ✅ | Planificación ya agrupa por `delivery_zone`. |
| 9 | Monto Total | `COSTO_TOTAL` | `float` | `total_amount` | `numeric(12,2)` | ✅ | **Confirmar** que `COSTO_TOTAL` es el monto del pedido y no un costo interno. |
| 10 | Peso | `PESOPEDIDO_TOTAL` | `float` | `total_weight` | `numeric(10,2)` | ✅ | Si EFLOW lo trae vacío, guardar `NULL` (desconocido), nunca `0`. |
| 11 | Volumen | `CUBICAJEPEDIDO_TOTAL` | `float` | `total_volume` | `numeric(10,2)` | ✅ | Igual que el peso: `NULL`, nunca `0`. |
| 12 | N.º artículos | — (no está en la cabecera) | — | `total_items` | `integer` | ✅ | Se calcula contando las líneas de `EXPEDICIONESDETALLE` del pedido. |
| 13 | Observaciones | `OBSERVACIONESEXPEDICION` | `varchar(500)` | `notes` | `text` | 🟡 | `notes` ya se usa para notas del sistema ("EFLOW real COFERSA · viaje WMH…", "Generado automáticamente por el disparador…"). Mezclarlas contamina lo que lee la IA de la regla de observaciones / cliente retira. Agregar `observaciones` (texto) solo con el texto de EFLOW. |
| 14 | Fecha Despacho | `FECHAEXPEDICIONPLANIFICADA` | `datetime NOT NULL` | `delivery_date` | `date` | ✅ | Es la **fecha de entrega** que manda el cliente. El OMS la lee y **no la modifica**. Sugerencia: renombrar la columna de la Cola a "Fecha de entrega". |
| 15 | Fecha creación | `FECHAEXPEDICION` | `datetime NOT NULL` | `order_date` | `date NOT NULL` | ✅ | Alternativa: `FECHACREACION`, que es la que usa hoy la demo de corrida (`corridaDemo.ts`), pero acepta nulos y no sirve sola para una columna `NOT NULL`. **Confirmar** cuál se quiere mostrar. |
| 16 | Score | — | — | — | — | ⚙️ ➕ | Lo calcula el motor de reglas. Agregar `oms_score` (numérico). |
| 17 | Estado | `TPEXES` | `varchar(6)` | `status` | `varchar(50)`, default `'pending'` | 🟡 | `status` hoy es el estado **del TMS** (`assigned`, `entregado`) y lo usa Planificación. El estado del WMS (`DISP`…) es otra cosa. Agregar `wms_estado` (texto) y dejar `status` como está. |
| 18 | Situación | `TPEXSI` | `varchar(6)` | — | — | ➕ | Agregar `wms_situacion` (texto). Es lo que el OMS cambia a "generada" para que el WMS haga el picking y lo que lee Planificación. |

## 2. Campos de EFLOW que se usan aunque no se muestren

| Campo EFLOW | Tipo | Para qué | Columna en `orders` | Match |
|---|---|---|---|---|
| `FECHACIERRE` | `datetime` | Filtro de la cola: solo `FECHACIERRE IS NULL` | — | No se guarda (filtro de lectura) |
| `NUMEROVIAJEWMH` | `bigint` | Filtro de la cola: solo sin viaje WMH asignado | — | ➕ `numero_viaje_wmh` (opcional; `wms_expediciones` ya lo tiene) |
| `DIRECCIONPEDIDO` | `varchar(250)` | Dirección de entrega | `delivery_address` (`text NOT NULL`) | ✅ Si viene vacía, resolver por el punto de entrega (la columna no acepta nulos) |
| `FACTURA` | `varchar(50)` | Facturación (regla del TMS: no se despacha sin facturar) | `invoice_number` (`varchar(100)`) | ✅ |

**Por decidir si se usan:** `BAJADA` (asignación de bajada), `EMERGENCIA`, `NOMBREPRIORIDAD`,
`FECHAPLANIFICADADESPACHO`, `IDALMACENDESTINO`.

## 3. La llave del pedido

En EFLOW un pedido se identifica por `IDALMACEN + IDCOMPANIA + IDSUCURSAL + IDEXPEDICION` (PK de
`EXPEDICIONESCABECERA`). `IDEXPEDICION` sola **se repite**: en `wms_expediciones` la expedición
`P0002002260922` aparece en la sucursal `0001` y en la `0002`.

En `orders` la única llave es `UNIQUE (organization_id, order_number)`. Si `order_number` fuera solo
`IDEXPEDICION`, el segundo pedido chocaría con el primero; probablemente por eso hoy se le agregan sufijos.

Propuesta:
- Guardar las cuatro partes en columnas de texto: `eflow_id_almacen`, `eflow_id_compania`, `eflow_id_sucursal`,
  `eflow_id_expedicion` (texto, no números: `0029` lleva ceros a la izquierda y hay expediciones con letras).
- Índice único parcial sobre esas cuatro columnas `WHERE eflow_id_expedicion IS NOT NULL`. Así, volver a
  correr una priorización actualiza el pedido en lugar de duplicarlo, y los pedidos de prueba existentes
  (sin llave EFLOW) no se ven afectados.
- `order_number` queda como el número que se muestra.

## 4. Columnas de `orders` que no vienen de EFLOW

| Columna | De dónde sale |
|---|---|
| `id`, `created_at`, `updated_at` | Las genera la base |
| `organization_id` | Fija: OLO |
| `store_id` | Bodega de origen (`CD-CR`). Hoy para EPA guarda la tienda destino; el plan es dejarla solo como origen |
| `delivery_city`, `delivery_latitude`, `delivery_longitude` | Del punto de entrega / dirección en Aurora |
| `route_type_id` | FK a `zones`; se puede resolver desde `RUTA` |

## 5. Resumen de cambios propuestos en `orders`

| Cambio | Columnas |
|---|---|
| Cambiar tipo | `priority` → `integer` |
| Llave EFLOW | `eflow_id_almacen`, `eflow_id_compania`, `eflow_id_sucursal`, `eflow_id_expedicion` + índice único parcial |
| Relaciones nuevas | `warehouse_id` → `warehouses`, `final_customer_id` → `final_customers` |
| Datos del WMS | `order_type`, `eflow_id_cliente`, `observaciones`, `wms_estado`, `wms_situacion`, `numero_viaje_wmh` |
| Resultado del OMS | `oms_score` |

Todas las columnas nuevas aceptan nulos, para no afectar los pedidos que ya existen.

## 6. Pendientes de confirmar

1. `0029` = EPA y `0109` = Cofersa.
2. `COSTO_TOTAL` es el monto del pedido.
3. "Fecha creación": `FECHAEXPEDICION` o `FECHACREACION`.
4. Si se usan `BAJADA`, `EMERGENCIA`, `NOMBREPRIORIDAD`, `FECHAPLANIFICADADESPACHO` o `IDALMACENDESTINO`.
5. Qué significan los sufijos `-M`, `-O`, `-P` de los pedidos reales de EFLOW ya cargados en `orders`.
