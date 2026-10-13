-- ============================================================================
-- 32 — Clientes de Venezuela: FEBECA, SILLACA y BEVAL.
--
-- Para la ingesta de sus puntos de entrega con coordenadas (2026-10-12).
-- En el modelo real de VE, Febeca y Sillaca comparten el WMS EFLOW_FEBECA
-- (compañías 0001/0002) y Beval tiene EFLOW_BEVAL; aquí son tres clientes
-- separados, colgados del país Venezuela y del almacén OLO-VN.
--
-- Nunca destructivo e idempotente: si el cliente ya existe no se toca.
-- ============================================================================

begin;

insert into customers (organization_id, country_id, warehouse_id, code, name, status)
select o.id, w.country_id, w.id, v.code, v.name, 'active'
from (values ('FEBECA', 'Febeca'), ('SILLACA', 'Sillaca'), ('BEVAL', 'Beval')) as v(code, name)
cross join (select id from organizations where id = '11111111-1111-1111-1111-111111111111') o
cross join (select id, country_id from warehouses where code = 'OLO-VN') w
on conflict (organization_id, code) do nothing;

commit;
