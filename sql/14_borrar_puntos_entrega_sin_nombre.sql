-- ============================================================================
-- 14 — Borrar los puntos de entrega sin nombre.
--
-- Decisión del usuario (2026-09-24): un punto de entrega sin nombre no sirve y
-- se elimina. El caso conocido es CO0190 (Cofersa), que vino del WMS con el
-- nombre vacío. Se borra como lo hace DELETE /v1/delivery-points/{id}: el punto
-- y su dirección (más sus contactos, que apuntan al punto); el cliente final
-- se conserva. La ingesta (backend/local/delivery_points_csv.py) ya ignora las
-- filas sin nombre, así que no vuelven.
-- Idempotente: una segunda corrida no encuentra nada que borrar.
-- ============================================================================

begin;

create temp table nameless_points on commit drop as
  select id, address_id from delivery_points where coalesce(btrim(name), '') = '';

delete from contacts where delivery_point_id in (select id from nameless_points);

delete from delivery_points where id in (select id from nameless_points);

delete from addresses a
where a.id in (select address_id from nameless_points)
  and not exists (select 1 from delivery_points d where d.address_id = a.id);

commit;
