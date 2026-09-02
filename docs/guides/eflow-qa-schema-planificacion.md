# EFLOW QA — esquema real para /planificacion

READ-ONLY recon del server SQL de QA (2026-09-01). Objetivo: reemplazar
los nombres MOCK ("Viaje 1", "Viaje 2"…) del módulo `/planificacion` por datos reales
de QA para viaje, transportista, conductor y vehículo.

Conexión y credenciales: NO están en este archivo. El host, puerto, usuario y contraseña
del SQL Server de QA van en un `.env.local` fuera de git (ver `.env.example`). Referencia
adicional en `config_dev_qa_preprod.json` del repo `olo-aplicaciones-api` o la memoria
`eflow-qa-db-rutas-choferes.md`.

## Resumen ejecutivo

| Entidad | Fuente real (QA) | Clave que la ata al viaje |
|---|---|---|
| Viaje (trip) | `EFLOW_OLO_QA_SAP.dbo.VIAJES_ENC_AB` | `VIAJE` (int, = "Viaje N") |
| Ruta | `EFLOW_WMH.dbo.distribution_routes` | `route_code` ↔ `VIAJES_ENC_AB.DESTINO` (string, puede traer varios: `"01,14,21"`) |
| Conductor | `EFLOW_WMH.dbo.drivers` | `driver_id` ↔ `journey_order_transportation.driver_id` ↔ `VIAJES_ENC_AB.COD_CONDUCTOR` |
| Vehículo | `EFLOW_WMH.dbo.trasportation_units` | `unit_id` ↔ `journey_order_transportation.unit_id` |
| Transportista | `EFLOW_WMH.dbo.transportation_companies` (o `VIAJES_ENC_AB.TRANSPORTE` directo) | `transportation_company_id` ↔ `drivers.transportation_company_id` |

**`journey_id` de `EFLOW_WMH.dbo.journeys` == `VIAJE` de `VIAJES_ENC_AB`.** Son el mismo número.

Confirmación del hallazgo del equipo: **rutas, conductores y vehículos EXISTEN reales en QA.**
Lo único MOCK/inservible: **capacidad** de los vehículos (`weight_capacity` y
`volumetric_capacity` = 0 en las 99 unidades) y el % de capacidad que calcula la UI.
El snapshot del repo (`fallback-catalogos.ts`) sintetizó esas capacidades; los nombres/placas/cédulas ahí SÍ son reales.

## 1. Viaje (trip)

**Fuente:** `EFLOW_OLO_QA_SAP.dbo.VIAJES_ENC_AB` — 959 filas. Es la vista más rica: ya
trae viaje + estado + fechas + conductor + transportista + muelle + peso/volumen en una fila.

Columnas clave:

| Columna | Tipo | Nota |
|---|---|---|
| `VIAJE` | int | id / número del viaje. Esto reemplaza a "Viaje N". |
| `DESTINO` | varchar | código(s) de ruta separados por coma: `"01,14,21"` |
| `FECHA_CREACION` | datetime | fecha del viaje (poblada) |
| `FECHA_DESPACHO` | datetime | NULL en casi todo QA |
| `FECHA_CIERRE` | datetime | |
| `COD_ESTADO` / `ESTADO` | int / varchar | `PENDING` (156), `COMPLETED` (800), `MERGED` (3) |
| `COD_CONDUCTOR` / `CONDUCTOR` | int / varchar | id + nombre del chofer (NULL en PENDING sin asignar) |
| `COD_TRANSPORTE` / `TRANSPORTE` | varchar / varchar | id + nombre del transportista |
| `MUELLE` | varchar | ej. `PURT23` |
| `CANT_CLIENTE` | int | # de clientes en el viaje |
| `PESO` / `VOLUMEN` / `BULTOS` | decimal | totales del viaje (sí poblados) |
| `COSTO_TOTAL`, `UNID_PEDIDAS`, `UNID_PREPARADAS` | decimal | |

