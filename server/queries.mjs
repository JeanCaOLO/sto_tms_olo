// All SELECT-only. Inputs are always bound parameters (@name), never interpolated.

export const VIAJES_BASE = `
SELECT
  v.VIAJE                 AS trip_id,
  v.ESTADO                AS trip_status,
  v.COD_ESTADO            AS trip_status_code,
  v.FECHA_CREACION        AS trip_created,
  v.FECHA_DESPACHO        AS trip_dispatch,
  v.FECHA_CIERRE          AS trip_closed,
  v.DESTINO               AS route_codes,
  r.route_name            AS route_name,
  r.route_alias           AS route_alias,
  d.driver_id             AS driver_id,
  COALESCE(d.driver_name, v.CONDUCTOR) AS driver_name,
  d.driver_card_id        AS driver_document,
  d.driver_phone          AS driver_phone,
  u.unit_id               AS vehicle_id,
  u.license_plate         AS vehicle_plate,
  u.vehicle_brand         AS vehicle_brand,
  u.weight_capacity       AS vehicle_weight_capacity,
  u.volumetric_capacity   AS vehicle_volumetric_capacity,
  COALESCE(co.company_name, v.TRANSPORTE) AS carrier_name,
  v.COD_TRANSPORTE        AS carrier_code,
  v.MUELLE                AS dock,
  v.CANT_CLIENTE          AS customer_count,
  v.PESO                  AS total_weight,
  v.VOLUMEN               AS total_volume,
  v.BULTOS               AS total_packages
FROM EFLOW_OLO_QA_SAP.dbo.VIAJES_ENC_AB v
OUTER APPLY (
  SELECT TOP 1 jot.driver_id, jot.unit_id
  FROM EFLOW_WMH.dbo.journey_order_transportation jot
  WHERE jot.journey_id = v.VIAJE
) t
LEFT JOIN EFLOW_WMH.dbo.drivers                  d  ON d.driver_id = t.driver_id
LEFT JOIN EFLOW_WMH.dbo.trasportation_units      u  ON u.unit_id   = t.unit_id
LEFT JOIN EFLOW_WMH.dbo.transportation_companies co ON co.transportation_company_id = d.transportation_company_id
LEFT JOIN EFLOW_WMH.dbo.distribution_routes      r  ON r.route_code = LEFT(v.DESTINO, CHARINDEX(',', v.DESTINO + ',') - 1)
`;

export const listViajes = `${VIAJES_BASE} ORDER BY v.VIAJE DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;

export const getViaje = `${VIAJES_BASE} WHERE v.VIAJE = @id`;

export const listRutas = `
SELECT route_id, route_code, route_name, route_alias, zone_id, state
FROM EFLOW_WMH.dbo.distribution_routes
ORDER BY route_code`;

export const listTransportistas = `
SELECT transportation_company_id AS carrier_id, company_code, company_name, state
FROM EFLOW_WMH.dbo.transportation_companies
ORDER BY company_name`;

export const listConductores = `
SELECT driver_id, driver_name, driver_card_id AS driver_document, driver_phone,
       driver_code, transportation_company_id AS carrier_id, state
FROM EFLOW_WMH.dbo.drivers
WHERE (@carrierId IS NULL OR transportation_company_id = @carrierId)
ORDER BY driver_name`;

export const listVehiculos = `
SELECT unit_id AS vehicle_id, license_plate, vehicle_brand, unit_description,
       weight_capacity, volumetric_capacity,
       transportation_company_id AS carrier_id, state
FROM EFLOW_WMH.dbo.trasportation_units
WHERE (@carrierId IS NULL OR transportation_company_id = @carrierId)
ORDER BY license_plate`;

// Order lines for a trip. See docs/guides/eflow-qa-schema-planificacion.md #8.
// VIEW_DATOS_VIAJE_AUDITORIA_PED_AB is article-level (one row per item within
// an order); grouped by PEDIDO+FACTURA to get one row per order line. Only
// ~27/959 QA trips have rows here (partial real coverage) — 0 rows is
// expected for most trips and the caller falls back to the mock.
export const listPedidosPorViaje = `
SELECT
  a.VIAJE                 AS trip_id,
  a.PEDIDO                AS order_number,
  a.FACTURA                AS invoice_number,
  a.ID_CLIENTE             AS customer_id,
  a.NOM_CLIENTE            AS customer_name,
  c.DIRECCIONLARGA         AS delivery_address,
  c.LATITUD                AS delivery_latitude,
  c.LONGITUD               AS delivery_longitude,
  a.DESTINO                AS route_code,
  SUM(a.CANTIDAD)          AS total_units,
  SUM(a.MONTO_TOTAL)       AS total_amount
FROM EFLOW_OLO_QA_SAP.dbo.VIEW_DATOS_VIAJE_AUDITORIA_PED_AB a
LEFT JOIN EFLOW_OLO_QA_SAP.dbo.CLIENTES c
  ON c.IDCLIENTE = a.ID_CLIENTE AND c.IDCOMPANIA = a.ID_COMPANIA
WHERE a.VIAJE = @viajeId
GROUP BY a.VIAJE, a.PEDIDO, a.FACTURA, a.ID_CLIENTE, a.NOM_CLIENTE,
         c.DIRECCIONLARGA, c.LATITUD, c.LONGITUD, a.DESTINO`;
