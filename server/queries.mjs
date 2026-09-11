// SELECT-only contra EFLOW PROD. Los inputs de usuario van SIEMPRE como
// parámetros bound (@name). Los nombres de BD (wmh, sap) los inyecta el server
// desde la config del país (identificadores de configuración, no input de
// usuario) — ver server/db.mjs.
//
// Fuentes reales verificadas 2026-09-08 (ver docs/guides/eflow-fuentes-reales.md):
//   <wmh>.dbo.distribution_routes / drivers / trasportation_units /
//     transportation_companies / journeys / journey_order_transportation
//   <sap>.dbo.EXPEDICIONESCABECERA (RUTA, PESO/CUBICAJE, NUMEROVIAJEWMH) + CLIENTES

// --- Catálogos (todos en la BD WMH) ----------------------------------------

export const listRutas = ({ wmh }) => `
SELECT route_id, route_code, route_name, route_alias, zone_id, state
FROM ${wmh}.dbo.distribution_routes
ORDER BY route_code`;

export const listTransportistas = ({ wmh }) => `
SELECT transportation_company_id AS carrier_id, company_code, company_name, state
FROM ${wmh}.dbo.transportation_companies
ORDER BY company_name`;

// driver_code = llave del chofer del lado WMS; driver_id = llave del lado WMH.
export const listConductores = ({ wmh }) => `
SELECT driver_id, driver_name, driver_card_id AS driver_document, driver_phone,
       driver_code, transportation_company_id AS carrier_id, state
FROM ${wmh}.dbo.drivers
WHERE (@carrierId IS NULL OR transportation_company_id = @carrierId)
ORDER BY driver_name`;

export const listVehiculos = ({ wmh }) => `
SELECT unit_id AS vehicle_id, license_plate, vehicle_brand, unit_description,
       weight_capacity, volumetric_capacity,
       transportation_company_id AS carrier_id, state
FROM ${wmh}.dbo.trasportation_units
WHERE (@carrierId IS NULL OR transportation_company_id = @carrierId)
ORDER BY license_plate`;

// --- Viajes (journeys = TODOS los viajes; solo se listan los que tienen pedidos)
// El viaje SOLO tiene número (journey_id) — NO tiene nombre; el nombre es de la
// RUTA, que se deriva de los pedidos. Sus pedidos se leen de journey_orders
// (viaje ↔ pedido) y se enriquecen con EXPEDICIONESCABECERA por
// (order_number = IDEXPEDICION, company_id = IDCOMPANIA, branch_id = IDSUCURSAL).
// El chofer/unidad salen de journey_order_transportation (una fila por viaje).
export const VIAJES_BASE = ({ wmh, sap }) => `
SELECT
  j.journey_id            AS trip_id,
  j.situation             AS trip_status,
  j.creation_date         AS trip_created,
  j.dispatch_date         AS trip_dispatch,
  j.closing_date          AS trip_closed,
  j.dock                  AS dock,
  agg.route_code          AS route_codes,
  r.route_name            AS route_name,
  r.route_alias           AS route_alias,
  d.driver_id             AS driver_id,
  d.driver_name           AS driver_name,
  d.driver_card_id        AS driver_document,
  d.driver_phone          AS driver_phone,
  co.company_name         AS carrier_name,
  u.unit_id               AS vehicle_id,
  u.license_plate         AS vehicle_plate,
  u.vehicle_brand         AS vehicle_brand,
  u.weight_capacity       AS vehicle_weight_capacity,
  u.volumetric_capacity   AS vehicle_volumetric_capacity,
  agg.pedidos             AS customer_count,
  agg.peso                AS total_weight,
  agg.volumen             AS total_volume
FROM ${wmh}.dbo.journeys j
CROSS APPLY (
  -- resumen de los pedidos del viaje: journey_orders -> EXPEDICIONESCABECERA
  SELECT COUNT(*) AS pedidos, SUM(e.PESOPEDIDO_TOTAL) AS peso,
         SUM(e.CUBICAJEPEDIDO_TOTAL) AS volumen, MIN(e.RUTA) AS route_code
  FROM ${wmh}.dbo.journey_orders jo
  JOIN ${sap}.dbo.EXPEDICIONESCABECERA e
    ON e.IDEXPEDICION = jo.order_number AND e.IDCOMPANIA = jo.company_id AND e.IDSUCURSAL = jo.branch_id
  WHERE jo.journey_id = j.journey_id
) agg
OUTER APPLY (
  SELECT TOP 1 jot.driver_id, jot.unit_id
  FROM ${wmh}.dbo.journey_order_transportation jot
  WHERE jot.journey_id = j.journey_id
) t
LEFT JOIN ${wmh}.dbo.drivers                  d  ON d.driver_id = t.driver_id
LEFT JOIN ${wmh}.dbo.trasportation_units      u  ON u.unit_id   = t.unit_id
LEFT JOIN ${wmh}.dbo.transportation_companies co ON co.transportation_company_id = d.transportation_company_id
LEFT JOIN ${wmh}.dbo.distribution_routes      r  ON r.route_code = agg.route_code
WHERE agg.pedidos > 0
`;

export const listViajes = (db) =>
  `${VIAJES_BASE(db)} ORDER BY j.journey_id DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;

export const getViaje = (db) => `${VIAJES_BASE(db)} AND j.journey_id = @id`;

// --- Pedidos de un viaje ----------------------------------------------------
// Fuente de verdad: journey_orders (viaje ↔ pedido). Cada pedido se enriquece
// con su cabecera EXPEDICIONESCABECERA (ruta, peso/volumen totalizados,
// prioridad, cliente) por (order_number, company_id, branch_id), y con CLIENTES
// por (IDCLIENTE, IDCOMPANIA) para dirección/coordenadas. Coordenadas poco
// pobladas (~2% CR / ~6% VE) — quedan NULL cuando faltan.
export const listPedidosPorViaje = ({ wmh, sap }) => `
SELECT
  jo.journey_id           AS trip_id,
  jo.order_number         AS order_number,
  e.IDCLIENTE             AS customer_id,
  cl.NOMBRELARGO          AS customer_name,
  cl.DIRECCIONLARGA       AS delivery_address,
  cl.LATITUD              AS delivery_latitude,
  cl.LONGITUD             AS delivery_longitude,
  e.RUTA                  AS route_code,
  e.PESOPEDIDO_TOTAL      AS total_weight,
  e.CUBICAJEPEDIDO_TOTAL  AS total_volume,
  e.PRIORIDAD             AS priority,
  e.TPEXPE                AS expedition_type
FROM ${wmh}.dbo.journey_orders jo
JOIN ${sap}.dbo.EXPEDICIONESCABECERA e
  ON e.IDEXPEDICION = jo.order_number AND e.IDCOMPANIA = jo.company_id AND e.IDSUCURSAL = jo.branch_id
LEFT JOIN ${sap}.dbo.CLIENTES cl
  ON cl.IDCLIENTE = e.IDCLIENTE AND cl.IDCOMPANIA = e.IDCOMPANIA
WHERE jo.journey_id = @viajeId
ORDER BY jo.order_number`;