Alternativa cruda en `EFLOW_WMH.dbo.journeys` (`journey_id`, `situation`, `dock`,
`belt_id`, `is_active`, `creation_date`). No trae ruta/chofer/placa directo — hay que
unir con `journey_order_transportation`. `journey_orders.route_id` está **100% NULL** en
QA, así que la ruta NO se obtiene por ahí: se obtiene por `VIAJES_ENC_AB.DESTINO`.

```sql
SELECT TOP 20 VIAJE, DESTINO, ESTADO, FECHA_CREACION, CONDUCTOR, TRANSPORTE, MUELLE
FROM EFLOW_OLO_QA_SAP.dbo.VIAJES_ENC_AB
ORDER BY VIAJE DESC;
```

## 2. Ruta

**Fuente:** `EFLOW_WMH.dbo.distribution_routes` — 38 filas, ACTIVE/estado en `state`.

| Columna | Nota |
|---|---|
| `route_id` | PK interno |
| `route_code` | `"01"`, `"04"`, `"17"`… — **esto matchea con `VIAJES_ENC_AB.DESTINO`** |
| `route_name` | `CASCO CENTRAL`, `ALAJUELA`, `SAN CARLOS`, `CARTAGO`… |
| `route_alias` | nombre corto |
| `zone_id` | → `distribution_zones` (81 zonas) |

```sql
SELECT route_id, route_code, route_name, route_alias, state
FROM EFLOW_WMH.dbo.distribution_routes
ORDER BY route_code;
```

Un viaje puede tener varias rutas (`DESTINO = "03,23,26"`). Para el primer código:
`LEFT(v.DESTINO, CHARINDEX(',', v.DESTINO + ',') - 1)`.

## 3. Conductor (driver)

**Fuente:** `EFLOW_WMH.dbo.drivers` — 62 filas.

| Columna | Nota |
|---|---|
| `driver_id` | PK. Matchea con `journey_order_transportation.driver_id` y con `VIAJES_ENC_AB.COD_CONDUCTOR` |
| `driver_name` | nombre completo real |
| `driver_card_id` | cédula (a veces trae basura tipo `"STERLING"` en registros viejos, pero la mayoría es cédula real) |
| `driver_phone` | teléfono |
| `driver_code` | código interno |
| `transportation_company_id` | → transportista |
| `state` / `situation` | activo/estado |

```sql
SELECT driver_id, driver_name, driver_card_id, driver_phone, transportation_company_id
FROM EFLOW_WMH.dbo.drivers
WHERE state = 'ACTIVE'
ORDER BY driver_name;
```

Espejo en `EFLOW_OLO_QA_SAP.dbo.CHOFERES` (`IDCHOFER, NOMBRE, APELLIDO, CEDULA`) — vacía
en QA. Usar `drivers` de `EFLOW_WMH`.

## 4. Vehículo (unit)

**Fuente:** `EFLOW_WMH.dbo.trasportation_units` (sic, sin la primera `n`) — 99 filas.

| Columna | Nota |
|---|---|
| `unit_id` | PK. Matchea con `journey_order_transportation.unit_id` |
| `license_plate` | placa real (`PLACA-001`, `PLACA-002`…) |
| `vehicle_brand` | `IZUSU NPR`, `TOYOTA DYNA`, `HYUNDAI HD65` (a veces vacío) |
| `unit_description` | descripción |
| `weight_capacity` / `volumetric_capacity` | **0 en TODAS las filas de QA** — no hay dato real de capacidad |
| `transportation_company_id` | → transportista |
| `vehicle_type_id`, `chassis_number`, `motor_number` | |

```sql
SELECT unit_id, license_plate, vehicle_brand, unit_description, weight_capacity, volumetric_capacity
FROM EFLOW_WMH.dbo.trasportation_units
WHERE state = 'ACTIVE'
ORDER BY license_plate;
```

Espejo en `EFLOW_OLO_QA_SAP.dbo.UNIDADESTRANSPORTE` (`PLACA, DESCRIPCION, PESO, CUBICAJE,
NOMBRECHOFER, CEDULARCHOFER`) — también con `PESO`/`CUBICAJE` en 0. No aporta capacidad.

