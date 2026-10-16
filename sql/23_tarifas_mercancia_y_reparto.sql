-- ============================================================================
-- 23 — Mercancía del viaje, reparto por casa comercial y fin de la tarifa plana de terceros.
--
-- Contexto (2026-10-05): lo que se liquida es la acumulación de gastos (estructura de costos). La
-- ganancia o pérdida es de AUDITORÍA: valor de la mercancía del viaje contra esos gastos. Y el
-- total se reparte entre las casas comerciales según lo que cada una carga.
--
--   * Vista `tarifas_v_viaje_cargas`: por viaje y casa comercial, el valor, peso, volumen y
--     cantidad de los pedidos de sus guías de despacho (un viaje tiene varias guías; cada guía
--     lleva un pedido; el pedido trae su cliente = la casa comercial).
--   * `tarifas_settlements.cargo_value` y `.allocation`: lo que se midió y cómo se repartió al emitir.
--   * Se elimina `tarifas_outsourced_cost_rates` (tarifa plana de costo de terceros): ya no se usa,
--     a un tercero se le paga lo que dicen las reglas y el tarifario. Solo se borra si está vacía.
--
-- Idempotente. No toca los datos de otras tablas.
-- ============================================================================

alter table tarifas_settlements add column if not exists cargo_value numeric;
alter table tarifas_settlements add column if not exists allocation jsonb;

-- Un pedido cuenta UNA vez por viaje aunque aparezca en más de una guía.
create or replace view tarifas_v_viaje_cargas as
with pedidos as (
  select distinct g.route_id, g.order_id
    from dispatch_guides g
   where g.order_id is not null and g.route_id is not null
)
select p.route_id::text || ':' || coalesce(o.customer_id::text, 'sin-casa') as id,
       p.route_id,
       o.customer_id,
       c.code as customer_code,
       c.name as customer_name,
       coalesce(sum(o.total_amount), 0)::numeric  as value,
       coalesce(sum(o.total_weight), 0)::numeric  as weight_kg,
       coalesce(sum(o.total_volume), 0)::numeric  as volume_m3,
       coalesce(sum(o.total_items), 0)::int       as items,
       count(distinct o.id)::int                  as orders
  from pedidos p
  join orders o on o.id = p.order_id
  left join customers c on c.id = o.customer_id
 group by p.route_id, o.customer_id, c.code, c.name;

comment on view tarifas_v_viaje_cargas is
  'Mercancía de cada viaje por casa comercial (pedidos de sus guías de despacho). Solo lectura.';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    execute 'revoke all on public.tarifas_v_viaje_cargas from tms_app';
    execute 'grant select on public.tarifas_v_viaje_cargas to tms_app';
  end if;
end $$;

-- Tarifa plana de terceros: fuera. Si alguien cargó filas, se detiene para no perderlas.
do $$
begin
  if to_regclass('public.tarifas_outsourced_cost_rates') is not null then
    if exists (select 1 from tarifas_outsourced_cost_rates) then
      raise exception 'tarifas_outsourced_cost_rates tiene filas: revíselas antes de eliminarla';
    end if;
    drop table tarifas_outsourced_cost_rates;
  end if;
  if to_regclass('audit.tracked_tables') is not null then
    delete from audit.tracked_tables
     where table_name in ('tarifas_outsourced_cost_rates', 'tarifas_own_cost_params');
  end if;
end $$;
