"""SQL de Planificación (Aurora). Placeholders %s."""

# Punto de entrega: el marcado is_default del cliente final (si hay varios, el
# primero por nombre). delivery_zone = código de ruta del WMS, que es como la
# operación agrupa destinos hoy.
ORDERS_SQL = """
SELECT e.id, e.expedicion AS order_number,
       e.cliente_code AS customer_id, e.nombre_cliente AS customer_name,
       e.id_sucursal AS store_id, NULL::text AS store_name,
       COALESCE(concat_ws(', ', dp.line1, dp.line2), '') AS delivery_address,
       dp.city AS delivery_city, e.ruta AS delivery_zone,
       dp.latitude::float AS delivery_latitude, dp.longitude::float AS delivery_longitude,
       NULL::float AS total_weight, NULL::float AS total_volume, false AS capacity_known,
       e.fecha_planificada AS delivery_date, e.prioridad AS priority,
       e.id_compania, e.cant_lineas, e.situacion, e.observaciones
FROM wms_expediciones e
LEFT JOIN LATERAL (
  SELECT a.line1, a.line2, a.city, a.latitude, a.longitude
  FROM delivery_points p LEFT JOIN addresses a ON a.id = p.address_id
  WHERE p.final_customer_id = e.final_customer_id AND p.active = true
  ORDER BY p.is_default DESC, p.name
  LIMIT 1
) dp ON true
WHERE e.organization_id = %s
  AND e.situacion = 'GENE'
  AND e.numero_viaje_wmh IS NULL
  AND e.fecha_planificada = {delivery_date}
ORDER BY e.prioridad NULLS LAST, e.ruta, e.expedicion
"""