Nota: `VIAJES_ENC_AB` **no tiene columna de placa/vehículo**. El vehículo del viaje solo
sale uniendo por `EFLOW_WMH.journey_order_transportation.unit_id`.

## 5. Transportista (carrier)

**Fuente:** `EFLOW_WMH.dbo.transportation_companies` — 34 filas.

| Columna | Nota |
|---|---|
| `transportation_company_id` | PK |
| `company_code` | código |
| `company_name` | nombre real del transportista (ej. `TRANSPORTISTA A`, `OLO`…) |
| `state` | |

```sql
SELECT transportation_company_id, company_code, company_name
FROM EFLOW_WMH.dbo.transportation_companies
WHERE state = 'ACTIVE'
ORDER BY company_name;
```

También disponible como texto plano en `VIAJES_ENC_AB.TRANSPORTE` / `COD_TRANSPORTE`
(útil si solo se quiere pintar el nombre del viaje sin catálogo aparte).

## 6. JOIN canónico: viaje → ruta → conductor → vehículo → transportista

```sql
SELECT
  v.VIAJE                    AS trip_id,
  v.ESTADO                   AS trip_status,
  v.FECHA_CREACION           AS trip_created,
  v.FECHA_DESPACHO           AS trip_dispatch,
  v.DESTINO                  AS route_codes,
  r.route_name               AS route_name,
  d.driver_id                AS driver_id,
  d.driver_name              AS driver_name,
  d.driver_card_id           AS driver_document,
  d.driver_phone             AS driver_phone,
  u.unit_id                  AS vehicle_id,
  u.license_plate            AS vehicle_plate,
  u.vehicle_brand            AS vehicle_brand,
  u.weight_capacity          AS vehicle_kg,       -- 0 en QA
  u.volumetric_capacity      AS vehicle_m3,       -- 0 en QA
  co.company_name            AS carrier_name,
  v.MUELLE                   AS dock
FROM EFLOW_OLO_QA_SAP.dbo.VIAJES_ENC_AB v
OUTER APPLY (
  SELECT TOP 1 jot.driver_id, jot.unit_id
  FROM EFLOW_WMH.dbo.journey_order_transportation jot
  WHERE jot.journey_id = v.VIAJE
) t
LEFT JOIN EFLOW_WMH.dbo.drivers                 d  ON d.driver_id = t.driver_id
LEFT JOIN EFLOW_WMH.dbo.trasportation_units     u  ON u.unit_id   = t.unit_id
LEFT JOIN EFLOW_WMH.dbo.transportation_companies co ON co.transportation_company_id = d.transportation_company_id
LEFT JOIN EFLOW_WMH.dbo.distribution_routes     r  ON r.route_code = LEFT(v.DESTINO, CHARINDEX(',', v.DESTINO + ',') - 1)
ORDER BY v.VIAJE DESC;
```

Devuelve filas reales (ejemplo anonimizado; los valores reales vienen de QA):

```
8194 | COMPLETED | 2026-07-13 | 08       | SAN CARLOS  | CONDUCTOR A | PLACA-001 | IZUSU NPR   | TRANSPORTISTA A
8189 | COMPLETED | 2026-07-13 | 17       | ALAJUELA #2 | CONDUCTOR B | PLACA-002 | TOYOTA DYNA | TRANSPORTISTA B
8201 | PENDING   | 2026-07-14 | 02,22    | DESAMPARADOS SJ SUR-OESTE | CONDUCTOR C | PLACA-003 | HYUNDAI HD65 | TRANSPORTISTA C
```

## 7. VIEW_INS_OLO_PLANNING_AB — NO usar

`EFLOW_OLO_QA_SAP.dbo.VIEW_INS_OLO_PLANNING_AB` **está rota en QA**: su definición
referencia `EFLOW_OLO.dbo.EXPEDICIONESCABECERA` y la base `EFLOW_OLO` está offline en el
server. Cualquier `SELECT` contra la vista falla con:

