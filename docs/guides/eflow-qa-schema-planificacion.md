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
