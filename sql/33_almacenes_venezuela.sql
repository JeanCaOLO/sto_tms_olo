-- ============================================================================
-- 33 — Almacenes reales de Venezuela: San Diego y Michelena.
--
-- Pedido del usuario (2026-10-12): Febeca y Sillaca son del almacén San Diego;
-- Beval, del almacén Michelena. El almacén genérico OLO-VN ("OLO Venezuela")
-- era un marcador sin uso real (solo lo usaban esos tres clientes, sql/32):
-- se desactiva, no se borra.
--
-- Idempotente y nunca destructivo.
-- ============================================================================

begin;

insert into warehouses (organization_id, country_id, code, name, timezone, active)
select '11111111-1111-1111-1111-111111111111', c.id, v.code, v.name, 'America/Caracas', true
from (values ('SAN-DIEGO', 'San Diego'), ('MICHELENA', 'Michelena')) as v(code, name)
cross join (select id from countries where code = 'VN') c
on conflict (country_id, code) do nothing;

update customers cu
set warehouse_id = w.id, updated_at = now()
from (values ('FEBECA', 'SAN-DIEGO'), ('SILLACA', 'SAN-DIEGO'), ('BEVAL', 'MICHELENA')) as m(customer_code, warehouse_code)
join warehouses w on w.code = m.warehouse_code
join countries c on c.id = w.country_id and c.code = 'VN'
where cu.code = m.customer_code
  and cu.warehouse_id is distinct from w.id;

update warehouses w
set active = false, updated_at = now()
from countries c
where c.id = w.country_id and c.code = 'VN' and w.code = 'OLO-VN' and w.active
  and not exists (select 1 from customers cu where cu.warehouse_id = w.id);

commit;