```
Msg 208 ... El nombre de objeto 'EFLOW_OLO.dbo.EXPEDICIONESCABECERA' no es válido.
Msg 4413 ... No se pudo usar la vista ... debido a errores de enlace.
```

Solo sirve como **referencia de contrato** (qué campos quería exponer OLO Planning):
`GroupName` (= `NUMEROVIAJEWMH_OLO`), `TaskCode` (factura), `DeliveryDate`,
`CustomerCode/Name/Address`, `RequieredCapacityStr1/2`, `Cod_Articulo`, `Articulo`,
`Cantidad_Fact`, `Num_Pedido`, `Guia`, `Ruta`, `Driver_card_id`, `Correo_Chofer`,
`Fecha_Guia`. Para planificación real hay que reconstruir esto desde `VIAJES_ENC_AB` +
`journey_orders` + tablas `EFLOW_WMH`, no desde la vista.

## Catálogos (para los dropdowns de asignación)

- Transportistas: `EFLOW_WMH.dbo.transportation_companies` (34)
- Conductores: `EFLOW_WMH.dbo.drivers` (62), filtrables por `transportation_company_id`
- Vehículos: `EFLOW_WMH.dbo.trasportation_units` (99), filtrables por `transportation_company_id`
- Rutas: `EFLOW_WMH.dbo.distribution_routes` (38)

## 8. Order lines per trip

READ-ONLY recon (2026-09-02). Objetivo: reemplazar `MOCK_STOPS` /
`getFallbackPedidos` (20 paradas sintéticas GAM) con líneas de pedido reales
por viaje.

### Resumen ejecutivo

**Fuente ganadora:** `EFLOW_OLO_QA_SAP.dbo.VIEW_DATOS_VIAJE_AUDITORIA_PED_AB`
(vista, no tabla — a diferencia de `VIEW_INS_OLO_PLANNING_AB` y
`VIEW_OBT_DATOS_VIAJES_DET_AB`, **esta SÍ resuelve** contra QA). JOIN adicional a
`EFLOW_OLO_QA_SAP.dbo.CLIENTES` por `ID_CLIENTE` + `ID_COMPANIA` para
dirección/lat-lng.

**Cobertura parcial, no total:** de los 959 viajes en `VIAJES_ENC_AB`, solo
**27** tienen líneas en la vista de auditoría (2,305 filas artículo, 481
pedidos/factura distintos). Todos `PENDING` salvo 1 `MERGED`. El resto de
viajes (932) no tiene líneas reales reconstruibles hoy en QA — para esos, el
mock sigue siendo necesario (ver política de fallback abajo).

Los tres candidatos del brief, en orden:

1. **`EFLOW_WMH.dbo.journey_orders`** — 369,244 filas. `journey_id` **sí**
   liga a `VIAJE` (confirmado: viajes reales como 7371/7846/7266 traen 143–153
   líneas). Trae `order_number` (ej. `PEDFR186005989-W`), `warehouse_id`,
   `priority`, `situation`, `dock` — pero **ningún dato de cliente/dirección/
   lat-lng/peso/volumen**, y no hay tabla `customer`/`order` en `EFLOW_WMH`
   para resolverlos (solo existe `customer_logo`). `route_id` sigue NULL en
   el 100% de filas, igual que se documentó en la sección 1. **No es
   suficiente por sí sola.**
2. **`EFLOW_OLO_QA_SAP` delivery lines por `NUMEROVIAJEWMH`/factura/guía** —
   `VIEW_INS_OLO_PLANNING_AB` (contrato) y `VIEW_OBT_DATOS_VIAJES_DET_AB`
   (candidato lógico "VIAJES_DET") están **ambas rotas** en QA: referencian
   `EFLOW_OLO.dbo.EXPEDICIONESCABECERA`, base offline en el server (mismo
   error de binding ya documentado en la sección 7). Bajando un nivel se
   encontró **`VIEW_DATOS_VIAJE_AUDITORIA_PED_AB`**, que cubre el mismo
   propósito (viaje → pedido → factura → artículo → cliente) y **sí
   funciona** — ver contrato abajo. También existe `PEDIDOS_ASIGNADOS_MOVIL_AB`
   (21,915 filas, VIAJE+PEDIDO+FACTURA+CLIENTE a nivel de pedido, sin
   artículo/cantidad) como alternativa más liviana si no se necesita detalle
   de artículo.
