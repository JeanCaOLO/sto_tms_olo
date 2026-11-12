-- ============================================================================
-- 41_orders_precision_totales.sql — precisión de peso/volumen del pedido.
--
-- orders.total_weight y total_volume eran numeric(10,2): el volumen en m³ es
-- muy chico (ej. 0.0062) y 2 decimales lo redondeaba a 0.01 / 0.00, perdiendo
-- el dato. Se amplían a numeric(14,6). total_items/total_amount ya existen y el
-- ingest ahora los puebla (nº de líneas del pedido y COSTO_TOTAL de eFlow).
--
-- Dos vistas de tarifas (tarifas_v_viaje_cargas, tarifas_v_viaje_pedidos) usan
-- esas columnas, así que se DROP + ALTER + CREATE con su misma definición (solo
-- suman/coalescen las columnas; la lógica no cambia). Estándar INTELIX: ROLLBACK.
-- ============================================================================

drop view if exists tarifas_v_viaje_cargas;
drop view if exists tarifas_v_viaje_pedidos;

alter table orders
  alter column total_weight type numeric(14,6),
  alter column total_volume type numeric(14,6);

comment on column orders.total_weight is 'Peso total del pedido (kg), 6 decimales.';
comment on column orders.total_volume is 'Volumen total del pedido (m³), 6 decimales (los m³ son chicos; 2 decimales lo redondeaban a 0).';

create view tarifas_v_viaje_cargas as
 WITH pedidos AS (
         SELECT DISTINCT g.route_id, g.order_id
           FROM dispatch_guides g
          WHERE g.order_id IS NOT NULL AND g.route_id IS NOT NULL
        )
 SELECT (p.route_id::text || ':'::text) || COALESCE(o.customer_id::text, 'sin-casa'::text) AS id,
    p.route_id, o.customer_id, c.code AS customer_code, c.name AS customer_name,
    COALESCE(sum(o.total_amount), 0::numeric) AS value,
    COALESCE(sum(o.total_weight), 0::numeric) AS weight_kg,
    COALESCE(sum(o.total_volume), 0::numeric) AS volume_m3,
    COALESCE(sum(o.total_items), 0::bigint)::integer AS items,
    count(DISTINCT o.id)::integer AS orders
   FROM pedidos p
     JOIN orders o ON o.id = p.order_id
     LEFT JOIN customers c ON c.id = o.customer_id
  GROUP BY p.route_id, o.customer_id, c.code, c.name;

create view tarifas_v_viaje_pedidos as
 SELECT g.id, g.route_id, g.guide_number, g.sequence_number, g.delivery_status, g.order_id,
    o.order_number, o.customer_id, c.code AS customer_code, c.name AS customer_name,
    COALESCE(o.total_amount, 0::numeric) AS value,
    COALESCE(o.total_weight, 0::numeric) AS weight_kg,
    COALESCE(o.total_volume, 0::numeric) AS volume_m3,
    COALESCE(o.total_items, 0) AS items,
    m.mark, m.reason AS mark_reason
   FROM dispatch_guides g
     LEFT JOIN orders o ON o.id = g.order_id
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN tarifas_trip_order_marks m ON m.trip_id = g.route_id AND m.order_id = g.order_id
  WHERE g.route_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK (descomentar; vuelve a 2 decimales y PIERDE precisión). Requiere el
-- mismo baile de vistas: drop ambas, alter a numeric(10,2), recrear ambas.
-- ============================================================================