3. **`EFLOW_WMH` staging `ext_tms_*_mt`** — existen las 13 tablas esperadas
   (`ext_tms_expedicionescabecera_mt`, `ext_tms_expedicionesdetalle_mt`,
   `ext_tms_clientes_mt`, `ext_tms_wms_pedido_factura_mt`, etc.), esquema
   completo con columnas `num_pedido`, `codigo_cliente`, `dir_fiscal`, etc.
   **Las 13 tablas están vacías (0 filas) en QA.** Descartadas: esquema listo,
   sin datos.

### Contrato: `VIEW_DATOS_VIAJE_AUDITORIA_PED_AB`

| Columna | Tipo | Nota |
|---|---|---|
| `VIAJE` | bigint | = `VIAJES_ENC_AB.VIAJE` |
| `PEDIDO` | varchar | id de pedido — clave de línea junto con `FACTURA` |
| `FACTURA` | varchar | número de factura |
| `SITUACION` | varchar | `PENDING` \| `MERGED` (estado del pedido, no distingue entrega/devolución) |
| `FECHA_FACTURA` | date | |
| `MONTO_TOTAL` | decimal | por artículo, no por pedido — sumar por `PEDIDO` |
| `ID_ALMACEN`, `ID_COMPANIA`, `ID_SUCURSAL` | varchar | |
| `NOM_COMPANIA` | varchar | |
| `IDARTICULO`, `NOM_ARTICULO`, `CANTIDAD` | varchar/varchar/int | línea de artículo dentro del pedido |
| `DESTINO` | varchar | código de ruta — mismo significado que `VIAJES_ENC_AB.DESTINO` |
| `ID_CONDUCTOR`, `NOM_CONDUCTOR` | | NULL en los 27 viajes muestreados (todos `PENDING` sin chofer asignado aún) |
| `ID_CLIENTE`, `NOM_CLIENTE` | varchar | clave para `CLIENTES.IDCLIENTE` |
| `CLASIFICACION1/2`, `SUBFAMILIA` | varchar | categoría de artículo, no usado por planificación |
| `MUELLE` | varchar | |

Una fila = un artículo dentro de un pedido. Para una línea de pedido (`Pedido`
del TMS) hay que agrupar por `PEDIDO` (+ `FACTURA`) y sumar `CANTIDAD` /
`MONTO_TOTAL`.

### JOIN canónico: viaje → pedido → cliente (dirección/lat-lng)

```sql
SELECT
  a.VIAJE,
  a.PEDIDO,
  a.FACTURA,
  a.ID_CLIENTE,
  a.NOM_CLIENTE            AS customer_name,
  c.DIRECCIONLARGA         AS delivery_address,   -- multilinea "Prov::/Cton::/Det::"
  c.LATITUD                AS delivery_latitude,   -- varchar, castear a float; NULL en ~71% de clientes
  c.LONGITUD                AS delivery_longitude,
  a.DESTINO                AS route_code,          -- liga a distribution_routes.route_code (sección 2)
  SUM(a.CANTIDAD)          AS total_units,
  SUM(a.MONTO_TOTAL)       AS total_amount
FROM EFLOW_OLO_QA_SAP.dbo.VIEW_DATOS_VIAJE_AUDITORIA_PED_AB a
LEFT JOIN EFLOW_OLO_QA_SAP.dbo.CLIENTES c
  ON c.IDCLIENTE = a.ID_CLIENTE AND c.IDCOMPANIA = a.ID_COMPANIA
WHERE a.VIAJE = @viajeId
GROUP BY a.VIAJE, a.PEDIDO, a.FACTURA, a.ID_CLIENTE, a.NOM_CLIENTE,
         c.DIRECCIONLARGA, c.LATITUD, c.LONGITUD, a.DESTINO;
```

Fila real anonimizada (viaje 8007, cliente enmascarado):

```
8007 | EDI0112261 | 0010000101...4213 | CLIENTE-A | Prov:: PUNTARENAS / Cton:: GOLFITO / Det:: [dirección enmascarada] | 8.5337 | -83.3062 | 32 | 6 | 11043.48
8007 | EDI0112437 | 0010000101...4696 | CLIENTE-A | Prov:: PUNTARENAS / Cton:: GOLFITO / Det:: [dirección enmascarada] | 8.5337 | -83.3062 | 32 | 3 | 8659.74
```

### Peso / volumen por línea: NO disponibles — mismo patrón que capacidad de vehículo

`ARTICULOS_DATOSLOGISTICOS` (33 columnas: `PRODUCTO_PESO_NETO`,
`PRODUCTO_PESO_BRUTO`, `PRODUCTO_VOLUMEN`, `EMPAQUE_PESO`...) tiene el esquema
correcto para peso/volumen por artículo, pero **todos los valores muestreados
son 0** — igual que `weight_capacity`/`volumetric_capacity` en
`trasportation_units` (sección 4). No es fabricación: es el mismo hueco de
datos ya documentado para vehículos, ahora confirmado también en artículos.

Alternativa parcial: `VIAJES_ENC_AB.PESO` / `.VOLUMEN` / `.BULTOS` sí traen
totales **a nivel de viaje** (confirmado poblado, sección 1). No hay forma de
prorratear a nivel de línea sin inventar un criterio de reparto — no se hizo.
`total_weight`/`total_volume` de cada `Pedido` real quedan `null` cuando se
usa esta fuente; el mock sigue siendo el único con esos campos poblados.

### `tipo?: 'devolucion'` (FR16): sin señal real

`SITUACION` solo trae `PENDING`/`MERGED` (estado de picking del pedido, no
tipo de parada). No hay `CANTIDAD`/`MONTO_TOTAL` negativo en las 2,305 filas
muestreadas (0 filas con signo negativo) que sugiera nota de crédito o
recolección. **Ninguna línea real se marca como `devolucion`** — todas las
líneas reales que aporta esta fuente son `tipo: undefined` (= entrega,
retro-compatible con `Pedido.tipo`). El campo queda disponible para cuando
exista una señal real; mientras tanto el caso FR16 sigue cubierto solo por el
mock.

### Row counts (2026-09-02, QA)

| Fuente | Filas | Nota |
|---|---|---|
| `VIEW_DATOS_VIAJE_AUDITORIA_PED_AB` | 2,305 | filas artículo; 481 pedidos distintos; 27 viajes distintos |
| Viajes con líneas reales / total en `VIAJES_ENC_AB` | 27 / 959 | ~2.8% de cobertura |
| Clientes distintos en esos 27 viajes | 256 | |
| ...de los cuales con lat/lng poblado | 75 (~29%) | resto: `delivery_latitude`/`longitude` quedan `null` |
| `EFLOW_WMH.dbo.journey_orders` | 369,244 | liga a `VIAJE` real, pero sin dirección/cliente — no usable solo |
| `PEDIDOS_ASIGNADOS_MOVIL_AB` | 21,915 | alternativa a nivel de pedido (sin artículo), mismo patrón VIAJE+PEDIDO+CLIENTE |
| `ext_tms_*_mt` (13 tablas staging) | 0 cada una | esquema completo, datos vacíos — descartadas |

### Conclusión y alcance de la integración (paso 2)

Hay fuente real y usable, pero **parcial**: cubre 27 de 959 viajes QA, sin
peso/volumen por línea, sin señal de devolución. Se integra
`fetchPedidosPorViaje(viajeId)` contra `VIEW_DATOS_VIAJE_AUDITORIA_PED_AB` +
`CLIENTES` con la política de fallback ya usada por rutas/conductores/
vehículos: 0 filas reales para ese viaje ⇒ usar `getFallbackPedidos` (el mock
sigue siendo necesario para la inmensa mayoría de viajes QA, no es un
remanente a eliminar).
