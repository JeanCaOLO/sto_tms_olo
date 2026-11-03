-- ============================================================================
-- 59 ROLLBACK — deshace sql/59_estandar_oltp_renombrado.sql en orden inverso.
-- GENERADO por scripts/estandar-bd/generar_renombrado.py (mismo catálogo que la 59). Idempotente.
-- ============================================================================

begin;

-- Ejecuta `stmt` solo si `cond` es verdadera: hace idempotente cada renombrado.
create or replace function pg_temp.exec_if(cond boolean, stmt text) returns void language plpgsql as $f$
begin
  if cond then execute stmt; end if;
end $f$;

-- Copia a `dst` exactamente los privilegios no-dueño que tiene `src` (quita antes los que puso el
-- default ACL del esquema al crear la vista, para no ampliar permisos).
create or replace function pg_temp.copiar_grants(src regclass, dst regclass) returns void language plpgsql as $f$
declare
  r record;
  who text;
begin
  for r in select distinct a.grantee from pg_class c, aclexplode(c.relacl) a
            where c.oid = dst and a.grantee <> c.relowner loop
    who := case when r.grantee = 0 then 'public' else r.grantee::regrole::text end;
    execute format('revoke all on %s from %s', dst, who);
  end loop;
  for r in select a.grantee, a.privilege_type, a.is_grantable from pg_class c, aclexplode(c.relacl) a
            where c.oid = src and a.grantee <> c.relowner loop
    who := case when r.grantee = 0 then 'public' else r.grantee::regrole::text end;
    execute format('grant %s on %s to %s%s', r.privilege_type, dst, who,
                   case when r.is_grantable then ' with grant option' else '' end);
  end loop;
end $f$;

create or replace function pg_temp.rel_is(rel text, kinds text) returns boolean language sql as $f$
  select exists (select 1 from pg_class where oid = to_regclass(rel) and position(relkind::text in kinds) > 0)
$f$;

create or replace function pg_temp.con_on(rel text, con text) returns boolean language sql as $f$
  select exists (select 1 from pg_constraint where conrelid = to_regclass(rel) and conname = con)
$f$;

create or replace function pg_temp.trg_on(rel text, trg text) returns boolean language sql as $f$
  select exists (select 1 from pg_trigger where tgrelid = to_regclass(rel) and tgname = trg)
$f$;

select pg_temp.exec_if(pg_temp.rel_is('audit.events', 'v') and coalesce(obj_description(to_regclass('audit.events'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view audit.events');
select pg_temp.exec_if(pg_temp.rel_is('audit.tracked_tables', 'v') and coalesce(obj_description(to_regclass('audit.tracked_tables'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view audit.tracked_tables');
select pg_temp.exec_if(pg_temp.rel_is('public.addresses', 'v') and coalesce(obj_description(to_regclass('public.addresses'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.addresses');
select pg_temp.exec_if(pg_temp.rel_is('public.app_modules', 'v') and coalesce(obj_description(to_regclass('public.app_modules'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.app_modules');
select pg_temp.exec_if(pg_temp.rel_is('public.app_users', 'v') and coalesce(obj_description(to_regclass('public.app_users'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.app_users');
select pg_temp.exec_if(pg_temp.rel_is('public.auth_credentials', 'v') and coalesce(obj_description(to_regclass('public.auth_credentials'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.auth_credentials');
select pg_temp.exec_if(pg_temp.rel_is('public.branches', 'v') and coalesce(obj_description(to_regclass('public.branches'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.branches');
select pg_temp.exec_if(pg_temp.rel_is('public.carriers', 'v') and coalesce(obj_description(to_regclass('public.carriers'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.carriers');
select pg_temp.exec_if(pg_temp.rel_is('public.contacts', 'v') and coalesce(obj_description(to_regclass('public.contacts'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.contacts');
select pg_temp.exec_if(pg_temp.rel_is('public.contract_documents', 'v') and coalesce(obj_description(to_regclass('public.contract_documents'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.contract_documents');
select pg_temp.exec_if(pg_temp.rel_is('public.contracts', 'v') and coalesce(obj_description(to_regclass('public.contracts'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.contracts');
select pg_temp.exec_if(pg_temp.rel_is('public.costos_fijos', 'v') and coalesce(obj_description(to_regclass('public.costos_fijos'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.costos_fijos');
select pg_temp.exec_if(pg_temp.rel_is('public.costos_variables', 'v') and coalesce(obj_description(to_regclass('public.costos_variables'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.costos_variables');
select pg_temp.exec_if(pg_temp.rel_is('public.countries', 'v') and coalesce(obj_description(to_regclass('public.countries'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.countries');
select pg_temp.exec_if(pg_temp.rel_is('public.customers', 'v') and coalesce(obj_description(to_regclass('public.customers'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.customers');
select pg_temp.exec_if(pg_temp.rel_is('public.delivery_points', 'v') and coalesce(obj_description(to_regclass('public.delivery_points'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.delivery_points');
select pg_temp.exec_if(pg_temp.rel_is('public.depreciacion', 'v') and coalesce(obj_description(to_regclass('public.depreciacion'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.depreciacion');
select pg_temp.exec_if(pg_temp.rel_is('public.dispatch_guides', 'v') and coalesce(obj_description(to_regclass('public.dispatch_guides'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.dispatch_guides');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_license_types', 'v') and coalesce(obj_description(to_regclass('public.driver_license_types'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.driver_license_types');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_licenses', 'v') and coalesce(obj_description(to_regclass('public.driver_licenses'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.driver_licenses');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_presence', 'v') and coalesce(obj_description(to_regclass('public.driver_presence'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.driver_presence');
select pg_temp.exec_if(pg_temp.rel_is('public.drivers', 'v') and coalesce(obj_description(to_regclass('public.drivers'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.drivers');
select pg_temp.exec_if(pg_temp.rel_is('public.final_customers', 'v') and coalesce(obj_description(to_regclass('public.final_customers'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.final_customers');
select pg_temp.exec_if(pg_temp.rel_is('public.mobile_refresh_tokens', 'v') and coalesce(obj_description(to_regclass('public.mobile_refresh_tokens'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.mobile_refresh_tokens');
select pg_temp.exec_if(pg_temp.rel_is('public.oms_logs', 'v') and coalesce(obj_description(to_regclass('public.oms_logs'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.oms_logs');
select pg_temp.exec_if(pg_temp.rel_is('public.oms_rule_configs', 'v') and coalesce(obj_description(to_regclass('public.oms_rule_configs'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.oms_rule_configs');
select pg_temp.exec_if(pg_temp.rel_is('public.order_items', 'v') and coalesce(obj_description(to_regclass('public.order_items'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.order_items');
select pg_temp.exec_if(pg_temp.rel_is('public.orders', 'v') and coalesce(obj_description(to_regclass('public.orders'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.orders');
select pg_temp.exec_if(pg_temp.rel_is('public.organizations', 'v') and coalesce(obj_description(to_regclass('public.organizations'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.organizations');
select pg_temp.exec_if(pg_temp.rel_is('public.parametros_globales', 'v') and coalesce(obj_description(to_regclass('public.parametros_globales'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.parametros_globales');
select pg_temp.exec_if(pg_temp.rel_is('public.plan_stops', 'v') and coalesce(obj_description(to_regclass('public.plan_stops'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.plan_stops');
select pg_temp.exec_if(pg_temp.rel_is('public.plan_trips', 'v') and coalesce(obj_description(to_regclass('public.plan_trips'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.plan_trips');
select pg_temp.exec_if(pg_temp.rel_is('public.rates', 'v') and coalesce(obj_description(to_regclass('public.rates'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.rates');
select pg_temp.exec_if(pg_temp.rel_is('public.returns', 'v') and coalesce(obj_description(to_regclass('public.returns'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.returns');
select pg_temp.exec_if(pg_temp.rel_is('public.role_countries', 'v') and coalesce(obj_description(to_regclass('public.role_countries'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.role_countries');
select pg_temp.exec_if(pg_temp.rel_is('public.role_permissions', 'v') and coalesce(obj_description(to_regclass('public.role_permissions'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.role_permissions');
select pg_temp.exec_if(pg_temp.rel_is('public.roles', 'v') and coalesce(obj_description(to_regclass('public.roles'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.roles');
select pg_temp.exec_if(pg_temp.rel_is('public.route_plans', 'v') and coalesce(obj_description(to_regclass('public.route_plans'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.route_plans');
select pg_temp.exec_if(pg_temp.rel_is('public.routes', 'v') and coalesce(obj_description(to_regclass('public.routes'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.routes');
select pg_temp.exec_if(pg_temp.rel_is('public.rutas_costeo', 'v') and coalesce(obj_description(to_regclass('public.rutas_costeo'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.rutas_costeo');
select pg_temp.exec_if(pg_temp.rel_is('public.settlements', 'v') and coalesce(obj_description(to_regclass('public.settlements'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.settlements');
select pg_temp.exec_if(pg_temp.rel_is('public.sku_cotizaciones', 'v') and coalesce(obj_description(to_regclass('public.sku_cotizaciones'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.sku_cotizaciones');
select pg_temp.exec_if(pg_temp.rel_is('public.stores', 'v') and coalesce(obj_description(to_regclass('public.stores'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.stores');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_audit_log', 'v') and coalesce(obj_description(to_regclass('public.tarifas_audit_log'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_audit_log');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structure_rows', 'v') and coalesce(obj_description(to_regclass('public.tarifas_cost_structure_rows'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_cost_structure_rows');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structures', 'v') and coalesce(obj_description(to_regclass('public.tarifas_cost_structures'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_cost_structures');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_country_settings', 'v') and coalesce(obj_description(to_regclass('public.tarifas_country_settings'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_country_settings');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_margin_policies', 'v') and coalesce(obj_description(to_regclass('public.tarifas_margin_policies'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_margin_policies');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_party_variables', 'v') and coalesce(obj_description(to_regclass('public.tarifas_party_variables'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_party_variables');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_rules', 'v') and coalesce(obj_description(to_regclass('public.tarifas_pricing_rules'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_pricing_rules');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_templates', 'v') and coalesce(obj_description(to_regclass('public.tarifas_pricing_templates'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_pricing_templates');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_claims', 'v') and coalesce(obj_description(to_regclass('public.tarifas_proforma_claims'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_proforma_claims');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_email_config', 'v') and coalesce(obj_description(to_regclass('public.tarifas_proforma_email_config'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_proforma_email_config');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_flow_phases', 'v') and coalesce(obj_description(to_regclass('public.tarifas_proforma_flow_phases'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_proforma_flow_phases');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_items', 'v') and coalesce(obj_description(to_regclass('public.tarifas_proforma_items'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_proforma_items');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_phases', 'v') and coalesce(obj_description(to_regclass('public.tarifas_proforma_phases'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_proforma_phases');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proformas', 'v') and coalesce(obj_description(to_regclass('public.tarifas_proformas'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_proformas');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_table_rows', 'v') and coalesce(obj_description(to_regclass('public.tarifas_rate_table_rows'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_rate_table_rows');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_tables', 'v') and coalesce(obj_description(to_regclass('public.tarifas_rate_tables'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_rate_tables');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlement_parties', 'v') and coalesce(obj_description(to_regclass('public.tarifas_settlement_parties'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_settlement_parties');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements', 'v') and coalesce(obj_description(to_regclass('public.tarifas_settlements'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_settlements');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_order_marks', 'v') and coalesce(obj_description(to_regclass('public.tarifas_trip_order_marks'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_trip_order_marks');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_tender_awards', 'v') and coalesce(obj_description(to_regclass('public.tarifas_trip_tender_awards'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_trip_tender_awards');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_zone_groups', 'v') and coalesce(obj_description(to_regclass('public.tarifas_zone_groups'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_zone_groups');
select pg_temp.exec_if(pg_temp.rel_is('public.tariff_types', 'v') and coalesce(obj_description(to_regclass('public.tariff_types'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tariff_types');
select pg_temp.exec_if(pg_temp.rel_is('public.tipos_camion', 'v') and coalesce(obj_description(to_regclass('public.tipos_camion'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tipos_camion');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_consents', 'v') and coalesce(obj_description(to_regclass('public.tracking_consents'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tracking_consents');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_events', 'v') and coalesce(obj_description(to_regclass('public.tracking_events'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tracking_events');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_evidences', 'v') and coalesce(obj_description(to_regclass('public.tracking_evidences'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tracking_evidences');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_last_positions', 'v') and coalesce(obj_description(to_regclass('public.tracking_last_positions'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tracking_last_positions');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_positions', 'v') and coalesce(obj_description(to_regclass('public.tracking_positions'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tracking_positions');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_reviews', 'v') and coalesce(obj_description(to_regclass('public.tracking_reviews'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tracking_reviews');
select pg_temp.exec_if(pg_temp.rel_is('public.user_scopes', 'v') and coalesce(obj_description(to_regclass('public.user_scopes'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.user_scopes');
select pg_temp.exec_if(pg_temp.rel_is('public.vehicle_types', 'v') and coalesce(obj_description(to_regclass('public.vehicle_types'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.vehicle_types');
select pg_temp.exec_if(pg_temp.rel_is('public.vehicles', 'v') and coalesce(obj_description(to_regclass('public.vehicles'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.vehicles');
select pg_temp.exec_if(pg_temp.rel_is('public.warehouses', 'v') and coalesce(obj_description(to_regclass('public.warehouses'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.warehouses');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones', 'v') and coalesce(obj_description(to_regclass('public.wms_expediciones'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.wms_expediciones');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones_detalle', 'v') and coalesce(obj_description(to_regclass('public.wms_expediciones_detalle'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.wms_expediciones_detalle');
select pg_temp.exec_if(pg_temp.rel_is('public.zones', 'v') and coalesce(obj_description(to_regclass('public.zones'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.zones');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_devoluciones', 'v') and coalesce(obj_description(to_regclass('public.tarifas_v_devoluciones'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_v_devoluciones');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_viaje_cargas', 'v') and coalesce(obj_description(to_regclass('public.tarifas_v_viaje_cargas'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_v_viaje_cargas');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_viaje_pedidos', 'v') and coalesce(obj_description(to_regclass('public.tarifas_v_viaje_pedidos'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_v_viaje_pedidos');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_viajes', 'v') and coalesce(obj_description(to_regclass('public.tarifas_v_viajes'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.tarifas_v_viajes');
select pg_temp.exec_if(pg_temp.rel_is('public.v_costo_fijo_mensual', 'v') and coalesce(obj_description(to_regclass('public.v_costo_fijo_mensual'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.v_costo_fijo_mensual');
select pg_temp.exec_if(pg_temp.rel_is('public.v_costo_variable_por_km', 'v') and coalesce(obj_description(to_regclass('public.v_costo_variable_por_km'), 'pg_class'), '') like 'compat:estandar-oltp-59%', 'drop view public.v_costo_variable_por_km');

select pg_temp.exec_if(to_regclass('audit.tbl_tracked_tables') is not null, $s$update audit.tbl_tracked_tables set table_name = substr(table_name, 5) where table_name like 'tbl\_%'$s$);

select pg_temp.exec_if(pg_temp.rel_is('public.vw_tarifas_devoluciones', 'v'), 'alter view public.vw_tarifas_devoluciones rename to tarifas_v_devoluciones');
select pg_temp.exec_if(pg_temp.rel_is('public.vw_tarifas_viaje_cargas', 'v'), 'alter view public.vw_tarifas_viaje_cargas rename to tarifas_v_viaje_cargas');
select pg_temp.exec_if(pg_temp.rel_is('public.vw_tarifas_viaje_pedidos', 'v'), 'alter view public.vw_tarifas_viaje_pedidos rename to tarifas_v_viaje_pedidos');
select pg_temp.exec_if(pg_temp.rel_is('public.vw_tarifas_viajes', 'v'), 'alter view public.vw_tarifas_viajes rename to tarifas_v_viajes');
select pg_temp.exec_if(pg_temp.rel_is('public.vw_costo_fijo_mensual', 'v'), 'alter view public.vw_costo_fijo_mensual rename to v_costo_fijo_mensual');
select pg_temp.exec_if(pg_temp.rel_is('public.vw_costo_variable_por_km', 'v'), 'alter view public.vw_costo_variable_por_km rename to v_costo_variable_por_km');
select pg_temp.exec_if(pg_temp.rel_is('audit.seq_events_id', 'S'), 'alter sequence audit.seq_events_id rename to event_ids');
select pg_temp.exec_if(pg_temp.rel_is('public.seq_costos_fijos_id', 'S'), 'alter sequence public.seq_costos_fijos_id rename to costos_fijos_id_seq');
select pg_temp.exec_if(pg_temp.rel_is('public.seq_costos_variables_id', 'S'), 'alter sequence public.seq_costos_variables_id rename to costos_variables_id_seq');
select pg_temp.exec_if(pg_temp.rel_is('public.seq_tracking_positions_id', 'S'), 'alter sequence public.seq_tracking_positions_id rename to tracking_positions_id_seq');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_app_users', 'trg_app_users_audit_row_change'), 'alter trigger trg_app_users_audit_row_change on public.tbl_app_users rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_carriers', 'trg_carriers_audit_row_change'), 'alter trigger trg_carriers_audit_row_change on public.tbl_carriers rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_contract_documents', 'trg_contract_documents_audit_row_change'), 'alter trigger trg_contract_documents_audit_row_change on public.tbl_contract_documents rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_contracts', 'trg_contracts_audit_row_change'), 'alter trigger trg_contracts_audit_row_change on public.tbl_contracts rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_costos_fijos', 'trg_costos_fijos_audit_row_change'), 'alter trigger trg_costos_fijos_audit_row_change on public.tbl_costos_fijos rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_costos_variables', 'trg_costos_variables_audit_row_change'), 'alter trigger trg_costos_variables_audit_row_change on public.tbl_costos_variables rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_countries', 'trg_countries_audit_row_change'), 'alter trigger trg_countries_audit_row_change on public.tbl_countries rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_customers', 'trg_customers_audit_row_change'), 'alter trigger trg_customers_audit_row_change on public.tbl_customers rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_depreciacion', 'trg_depreciacion_audit_row_change'), 'alter trigger trg_depreciacion_audit_row_change on public.tbl_depreciacion rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_dispatch_guides', 'trg_dispatch_guides_audit_row_change'), 'alter trigger trg_dispatch_guides_audit_row_change on public.tbl_dispatch_guides rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_drivers', 'trg_drivers_audit_row_change'), 'alter trigger trg_drivers_audit_row_change on public.tbl_drivers rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_order_items', 'trg_order_items_audit_row_change'), 'alter trigger trg_order_items_audit_row_change on public.tbl_order_items rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_orders', 'trg_orders_audit_row_change'), 'alter trigger trg_orders_audit_row_change on public.tbl_orders rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_organizations', 'trg_organizations_audit_row_change'), 'alter trigger trg_organizations_audit_row_change on public.tbl_organizations rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_parametros_globales', 'trg_parametros_globales_audit_row_change'), 'alter trigger trg_parametros_globales_audit_row_change on public.tbl_parametros_globales rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_rates', 'trg_rates_audit_row_change'), 'alter trigger trg_rates_audit_row_change on public.tbl_rates rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_returns', 'trg_returns_audit_row_change'), 'alter trigger trg_returns_audit_row_change on public.tbl_returns rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_roles', 'trg_roles_audit_row_change'), 'alter trigger trg_roles_audit_row_change on public.tbl_roles rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_zones', 'trg_zones_audit_row_change'), 'alter trigger trg_zones_audit_row_change on public.tbl_zones rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_zones', 'trg_zones_reassign_points'), 'alter trigger trg_zones_reassign_points on public.tbl_zones rename to zones_reassign_points_trg');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_routes', 'trg_routes_audit_row_change'), 'alter trigger trg_routes_audit_row_change on public.tbl_routes rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_rutas_costeo', 'trg_rutas_costeo_audit_row_change'), 'alter trigger trg_rutas_costeo_audit_row_change on public.tbl_rutas_costeo rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_settlements', 'trg_settlements_audit_row_change'), 'alter trigger trg_settlements_audit_row_change on public.tbl_settlements rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_sku_cotizaciones', 'trg_sku_cotizaciones_audit_row_change'), 'alter trigger trg_sku_cotizaciones_audit_row_change on public.tbl_sku_cotizaciones rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_stores', 'trg_stores_audit_row_change'), 'alter trigger trg_stores_audit_row_change on public.tbl_stores rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tipos_camion', 'trg_tipos_camion_audit_row_change'), 'alter trigger trg_tipos_camion_audit_row_change on public.tbl_tipos_camion rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tracking_events', 'trg_tracking_events_audit_row_change'), 'alter trigger trg_tracking_events_audit_row_change on public.tbl_tracking_events rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_vehicle_types', 'trg_vehicle_types_audit_row_change'), 'alter trigger trg_vehicle_types_audit_row_change on public.tbl_vehicle_types rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_vehicles', 'trg_vehicles_audit_row_change'), 'alter trigger trg_vehicles_audit_row_change on public.tbl_vehicles rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_auth_credentials', 'trg_auth_credentials_audit_row_change'), 'alter trigger trg_auth_credentials_audit_row_change on public.tbl_auth_credentials rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_driver_license_types', 'trg_driver_license_types_audit_row_change'), 'alter trigger trg_driver_license_types_audit_row_change on public.tbl_driver_license_types rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tariff_types', 'trg_tariff_types_audit_row_change'), 'alter trigger trg_tariff_types_audit_row_change on public.tbl_tariff_types rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_warehouses', 'trg_warehouses_audit_row_change'), 'alter trigger trg_warehouses_audit_row_change on public.tbl_warehouses rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_addresses', 'trg_addresses_reassign_point'), 'alter trigger trg_addresses_reassign_point on public.tbl_addresses rename to addresses_reassign_point_trg');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_addresses', 'trg_addresses_audit_row_change'), 'alter trigger trg_addresses_audit_row_change on public.tbl_addresses rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_final_customers', 'trg_final_customers_audit_row_change'), 'alter trigger trg_final_customers_audit_row_change on public.tbl_final_customers rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_delivery_points', 'trg_delivery_points_audit_row_change'), 'alter trigger trg_delivery_points_audit_row_change on public.tbl_delivery_points rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_delivery_points', 'trg_delivery_points_zone_source'), 'alter trigger trg_delivery_points_zone_source on public.tbl_delivery_points rename to delivery_points_zone_source_trg');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_contacts', 'trg_contacts_audit_row_change'), 'alter trigger trg_contacts_audit_row_change on public.tbl_contacts rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_driver_licenses', 'trg_driver_licenses_audit_row_change'), 'alter trigger trg_driver_licenses_audit_row_change on public.tbl_driver_licenses rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_user_scopes', 'trg_user_scopes_audit_row_change'), 'alter trigger trg_user_scopes_audit_row_change on public.tbl_user_scopes rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_wms_expediciones', 'trg_wms_expediciones_audit_row_change'), 'alter trigger trg_wms_expediciones_audit_row_change on public.tbl_wms_expediciones rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_app_modules', 'trg_app_modules_audit_row_change'), 'alter trigger trg_app_modules_audit_row_change on public.tbl_app_modules rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_role_permissions', 'trg_role_permissions_audit_row_change'), 'alter trigger trg_role_permissions_audit_row_change on public.tbl_role_permissions rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_role_countries', 'trg_role_countries_audit_row_change'), 'alter trigger trg_role_countries_audit_row_change on public.tbl_role_countries rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events', 'trg_events_append_only'), 'alter trigger trg_events_append_only on audit.tbl_events rename to events_append_only');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events', 'trg_events_no_truncate'), 'alter trigger trg_events_no_truncate on audit.tbl_events rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_default', 'trg_events_default_no_truncate'), 'alter trigger trg_events_default_no_truncate on audit.tbl_events_default rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_09', 'trg_events_2026_09_no_truncate'), 'alter trigger trg_events_2026_09_no_truncate on audit.tbl_events_2026_09 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_10', 'trg_events_2026_10_no_truncate'), 'alter trigger trg_events_2026_10_no_truncate on audit.tbl_events_2026_10 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_11', 'trg_events_2026_11_no_truncate'), 'alter trigger trg_events_2026_11_no_truncate on audit.tbl_events_2026_11 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_12', 'trg_events_2026_12_no_truncate'), 'alter trigger trg_events_2026_12_no_truncate on audit.tbl_events_2026_12 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_01', 'trg_events_2027_01_no_truncate'), 'alter trigger trg_events_2027_01_no_truncate on audit.tbl_events_2027_01 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_02', 'trg_events_2027_02_no_truncate'), 'alter trigger trg_events_2027_02_no_truncate on audit.tbl_events_2027_02 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_03', 'trg_events_2027_03_no_truncate'), 'alter trigger trg_events_2027_03_no_truncate on audit.tbl_events_2027_03 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_04', 'trg_events_2027_04_no_truncate'), 'alter trigger trg_events_2027_04_no_truncate on audit.tbl_events_2027_04 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_05', 'trg_events_2027_05_no_truncate'), 'alter trigger trg_events_2027_05_no_truncate on audit.tbl_events_2027_05 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_06', 'trg_events_2027_06_no_truncate'), 'alter trigger trg_events_2027_06_no_truncate on audit.tbl_events_2027_06 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_07', 'trg_events_2027_07_no_truncate'), 'alter trigger trg_events_2027_07_no_truncate on audit.tbl_events_2027_07 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_08', 'trg_events_2027_08_no_truncate'), 'alter trigger trg_events_2027_08_no_truncate on audit.tbl_events_2027_08 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_09', 'trg_events_2027_09_no_truncate'), 'alter trigger trg_events_2027_09_no_truncate on audit.tbl_events_2027_09 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_10', 'trg_events_2027_10_no_truncate'), 'alter trigger trg_events_2027_10_no_truncate on audit.tbl_events_2027_10 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_11', 'trg_events_2027_11_no_truncate'), 'alter trigger trg_events_2027_11_no_truncate on audit.tbl_events_2027_11 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_12', 'trg_events_2027_12_no_truncate'), 'alter trigger trg_events_2027_12_no_truncate on audit.tbl_events_2027_12 rename to events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_country_settings', 'trg_tarifas_country_settings_audit_row_change'), 'alter trigger trg_tarifas_country_settings_audit_row_change on public.tbl_tarifas_country_settings rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_zone_groups', 'trg_tarifas_zone_groups_audit_row_change'), 'alter trigger trg_tarifas_zone_groups_audit_row_change on public.tbl_tarifas_zone_groups rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_settlement_parties', 'trg_tarifas_settlement_parties_audit_row_change'), 'alter trigger trg_tarifas_settlement_parties_audit_row_change on public.tbl_tarifas_settlement_parties rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_pricing_rules', 'trg_tarifas_pricing_rules_audit_row_change'), 'alter trigger trg_tarifas_pricing_rules_audit_row_change on public.tbl_tarifas_pricing_rules rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_pricing_templates', 'trg_tarifas_pricing_templates_audit_row_change'), 'alter trigger trg_tarifas_pricing_templates_audit_row_change on public.tbl_tarifas_pricing_templates rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_party_variables', 'trg_tarifas_party_variables_audit_row_change'), 'alter trigger trg_tarifas_party_variables_audit_row_change on public.tbl_tarifas_party_variables rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_settlements', 'trg_tarifas_settlements_audit_row_change'), 'alter trigger trg_tarifas_settlements_audit_row_change on public.tbl_tarifas_settlements rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_cost_structures', 'trg_tarifas_cost_structures_audit_row_change'), 'alter trigger trg_tarifas_cost_structures_audit_row_change on public.tbl_tarifas_cost_structures rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_cost_structure_rows', 'trg_tarifas_cost_structure_rows_audit_row_change'), 'alter trigger trg_tarifas_cost_structure_rows_audit_row_change on public.tbl_tarifas_cost_structure_rows rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_rate_tables', 'trg_tarifas_rate_tables_audit_row_change'), 'alter trigger trg_tarifas_rate_tables_audit_row_change on public.tbl_tarifas_rate_tables rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_rate_table_rows', 'trg_tarifas_rate_table_rows_audit_row_change'), 'alter trigger trg_tarifas_rate_table_rows_audit_row_change on public.tbl_tarifas_rate_table_rows rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_margin_policies', 'trg_tarifas_margin_policies_audit_row_change'), 'alter trigger trg_tarifas_margin_policies_audit_row_change on public.tbl_tarifas_margin_policies rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_audit_log', 'trg_tarifas_audit_log_append_only'), 'alter trigger trg_tarifas_audit_log_append_only on public.tbl_tarifas_audit_log rename to tarifas_audit_log_append_only');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_trip_order_marks', 'trg_tarifas_trip_order_marks_audit_row_change'), 'alter trigger trg_tarifas_trip_order_marks_audit_row_change on public.tbl_tarifas_trip_order_marks rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_branches', 'trg_branches_audit_row_change'), 'alter trigger trg_branches_audit_row_change on public.tbl_branches rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tracking_evidences', 'trg_tracking_evidences_audit_row_change'), 'alter trigger trg_tracking_evidences_audit_row_change on public.tbl_tracking_evidences rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tracking_reviews', 'trg_tracking_reviews_audit_row_change'), 'alter trigger trg_tracking_reviews_audit_row_change on public.tbl_tracking_reviews rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proformas', 'trg_tarifas_proformas_audit_row_change'), 'alter trigger trg_tarifas_proformas_audit_row_change on public.tbl_tarifas_proformas rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_items', 'trg_tarifas_proforma_items_audit_row_change'), 'alter trigger trg_tarifas_proforma_items_audit_row_change on public.tbl_tarifas_proforma_items rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_phases', 'trg_tarifas_proforma_phases_audit_row_change'), 'alter trigger trg_tarifas_proforma_phases_audit_row_change on public.tbl_tarifas_proforma_phases rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_flow_phases', 'trg_tarifas_proforma_flow_phases_audit_row_change'), 'alter trigger trg_tarifas_proforma_flow_phases_audit_row_change on public.tbl_tarifas_proforma_flow_phases rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_email_config', 'trg_tarifas_proforma_email_config_audit_row_change'), 'alter trigger trg_tarifas_proforma_email_config_audit_row_change on public.tbl_tarifas_proforma_email_config rename to audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_claims', 'trg_tarifas_proforma_claims_audit_row_change'), 'alter trigger trg_tarifas_proforma_claims_audit_row_change on public.tbl_tarifas_proforma_claims rename to audit_row_change');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_customers_name_trgm', 'iI'), 'alter index public.idx_customers_name_trgm rename to customers_name_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_dispatch_guides_guide_number_trgm', 'iI'), 'alter index public.idx_dispatch_guides_guide_number_trgm rename to dispatch_guides_guide_number_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_drivers_full_name_trgm', 'iI'), 'alter index public.idx_drivers_full_name_trgm rename to ix_drivers_full_name_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_drivers_app_user', 'iI'), 'alter index public.uidx_drivers_app_user rename to ux_drivers_app_user');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_orders_order_number_trgm', 'iI'), 'alter index public.idx_orders_order_number_trgm rename to orders_order_number_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_zones_country_code', 'iI'), 'alter index public.uidx_zones_country_code rename to zones_country_code_key');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_zones_country_id', 'iI'), 'alter index public.idx_zones_country_id rename to zones_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_routes_driver_org', 'iI'), 'alter index public.idx_routes_driver_org rename to ix_routes_driver_org');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_routes_org_sort', 'iI'), 'alter index public.idx_routes_org_sort rename to ix_routes_org_sort');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_routes_route_number_trgm', 'iI'), 'alter index public.idx_routes_route_number_trgm rename to ix_routes_route_number_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_routes_status_lower', 'iI'), 'alter index public.idx_routes_status_lower rename to ix_routes_status_lower');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_routes_plan_trip', 'iI'), 'alter index public.uidx_routes_plan_trip rename to ux_routes_plan_trip');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_events_route_time', 'iI'), 'alter index public.idx_tracking_events_route_time rename to ix_tracking_events_route_time');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tracking_events_client', 'iI'), 'alter index public.uidx_tracking_events_client rename to ux_tracking_events_client');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_vehicles_plate_trgm', 'iI'), 'alter index public.idx_vehicles_plate_trgm rename to ix_vehicles_plate_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_driver_license_types_country_code', 'iI'), 'alter index public.uidx_driver_license_types_country_code rename to driver_license_types_country_code_key');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_delivery_points_final_customer_external_code', 'iI'), 'alter index public.uidx_delivery_points_final_customer_external_code rename to delivery_points_final_customer_external_code_key');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_delivery_points_final_customer_id', 'iI'), 'alter index public.idx_delivery_points_final_customer_id rename to delivery_points_final_customer_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_delivery_points_one_default_per_final_customer', 'iI'), 'alter index public.uidx_delivery_points_one_default_per_final_customer rename to delivery_points_one_default_per_final_customer');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_delivery_points_zone_id', 'iI'), 'alter index public.idx_delivery_points_zone_id rename to delivery_points_zone_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_user_scopes_app_user_id', 'iI'), 'alter index public.idx_user_scopes_app_user_id rename to user_scopes_app_user_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_user_scopes_country_id', 'iI'), 'alter index public.idx_user_scopes_country_id rename to user_scopes_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_user_scopes_customer_id', 'iI'), 'alter index public.idx_user_scopes_customer_id rename to user_scopes_customer_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_user_scopes_warehouse_id', 'iI'), 'alter index public.idx_user_scopes_warehouse_id rename to user_scopes_warehouse_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_wms_expediciones_id_compania', 'iI'), 'alter index public.idx_wms_expediciones_id_compania rename to wms_expediciones_id_compania_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_wms_expediciones_natural', 'iI'), 'alter index public.uidx_wms_expediciones_natural rename to wms_expediciones_natural_key');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_wms_expediciones_situacion', 'iI'), 'alter index public.idx_wms_expediciones_situacion rename to wms_expediciones_situacion_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_wms_expediciones_warehouse_id', 'iI'), 'alter index public.idx_wms_expediciones_warehouse_id rename to wms_expediciones_warehouse_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_action', 'iI'), 'alter index audit.idx_events_action rename to events_action_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_app_user', 'iI'), 'alter index audit.idx_events_app_user rename to events_app_user_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_entity', 'iI'), 'alter index audit.idx_events_entity rename to events_entity_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_module', 'iI'), 'alter index audit.idx_events_module rename to events_module_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_occurred_at', 'iI'), 'alter index audit.idx_events_occurred_at rename to events_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_default_action_occurred_at', 'iI'), 'alter index audit.idx_events_default_action_occurred_at rename to events_default_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_default_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_default_app_user_id_occurred_at rename to events_default_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_default_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_default_entity_table_entity_id_occurred_at rename to events_default_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_default_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_default_module_key_occurred_at rename to events_default_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_default_occurred_at', 'iI'), 'alter index audit.idx_events_default_occurred_at rename to events_default_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_09_action_occurred_at', 'iI'), 'alter index audit.idx_events_2026_09_action_occurred_at rename to events_2026_09_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_09_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_09_app_user_id_occurred_at rename to events_2026_09_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_09_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_09_entity_table_entity_id_occurred_at rename to events_2026_09_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_09_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2026_09_module_key_occurred_at rename to events_2026_09_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_09_occurred_at', 'iI'), 'alter index audit.idx_events_2026_09_occurred_at rename to events_2026_09_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_10_action_occurred_at', 'iI'), 'alter index audit.idx_events_2026_10_action_occurred_at rename to events_2026_10_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_10_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_10_app_user_id_occurred_at rename to events_2026_10_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_10_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_10_entity_table_entity_id_occurred_at rename to events_2026_10_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_10_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2026_10_module_key_occurred_at rename to events_2026_10_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_10_occurred_at', 'iI'), 'alter index audit.idx_events_2026_10_occurred_at rename to events_2026_10_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_11_action_occurred_at', 'iI'), 'alter index audit.idx_events_2026_11_action_occurred_at rename to events_2026_11_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_11_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_11_app_user_id_occurred_at rename to events_2026_11_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_11_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_11_entity_table_entity_id_occurred_at rename to events_2026_11_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_11_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2026_11_module_key_occurred_at rename to events_2026_11_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_11_occurred_at', 'iI'), 'alter index audit.idx_events_2026_11_occurred_at rename to events_2026_11_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_12_action_occurred_at', 'iI'), 'alter index audit.idx_events_2026_12_action_occurred_at rename to events_2026_12_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_12_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_12_app_user_id_occurred_at rename to events_2026_12_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_12_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2026_12_entity_table_entity_id_occurred_at rename to events_2026_12_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_12_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2026_12_module_key_occurred_at rename to events_2026_12_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2026_12_occurred_at', 'iI'), 'alter index audit.idx_events_2026_12_occurred_at rename to events_2026_12_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_01_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_01_action_occurred_at rename to events_2027_01_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_01_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_01_app_user_id_occurred_at rename to events_2027_01_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_01_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_01_entity_table_entity_id_occurred_at rename to events_2027_01_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_01_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_01_module_key_occurred_at rename to events_2027_01_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_01_occurred_at', 'iI'), 'alter index audit.idx_events_2027_01_occurred_at rename to events_2027_01_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_02_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_02_action_occurred_at rename to events_2027_02_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_02_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_02_app_user_id_occurred_at rename to events_2027_02_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_02_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_02_entity_table_entity_id_occurred_at rename to events_2027_02_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_02_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_02_module_key_occurred_at rename to events_2027_02_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_02_occurred_at', 'iI'), 'alter index audit.idx_events_2027_02_occurred_at rename to events_2027_02_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_03_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_03_action_occurred_at rename to events_2027_03_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_03_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_03_app_user_id_occurred_at rename to events_2027_03_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_03_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_03_entity_table_entity_id_occurred_at rename to events_2027_03_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_03_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_03_module_key_occurred_at rename to events_2027_03_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_03_occurred_at', 'iI'), 'alter index audit.idx_events_2027_03_occurred_at rename to events_2027_03_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_04_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_04_action_occurred_at rename to events_2027_04_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_04_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_04_app_user_id_occurred_at rename to events_2027_04_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_04_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_04_entity_table_entity_id_occurred_at rename to events_2027_04_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_04_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_04_module_key_occurred_at rename to events_2027_04_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_04_occurred_at', 'iI'), 'alter index audit.idx_events_2027_04_occurred_at rename to events_2027_04_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_05_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_05_action_occurred_at rename to events_2027_05_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_05_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_05_app_user_id_occurred_at rename to events_2027_05_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_05_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_05_entity_table_entity_id_occurred_at rename to events_2027_05_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_05_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_05_module_key_occurred_at rename to events_2027_05_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_05_occurred_at', 'iI'), 'alter index audit.idx_events_2027_05_occurred_at rename to events_2027_05_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_06_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_06_action_occurred_at rename to events_2027_06_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_06_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_06_app_user_id_occurred_at rename to events_2027_06_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_06_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_06_entity_table_entity_id_occurred_at rename to events_2027_06_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_06_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_06_module_key_occurred_at rename to events_2027_06_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_06_occurred_at', 'iI'), 'alter index audit.idx_events_2027_06_occurred_at rename to events_2027_06_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_07_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_07_action_occurred_at rename to events_2027_07_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_07_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_07_app_user_id_occurred_at rename to events_2027_07_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_07_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_07_entity_table_entity_id_occurred_at rename to events_2027_07_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_07_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_07_module_key_occurred_at rename to events_2027_07_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_07_occurred_at', 'iI'), 'alter index audit.idx_events_2027_07_occurred_at rename to events_2027_07_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_08_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_08_action_occurred_at rename to events_2027_08_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_08_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_08_app_user_id_occurred_at rename to events_2027_08_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_08_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_08_entity_table_entity_id_occurred_at rename to events_2027_08_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_08_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_08_module_key_occurred_at rename to events_2027_08_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_08_occurred_at', 'iI'), 'alter index audit.idx_events_2027_08_occurred_at rename to events_2027_08_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_09_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_09_action_occurred_at rename to events_2027_09_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_09_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_09_app_user_id_occurred_at rename to events_2027_09_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_09_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_09_entity_table_entity_id_occurred_at rename to events_2027_09_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_09_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_09_module_key_occurred_at rename to events_2027_09_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_09_occurred_at', 'iI'), 'alter index audit.idx_events_2027_09_occurred_at rename to events_2027_09_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_10_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_10_action_occurred_at rename to events_2027_10_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_10_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_10_app_user_id_occurred_at rename to events_2027_10_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_10_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_10_entity_table_entity_id_occurred_at rename to events_2027_10_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_10_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_10_module_key_occurred_at rename to events_2027_10_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_10_occurred_at', 'iI'), 'alter index audit.idx_events_2027_10_occurred_at rename to events_2027_10_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_11_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_11_action_occurred_at rename to events_2027_11_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_11_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_11_app_user_id_occurred_at rename to events_2027_11_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_11_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_11_entity_table_entity_id_occurred_at rename to events_2027_11_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_11_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_11_module_key_occurred_at rename to events_2027_11_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_11_occurred_at', 'iI'), 'alter index audit.idx_events_2027_11_occurred_at rename to events_2027_11_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_12_action_occurred_at', 'iI'), 'alter index audit.idx_events_2027_12_action_occurred_at rename to events_2027_12_action_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_12_app_user_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_12_app_user_id_occurred_at rename to events_2027_12_app_user_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_12_entity_table_entity_id_occurred_at', 'iI'), 'alter index audit.idx_events_2027_12_entity_table_entity_id_occurred_at rename to events_2027_12_entity_table_entity_id_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_12_module_key_occurred_at', 'iI'), 'alter index audit.idx_events_2027_12_module_key_occurred_at rename to events_2027_12_module_key_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('audit.idx_events_2027_12_occurred_at', 'iI'), 'alter index audit.idx_events_2027_12_occurred_at rename to events_2027_12_occurred_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_route_plans_customer', 'iI'), 'alter index public.idx_route_plans_customer rename to ix_route_plans_customer');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_route_plans_wh_date_status', 'iI'), 'alter index public.idx_route_plans_wh_date_status rename to ix_route_plans_wh_date_status');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_plan_trips_plan', 'iI'), 'alter index public.idx_plan_trips_plan rename to ix_plan_trips_plan');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_plan_stops_trip', 'iI'), 'alter index public.idx_plan_stops_trip rename to ix_plan_stops_trip');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_zone_groups_country_id', 'iI'), 'alter index public.idx_tarifas_zone_groups_country_id rename to tarifas_zone_groups_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_pricing_rules_country_id', 'iI'), 'alter index public.idx_tarifas_pricing_rules_country_id rename to tarifas_pricing_rules_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_pricing_rules_party_id', 'iI'), 'alter index public.idx_tarifas_pricing_rules_party_id rename to tarifas_pricing_rules_party_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_pricing_templates_country_id', 'iI'), 'alter index public.idx_tarifas_pricing_templates_country_id rename to tarifas_pricing_templates_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_party_variables_key', 'iI'), 'alter index public.idx_tarifas_party_variables_key rename to tarifas_party_variables_key_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_party_variables_party_id', 'iI'), 'alter index public.idx_tarifas_party_variables_party_id rename to tarifas_party_variables_party_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_settlements_country_date', 'iI'), 'alter index public.idx_tarifas_settlements_country_date rename to tarifas_settlements_country_date_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_settlements_country_number_uq', 'iI'), 'alter index public.uidx_tarifas_settlements_country_number_uq rename to tarifas_settlements_country_number_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_settlements_party_id', 'iI'), 'alter index public.idx_tarifas_settlements_party_id rename to tarifas_settlements_party_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_settlements_superseded_by', 'iI'), 'alter index public.idx_tarifas_settlements_superseded_by rename to tarifas_settlements_superseded_by_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_settlements_trip_id', 'iI'), 'alter index public.idx_tarifas_settlements_trip_id rename to tarifas_settlements_trip_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_settlements_trip_number', 'iI'), 'alter index public.idx_tarifas_settlements_trip_number rename to tarifas_settlements_trip_number_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_settlements_trip_vigente_uq', 'iI'), 'alter index public.uidx_tarifas_settlements_trip_vigente_uq rename to tarifas_settlements_trip_vigente_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_cost_structures_country_id', 'iI'), 'alter index public.idx_tarifas_cost_structures_country_id rename to tarifas_cost_structures_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_cost_structures_party_id', 'iI'), 'alter index public.idx_tarifas_cost_structures_party_id rename to tarifas_cost_structures_party_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_cost_structure_rows_structure_id', 'iI'), 'alter index public.idx_tarifas_cost_structure_rows_structure_id rename to tarifas_cost_structure_rows_structure_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_rate_tables_code', 'iI'), 'alter index public.idx_tarifas_rate_tables_code rename to tarifas_rate_tables_code_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_rate_tables_country_id', 'iI'), 'alter index public.idx_tarifas_rate_tables_country_id rename to tarifas_rate_tables_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_rate_tables_party_id', 'iI'), 'alter index public.idx_tarifas_rate_tables_party_id rename to tarifas_rate_tables_party_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_rate_table_rows_table_id', 'iI'), 'alter index public.idx_tarifas_rate_table_rows_table_id rename to tarifas_rate_table_rows_table_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_margin_policies_country_id', 'iI'), 'alter index public.idx_tarifas_margin_policies_country_id rename to tarifas_margin_policies_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_audit_log_created_at', 'iI'), 'alter index public.idx_tarifas_audit_log_created_at rename to tarifas_audit_log_created_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_audit_log_entity_id', 'iI'), 'alter index public.idx_tarifas_audit_log_entity_id rename to tarifas_audit_log_entity_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_audit_log_entity', 'iI'), 'alter index public.idx_tarifas_audit_log_entity rename to tarifas_audit_log_entity_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_trip_order_marks_country_id', 'iI'), 'alter index public.idx_tarifas_trip_order_marks_country_id rename to tarifas_trip_order_marks_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_trip_order_marks_trip_id', 'iI'), 'alter index public.idx_tarifas_trip_order_marks_trip_id rename to tarifas_trip_order_marks_trip_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_trip_order_marks_uq', 'iI'), 'alter index public.uidx_tarifas_trip_order_marks_uq rename to tarifas_trip_order_marks_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_positions_route_time', 'iI'), 'alter index public.idx_tracking_positions_route_time rename to ix_tracking_positions_route_time');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_positions_time', 'iI'), 'alter index public.idx_tracking_positions_time rename to ix_tracking_positions_time');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tracking_positions_client', 'iI'), 'alter index public.uidx_tracking_positions_client rename to ux_tracking_positions_client');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_last_positions_org', 'iI'), 'alter index public.idx_tracking_last_positions_org rename to ix_tracking_last_positions_org');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_evidences_guide', 'iI'), 'alter index public.idx_tracking_evidences_guide rename to ix_tracking_evidences_guide');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_evidences_route', 'iI'), 'alter index public.idx_tracking_evidences_route rename to ix_tracking_evidences_route');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tracking_evidences_client', 'iI'), 'alter index public.uidx_tracking_evidences_client rename to ux_tracking_evidences_client');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tracking_evidences_key', 'iI'), 'alter index public.uidx_tracking_evidences_key rename to ux_tracking_evidences_key');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_reviews_org', 'iI'), 'alter index public.idx_tracking_reviews_org rename to ix_tracking_reviews_org');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_wms_expediciones_detalle_wms_exp_detalle_articulo', 'iI'), 'alter index public.idx_wms_expediciones_detalle_wms_exp_detalle_articulo rename to wms_exp_detalle_articulo_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_wms_expediciones_detalle_wms_exp_detalle_expedicion', 'iI'), 'alter index public.idx_wms_expediciones_detalle_wms_exp_detalle_expedicion rename to wms_exp_detalle_expedicion_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_wms_expediciones_detalle_wms_exp_detalle_natural', 'iI'), 'alter index public.uidx_wms_expediciones_detalle_wms_exp_detalle_natural rename to wms_exp_detalle_natural_key');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_wms_expediciones_detalle_wms_exp_detalle_prioridad', 'iI'), 'alter index public.idx_wms_expediciones_detalle_wms_exp_detalle_prioridad rename to wms_exp_detalle_prioridad_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tracking_consents_org', 'iI'), 'alter index public.idx_tracking_consents_org rename to ix_tracking_consents_org');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_mobile_refresh_tokens_mobile_refresh_expires', 'iI'), 'alter index public.idx_mobile_refresh_tokens_mobile_refresh_expires rename to ix_mobile_refresh_expires');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_mobile_refresh_tokens_mobile_refresh_user', 'iI'), 'alter index public.idx_mobile_refresh_tokens_mobile_refresh_user rename to ix_mobile_refresh_user');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proformas_carrier_id', 'iI'), 'alter index public.idx_tarifas_proformas_carrier_id rename to tarifas_proformas_carrier_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proformas_country_id', 'iI'), 'alter index public.idx_tarifas_proformas_country_id rename to tarifas_proformas_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_proformas_country_number_uq', 'iI'), 'alter index public.uidx_tarifas_proformas_country_number_uq rename to tarifas_proformas_country_number_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proformas_status', 'iI'), 'alter index public.idx_tarifas_proformas_status rename to tarifas_proformas_status_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_items_proforma_id', 'iI'), 'alter index public.idx_tarifas_proforma_items_proforma_id rename to tarifas_proforma_items_proforma_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_items_settlement_id', 'iI'), 'alter index public.idx_tarifas_proforma_items_settlement_id rename to tarifas_proforma_items_settlement_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_proforma_items_settlement_incluida_uq', 'iI'), 'alter index public.uidx_tarifas_proforma_items_settlement_incluida_uq rename to tarifas_proforma_items_settlement_incluida_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_phases_proforma_id', 'iI'), 'alter index public.idx_tarifas_proforma_phases_proforma_id rename to tarifas_proforma_phases_proforma_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_phases_state', 'iI'), 'alter index public.idx_tarifas_proforma_phases_state rename to tarifas_proforma_phases_state_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_flow_phases_country_id', 'iI'), 'alter index public.idx_tarifas_proforma_flow_phases_country_id rename to tarifas_proforma_flow_phases_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_proforma_email_config_country_uq', 'iI'), 'alter index public.uidx_tarifas_proforma_email_config_country_uq rename to tarifas_proforma_email_config_country_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_trip_tender_awards_carrier_id', 'iI'), 'alter index public.idx_tarifas_trip_tender_awards_carrier_id rename to tarifas_trip_tender_awards_carrier_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_trip_tender_awards_country_id', 'iI'), 'alter index public.idx_tarifas_trip_tender_awards_country_id rename to tarifas_trip_tender_awards_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_trip_tender_awards_trip_id', 'iI'), 'alter index public.idx_tarifas_trip_tender_awards_trip_id rename to tarifas_trip_tender_awards_trip_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.uidx_tarifas_trip_tender_awards_uq', 'iI'), 'alter index public.uidx_tarifas_trip_tender_awards_uq rename to tarifas_trip_tender_awards_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_driver_presence_org', 'iI'), 'alter index public.idx_driver_presence_org rename to ix_driver_presence_org');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_claims_country_id', 'iI'), 'alter index public.idx_tarifas_proforma_claims_country_id rename to tarifas_proforma_claims_country_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_claims_created_at', 'iI'), 'alter index public.idx_tarifas_proforma_claims_created_at rename to tarifas_proforma_claims_created_at_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_claims_proforma_id', 'iI'), 'alter index public.idx_tarifas_proforma_claims_proforma_id rename to tarifas_proforma_claims_proforma_id_idx');
select pg_temp.exec_if(pg_temp.rel_is('public.idx_tarifas_proforma_claims_status', 'iI'), 'alter index public.idx_tarifas_proforma_claims_status rename to tarifas_proforma_claims_status_idx');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'fk_app_users_organization_id'), 'alter table public.tbl_app_users rename constraint fk_app_users_organization_id to app_users_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'fk_app_users_role_id'), 'alter table public.tbl_app_users rename constraint fk_app_users_role_id to app_users_role_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'pk_app_users'), 'alter table public.tbl_app_users rename constraint pk_app_users to app_users_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'uq_app_users_email'), 'alter table public.tbl_app_users rename constraint uq_app_users_email to app_users_email_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'ck_carriers_flat_rate_amount'), 'alter table public.tbl_carriers rename constraint ck_carriers_flat_rate_amount to carriers_flat_rate_amount_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'ck_carriers_rate_type'), 'alter table public.tbl_carriers rename constraint ck_carriers_rate_type to carriers_rate_type_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'fk_carriers_country_id'), 'alter table public.tbl_carriers rename constraint fk_carriers_country_id to carriers_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'fk_carriers_organization_id'), 'alter table public.tbl_carriers rename constraint fk_carriers_organization_id to carriers_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'pk_carriers'), 'alter table public.tbl_carriers rename constraint pk_carriers to carriers_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'uq_carriers_organization_id_code'), 'alter table public.tbl_carriers rename constraint uq_carriers_organization_id_code to carriers_organization_id_code_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contract_documents', 'fk_contract_documents_contract_id'), 'alter table public.tbl_contract_documents rename constraint fk_contract_documents_contract_id to contract_documents_contract_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contract_documents', 'fk_contract_documents_organization_id'), 'alter table public.tbl_contract_documents rename constraint fk_contract_documents_organization_id to contract_documents_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contract_documents', 'pk_contract_documents'), 'alter table public.tbl_contract_documents rename constraint pk_contract_documents to contract_documents_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contracts', 'fk_contracts_organization_id'), 'alter table public.tbl_contracts rename constraint fk_contracts_organization_id to contracts_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contracts', 'pk_contracts'), 'alter table public.tbl_contracts rename constraint pk_contracts to contracts_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_fijos', 'ck_costos_fijos_monto'), 'alter table public.tbl_costos_fijos rename constraint ck_costos_fijos_monto to costos_fijos_monto_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_fijos', 'pk_costos_fijos'), 'alter table public.tbl_costos_fijos rename constraint pk_costos_fijos to costos_fijos_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_fijos', 'uq_costos_fijos_categoria_concepto'), 'alter table public.tbl_costos_fijos rename constraint uq_costos_fijos_categoria_concepto to costos_fijos_categoria_concepto_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'ck_costos_variables_costo_t1'), 'alter table public.tbl_costos_variables rename constraint ck_costos_variables_costo_t1 to costos_variables_costo_t1_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'ck_costos_variables_costo_t3'), 'alter table public.tbl_costos_variables rename constraint ck_costos_variables_costo_t3 to costos_variables_costo_t3_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'ck_costos_variables_costo_t5'), 'alter table public.tbl_costos_variables rename constraint ck_costos_variables_costo_t5 to costos_variables_costo_t5_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'ck_costos_variables_freq_t1'), 'alter table public.tbl_costos_variables rename constraint ck_costos_variables_freq_t1 to costos_variables_freq_t1_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'ck_costos_variables_freq_t3'), 'alter table public.tbl_costos_variables rename constraint ck_costos_variables_freq_t3 to costos_variables_freq_t3_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'ck_costos_variables_freq_t5'), 'alter table public.tbl_costos_variables rename constraint ck_costos_variables_freq_t5 to costos_variables_freq_t5_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'pk_costos_variables'), 'alter table public.tbl_costos_variables rename constraint pk_costos_variables to costos_variables_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'uq_costos_variables_componente'), 'alter table public.tbl_costos_variables rename constraint uq_costos_variables_componente to costos_variables_componente_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_countries', 'fk_countries_organization_id'), 'alter table public.tbl_countries rename constraint fk_countries_organization_id to countries_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_countries', 'pk_countries'), 'alter table public.tbl_countries rename constraint pk_countries to countries_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_countries', 'uq_countries_organization_id_code'), 'alter table public.tbl_countries rename constraint uq_countries_organization_id_code to countries_organization_id_code_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'ck_depreciacion_valor_vehiculo'), 'alter table public.tbl_depreciacion rename constraint ck_depreciacion_valor_vehiculo to depreciacion_valor_vehiculo_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'ck_depreciacion_vida_meses'), 'alter table public.tbl_depreciacion rename constraint ck_depreciacion_vida_meses to depreciacion_vida_meses_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'fk_depreciacion_codigo_camion'), 'alter table public.tbl_depreciacion rename constraint fk_depreciacion_codigo_camion to depreciacion_codigo_camion_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'pk_depreciacion'), 'alter table public.tbl_depreciacion rename constraint pk_depreciacion to depreciacion_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'fk_dispatch_guides_order_id'), 'alter table public.tbl_dispatch_guides rename constraint fk_dispatch_guides_order_id to dispatch_guides_order_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'fk_dispatch_guides_organization_id'), 'alter table public.tbl_dispatch_guides rename constraint fk_dispatch_guides_organization_id to dispatch_guides_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'fk_dispatch_guides_route_id'), 'alter table public.tbl_dispatch_guides rename constraint fk_dispatch_guides_route_id to dispatch_guides_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'pk_dispatch_guides'), 'alter table public.tbl_dispatch_guides rename constraint pk_dispatch_guides to dispatch_guides_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'uq_dispatch_guides_organization_id_guide_number'), 'alter table public.tbl_dispatch_guides rename constraint uq_dispatch_guides_organization_id_guide_number to dispatch_guides_organization_id_guide_number_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'fk_drivers_app_user_id'), 'alter table public.tbl_drivers rename constraint fk_drivers_app_user_id to drivers_app_user_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'fk_drivers_carrier_id'), 'alter table public.tbl_drivers rename constraint fk_drivers_carrier_id to drivers_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'fk_drivers_license_type_id'), 'alter table public.tbl_drivers rename constraint fk_drivers_license_type_id to drivers_license_type_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'fk_drivers_organization_id'), 'alter table public.tbl_drivers rename constraint fk_drivers_organization_id to drivers_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'pk_drivers'), 'alter table public.tbl_drivers rename constraint pk_drivers to drivers_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'uq_drivers_organization_id_code'), 'alter table public.tbl_drivers rename constraint uq_drivers_organization_id_code to drivers_organization_id_code_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_organizations', 'pk_organizations'), 'alter table public.tbl_organizations rename constraint pk_organizations to organizations_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_organizations', 'uq_organizations_slug'), 'alter table public.tbl_organizations rename constraint uq_organizations_slug to organizations_slug_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_parametros_globales', 'pk_parametros_globales'), 'alter table public.tbl_parametros_globales rename constraint pk_parametros_globales to parametros_globales_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'fk_rates_carrier_id'), 'alter table public.tbl_rates rename constraint fk_rates_carrier_id to rates_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'fk_rates_country_id'), 'alter table public.tbl_rates rename constraint fk_rates_country_id to rates_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'fk_rates_organization_id'), 'alter table public.tbl_rates rename constraint fk_rates_organization_id to rates_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'fk_rates_tariff_type_id'), 'alter table public.tbl_rates rename constraint fk_rates_tariff_type_id to rates_tariff_type_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'pk_rates'), 'alter table public.tbl_rates rename constraint pk_rates to rates_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'fk_returns_dispatch_guide_id'), 'alter table public.tbl_returns rename constraint fk_returns_dispatch_guide_id to returns_dispatch_guide_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'fk_returns_order_id'), 'alter table public.tbl_returns rename constraint fk_returns_order_id to returns_order_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'fk_returns_organization_id'), 'alter table public.tbl_returns rename constraint fk_returns_organization_id to returns_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'pk_returns'), 'alter table public.tbl_returns rename constraint pk_returns to returns_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'uq_returns_organization_id_return_number'), 'alter table public.tbl_returns rename constraint uq_returns_organization_id_return_number to returns_organization_id_return_number_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_roles', 'pk_roles'), 'alter table public.tbl_roles rename constraint pk_roles to roles_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_roles', 'uq_roles_name'), 'alter table public.tbl_roles rename constraint uq_roles_name to roles_name_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'ck_zones_geofence_geojson'), 'alter table public.tbl_zones rename constraint ck_zones_geofence_geojson to zones_geofence_geojson_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'ck_zones_status'), 'alter table public.tbl_zones rename constraint ck_zones_status to zones_status_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'fk_zones_country_id'), 'alter table public.tbl_zones rename constraint fk_zones_country_id to zones_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'fk_zones_organization_id'), 'alter table public.tbl_zones rename constraint fk_zones_organization_id to zones_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'pk_zones'), 'alter table public.tbl_zones rename constraint pk_zones to zones_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_carrier_id'), 'alter table public.tbl_routes rename constraint fk_routes_carrier_id to routes_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_driver_id'), 'alter table public.tbl_routes rename constraint fk_routes_driver_id to routes_driver_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_organization_id'), 'alter table public.tbl_routes rename constraint fk_routes_organization_id to routes_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_plan_trip_id'), 'alter table public.tbl_routes rename constraint fk_routes_plan_trip_id to routes_plan_trip_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_route_type_id'), 'alter table public.tbl_routes rename constraint fk_routes_route_type_id to routes_route_type_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_store_id'), 'alter table public.tbl_routes rename constraint fk_routes_store_id to routes_store_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'fk_routes_vehicle_id'), 'alter table public.tbl_routes rename constraint fk_routes_vehicle_id to routes_vehicle_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'pk_routes'), 'alter table public.tbl_routes rename constraint pk_routes to routes_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'uq_routes_organization_id_route_number'), 'alter table public.tbl_routes rename constraint uq_routes_organization_id_route_number to routes_organization_id_route_number_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'ck_rutas_costeo_dias'), 'alter table public.tbl_rutas_costeo rename constraint ck_rutas_costeo_dias to rutas_costeo_dias_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'ck_rutas_costeo_horas'), 'alter table public.tbl_rutas_costeo rename constraint ck_rutas_costeo_horas to rutas_costeo_horas_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'ck_rutas_costeo_kilometros'), 'alter table public.tbl_rutas_costeo rename constraint ck_rutas_costeo_kilometros to rutas_costeo_kilometros_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'fk_rutas_costeo_codigo_camion'), 'alter table public.tbl_rutas_costeo rename constraint fk_rutas_costeo_codigo_camion to rutas_costeo_codigo_camion_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'pk_rutas_costeo'), 'alter table public.tbl_rutas_costeo rename constraint pk_rutas_costeo to rutas_costeo_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'fk_settlements_carrier_id'), 'alter table public.tbl_settlements rename constraint fk_settlements_carrier_id to settlements_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'fk_settlements_driver_id'), 'alter table public.tbl_settlements rename constraint fk_settlements_driver_id to settlements_driver_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'fk_settlements_organization_id'), 'alter table public.tbl_settlements rename constraint fk_settlements_organization_id to settlements_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'fk_settlements_route_id'), 'alter table public.tbl_settlements rename constraint fk_settlements_route_id to settlements_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'pk_settlements'), 'alter table public.tbl_settlements rename constraint pk_settlements to settlements_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'uq_settlements_organization_id_settlement_number'), 'alter table public.tbl_settlements rename constraint uq_settlements_organization_id_settlement_number to settlements_organization_id_settlement_number_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'ck_sku_cotizaciones_cantidad'), 'alter table public.tbl_sku_cotizaciones rename constraint ck_sku_cotizaciones_cantidad to sku_cotizaciones_cantidad_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'ck_sku_cotizaciones_peso_kg'), 'alter table public.tbl_sku_cotizaciones rename constraint ck_sku_cotizaciones_peso_kg to sku_cotizaciones_peso_kg_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'ck_sku_cotizaciones_volumen_m3'), 'alter table public.tbl_sku_cotizaciones rename constraint ck_sku_cotizaciones_volumen_m3 to sku_cotizaciones_volumen_m3_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'fk_sku_cotizaciones_ruta_id'), 'alter table public.tbl_sku_cotizaciones rename constraint fk_sku_cotizaciones_ruta_id to sku_cotizaciones_ruta_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'pk_sku_cotizaciones'), 'alter table public.tbl_sku_cotizaciones rename constraint pk_sku_cotizaciones to sku_cotizaciones_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'fk_stores_country_id'), 'alter table public.tbl_stores rename constraint fk_stores_country_id to stores_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'fk_stores_organization_id'), 'alter table public.tbl_stores rename constraint fk_stores_organization_id to stores_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'fk_stores_warehouse_id'), 'alter table public.tbl_stores rename constraint fk_stores_warehouse_id to stores_warehouse_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'pk_stores'), 'alter table public.tbl_stores rename constraint pk_stores to stores_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'uq_stores_organization_id_code'), 'alter table public.tbl_stores rename constraint uq_stores_organization_id_code to stores_organization_id_code_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'ck_tipos_camion_capacidad_kg'), 'alter table public.tbl_tipos_camion rename constraint ck_tipos_camion_capacidad_kg to tipos_camion_capacidad_kg_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'ck_tipos_camion_capacidad_m3'), 'alter table public.tbl_tipos_camion rename constraint ck_tipos_camion_capacidad_m3 to tipos_camion_capacidad_m3_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'ck_tipos_camion_km_por_litro'), 'alter table public.tbl_tipos_camion rename constraint ck_tipos_camion_km_por_litro to tipos_camion_km_por_litro_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'pk_tipos_camion'), 'alter table public.tbl_tipos_camion rename constraint pk_tipos_camion to tipos_camion_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'ck_tracking_events_distance_m'), 'alter table public.tbl_tracking_events rename constraint ck_tracking_events_distance_m to tracking_events_distance_m_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'fk_tracking_events_dispatch_guide_id'), 'alter table public.tbl_tracking_events rename constraint fk_tracking_events_dispatch_guide_id to tracking_events_dispatch_guide_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'fk_tracking_events_organization_id'), 'alter table public.tbl_tracking_events rename constraint fk_tracking_events_organization_id to tracking_events_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'fk_tracking_events_route_id'), 'alter table public.tbl_tracking_events rename constraint fk_tracking_events_route_id to tracking_events_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'pk_tracking_events'), 'alter table public.tbl_tracking_events rename constraint pk_tracking_events to tracking_events_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicle_types', 'ck_vehicle_types_status'), 'alter table public.tbl_vehicle_types rename constraint ck_vehicle_types_status to vehicle_types_status_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicle_types', 'fk_vehicle_types_organization_id'), 'alter table public.tbl_vehicle_types rename constraint fk_vehicle_types_organization_id to vehicle_types_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicle_types', 'pk_vehicle_types'), 'alter table public.tbl_vehicle_types rename constraint pk_vehicle_types to vehicle_types_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'ck_vehicles_container_dimensions'), 'alter table public.tbl_vehicles rename constraint ck_vehicles_container_dimensions to vehicles_container_dimensions_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'ck_vehicles_container_unit'), 'alter table public.tbl_vehicles rename constraint ck_vehicles_container_unit to vehicles_container_unit_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'fk_vehicles_carrier_id'), 'alter table public.tbl_vehicles rename constraint fk_vehicles_carrier_id to vehicles_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'fk_vehicles_organization_id'), 'alter table public.tbl_vehicles rename constraint fk_vehicles_organization_id to vehicles_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'pk_vehicles'), 'alter table public.tbl_vehicles rename constraint pk_vehicles to vehicles_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'uq_vehicles_organization_id_plate'), 'alter table public.tbl_vehicles rename constraint uq_vehicles_organization_id_plate to vehicles_organization_id_plate_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_auth_credentials', 'pk_auth_credentials'), 'alter table public.tbl_auth_credentials rename constraint pk_auth_credentials to auth_credentials_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_auth_credentials', 'uq_auth_credentials_email'), 'alter table public.tbl_auth_credentials rename constraint uq_auth_credentials_email to auth_credentials_email_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_license_types', 'fk_driver_license_types_country_id'), 'alter table public.tbl_driver_license_types rename constraint fk_driver_license_types_country_id to driver_license_types_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_license_types', 'pk_driver_license_types'), 'alter table public.tbl_driver_license_types rename constraint pk_driver_license_types to license_types_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tariff_types', 'pk_tariff_types'), 'alter table public.tbl_tariff_types rename constraint pk_tariff_types to tariff_types_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tariff_types', 'uq_tariff_types_code'), 'alter table public.tbl_tariff_types rename constraint uq_tariff_types_code to tariff_types_code_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_addresses', 'fk_addresses_country_id'), 'alter table public.tbl_addresses rename constraint fk_addresses_country_id to addresses_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_addresses', 'pk_addresses'), 'alter table public.tbl_addresses rename constraint pk_addresses to addresses_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'ck_delivery_points_zone_source'), 'alter table public.tbl_delivery_points rename constraint ck_delivery_points_zone_source to delivery_points_zone_source_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'fk_delivery_points_address_id'), 'alter table public.tbl_delivery_points rename constraint fk_delivery_points_address_id to delivery_points_address_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'fk_delivery_points_final_customer_id'), 'alter table public.tbl_delivery_points rename constraint fk_delivery_points_final_customer_id to delivery_points_final_customer_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'fk_delivery_points_zone_id'), 'alter table public.tbl_delivery_points rename constraint fk_delivery_points_zone_id to delivery_points_zone_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'pk_delivery_points'), 'alter table public.tbl_delivery_points rename constraint pk_delivery_points to delivery_points_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'ck_contacts_exactly_one_parent'), 'alter table public.tbl_contacts rename constraint ck_contacts_exactly_one_parent to contacts_exactly_one_parent');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'fk_contacts_delivery_point_id'), 'alter table public.tbl_contacts rename constraint fk_contacts_delivery_point_id to contacts_delivery_point_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'fk_contacts_final_customer_id'), 'alter table public.tbl_contacts rename constraint fk_contacts_final_customer_id to contacts_final_customer_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'pk_contacts'), 'alter table public.tbl_contacts rename constraint pk_contacts to contacts_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'fk_driver_licenses_driver_id'), 'alter table public.tbl_driver_licenses rename constraint fk_driver_licenses_driver_id to driver_licenses_driver_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'fk_driver_licenses_driver_license_type_id'), 'alter table public.tbl_driver_licenses rename constraint fk_driver_licenses_driver_license_type_id to driver_licenses_driver_license_type_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'pk_driver_licenses'), 'alter table public.tbl_driver_licenses rename constraint pk_driver_licenses to driver_licenses_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'uq_driver_licenses_driver_id_driver_license_type_id'), 'alter table public.tbl_driver_licenses rename constraint uq_driver_licenses_driver_id_driver_license_type_id to driver_licenses_driver_id_driver_license_type_id_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'fk_user_scopes_app_user_id'), 'alter table public.tbl_user_scopes rename constraint fk_user_scopes_app_user_id to user_scopes_app_user_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'fk_user_scopes_country_id'), 'alter table public.tbl_user_scopes rename constraint fk_user_scopes_country_id to user_scopes_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'fk_user_scopes_customer_id'), 'alter table public.tbl_user_scopes rename constraint fk_user_scopes_customer_id to user_scopes_customer_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'fk_user_scopes_role_id'), 'alter table public.tbl_user_scopes rename constraint fk_user_scopes_role_id to user_scopes_role_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'fk_user_scopes_warehouse_id'), 'alter table public.tbl_user_scopes rename constraint fk_user_scopes_warehouse_id to user_scopes_warehouse_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'pk_user_scopes'), 'alter table public.tbl_user_scopes rename constraint pk_user_scopes to user_scopes_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'fk_wms_expediciones_final_customer_id'), 'alter table public.tbl_wms_expediciones rename constraint fk_wms_expediciones_final_customer_id to wms_expediciones_final_customer_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'fk_wms_expediciones_organization_id'), 'alter table public.tbl_wms_expediciones rename constraint fk_wms_expediciones_organization_id to wms_expediciones_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'fk_wms_expediciones_warehouse_id'), 'alter table public.tbl_wms_expediciones rename constraint fk_wms_expediciones_warehouse_id to wms_expediciones_warehouse_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'pk_wms_expediciones'), 'alter table public.tbl_wms_expediciones rename constraint pk_wms_expediciones to wms_expediciones_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_modules', 'pk_app_modules'), 'alter table public.tbl_app_modules rename constraint pk_app_modules to app_modules_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'ck_role_permissions_action'), 'alter table public.tbl_role_permissions rename constraint ck_role_permissions_action to role_permissions_action_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'fk_role_permissions_module_key'), 'alter table public.tbl_role_permissions rename constraint fk_role_permissions_module_key to role_permissions_module_key_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'fk_role_permissions_role_id'), 'alter table public.tbl_role_permissions rename constraint fk_role_permissions_role_id to role_permissions_role_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'pk_role_permissions'), 'alter table public.tbl_role_permissions rename constraint pk_role_permissions to role_permissions_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_countries', 'fk_role_countries_country_id'), 'alter table public.tbl_role_countries rename constraint fk_role_countries_country_id to role_countries_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_countries', 'fk_role_countries_role_id'), 'alter table public.tbl_role_countries rename constraint fk_role_countries_role_id to role_countries_role_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_countries', 'pk_role_countries'), 'alter table public.tbl_role_countries rename constraint pk_role_countries to role_countries_pkey');
select pg_temp.exec_if(pg_temp.con_on('audit.tbl_tracked_tables', 'pk_tracked_tables'), 'alter table audit.tbl_tracked_tables rename constraint pk_tracked_tables to tracked_tables_pkey');
select pg_temp.exec_if(pg_temp.con_on('audit.tbl_events', 'ck_events_actor_type'), 'alter table audit.tbl_events rename constraint ck_events_actor_type to events_actor_type_check1');
select pg_temp.exec_if(pg_temp.con_on('audit.tbl_events', 'pk_events'), 'alter table audit.tbl_events rename constraint pk_events to events_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_default', 'iI'), 'alter index audit.pk_events_default rename to events_default_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2026_09', 'iI'), 'alter index audit.pk_events_2026_09 rename to events_2026_09_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2026_10', 'iI'), 'alter index audit.pk_events_2026_10 rename to events_2026_10_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2026_11', 'iI'), 'alter index audit.pk_events_2026_11 rename to events_2026_11_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2026_12', 'iI'), 'alter index audit.pk_events_2026_12 rename to events_2026_12_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_01', 'iI'), 'alter index audit.pk_events_2027_01 rename to events_2027_01_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_02', 'iI'), 'alter index audit.pk_events_2027_02 rename to events_2027_02_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_03', 'iI'), 'alter index audit.pk_events_2027_03 rename to events_2027_03_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_04', 'iI'), 'alter index audit.pk_events_2027_04 rename to events_2027_04_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_05', 'iI'), 'alter index audit.pk_events_2027_05 rename to events_2027_05_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_06', 'iI'), 'alter index audit.pk_events_2027_06 rename to events_2027_06_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_07', 'iI'), 'alter index audit.pk_events_2027_07 rename to events_2027_07_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_08', 'iI'), 'alter index audit.pk_events_2027_08 rename to events_2027_08_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_09', 'iI'), 'alter index audit.pk_events_2027_09 rename to events_2027_09_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_10', 'iI'), 'alter index audit.pk_events_2027_10 rename to events_2027_10_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_11', 'iI'), 'alter index audit.pk_events_2027_11 rename to events_2027_11_pkey');
select pg_temp.exec_if(pg_temp.rel_is('audit.pk_events_2027_12', 'iI'), 'alter index audit.pk_events_2027_12 rename to events_2027_12_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'ck_route_plans_status'), 'alter table public.tbl_route_plans rename constraint ck_route_plans_status to route_plans_status_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'fk_route_plans_country_id'), 'alter table public.tbl_route_plans rename constraint fk_route_plans_country_id to route_plans_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'fk_route_plans_created_by'), 'alter table public.tbl_route_plans rename constraint fk_route_plans_created_by to route_plans_created_by_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'fk_route_plans_customer_id'), 'alter table public.tbl_route_plans rename constraint fk_route_plans_customer_id to route_plans_customer_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'fk_route_plans_organization_id'), 'alter table public.tbl_route_plans rename constraint fk_route_plans_organization_id to route_plans_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'fk_route_plans_warehouse_id'), 'alter table public.tbl_route_plans rename constraint fk_route_plans_warehouse_id to route_plans_warehouse_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'pk_route_plans'), 'alter table public.tbl_route_plans rename constraint pk_route_plans to route_plans_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'ck_plan_trips_status'), 'alter table public.tbl_plan_trips rename constraint ck_plan_trips_status to plan_trips_status_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'fk_plan_trips_driver_id'), 'alter table public.tbl_plan_trips rename constraint fk_plan_trips_driver_id to plan_trips_driver_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'fk_plan_trips_plan_id'), 'alter table public.tbl_plan_trips rename constraint fk_plan_trips_plan_id to plan_trips_plan_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'fk_plan_trips_vehicle_id'), 'alter table public.tbl_plan_trips rename constraint fk_plan_trips_vehicle_id to plan_trips_vehicle_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'pk_plan_trips'), 'alter table public.tbl_plan_trips rename constraint pk_plan_trips to plan_trips_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_stops', 'fk_plan_stops_order_id'), 'alter table public.tbl_plan_stops rename constraint fk_plan_stops_order_id to plan_stops_order_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_stops', 'fk_plan_stops_trip_id'), 'alter table public.tbl_plan_stops rename constraint fk_plan_stops_trip_id to plan_stops_trip_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_stops', 'pk_plan_stops'), 'alter table public.tbl_plan_stops rename constraint pk_plan_stops to plan_stops_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_country_settings', 'fk_tarifas_country_settings_country_id'), 'alter table public.tbl_tarifas_country_settings rename constraint fk_tarifas_country_settings_country_id to tarifas_country_settings_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_country_settings', 'pk_tarifas_country_settings'), 'alter table public.tbl_tarifas_country_settings rename constraint pk_tarifas_country_settings to tarifas_country_settings_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_country_settings', 'uq_tarifas_country_settings_country_id'), 'alter table public.tbl_tarifas_country_settings rename constraint uq_tarifas_country_settings_country_id to tarifas_country_settings_country_id_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_zone_groups', 'fk_tarifas_zone_groups_country_id'), 'alter table public.tbl_tarifas_zone_groups rename constraint fk_tarifas_zone_groups_country_id to tarifas_zone_groups_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_zone_groups', 'pk_tarifas_zone_groups'), 'alter table public.tbl_tarifas_zone_groups rename constraint pk_tarifas_zone_groups to tarifas_zone_groups_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlement_parties', 'fk_tarifas_settlement_parties_carrier_id'), 'alter table public.tbl_tarifas_settlement_parties rename constraint fk_tarifas_settlement_parties_carrier_id to tarifas_settlement_parties_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlement_parties', 'pk_tarifas_settlement_parties'), 'alter table public.tbl_tarifas_settlement_parties rename constraint pk_tarifas_settlement_parties to tarifas_settlement_parties_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlement_parties', 'uq_tarifas_settlement_parties_carrier_id'), 'alter table public.tbl_tarifas_settlement_parties rename constraint uq_tarifas_settlement_parties_carrier_id to tarifas_settlement_parties_carrier_id_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'ck_tarifas_pricing_rules_applies_to_base'), 'alter table public.tbl_tarifas_pricing_rules rename constraint ck_tarifas_pricing_rules_applies_to_base to tarifas_pricing_rules_applies_to_base_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'ck_tarifas_pricing_rules_base_method'), 'alter table public.tbl_tarifas_pricing_rules rename constraint ck_tarifas_pricing_rules_base_method to tarifas_pricing_rules_base_method_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'ck_tarifas_pricing_rules_category'), 'alter table public.tbl_tarifas_pricing_rules rename constraint ck_tarifas_pricing_rules_category to tarifas_pricing_rules_category_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'ck_tarifas_pricing_rules_exclusive_only_base'), 'alter table public.tbl_tarifas_pricing_rules rename constraint ck_tarifas_pricing_rules_exclusive_only_base to tarifas_pricing_rules_exclusive_only_base_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'fk_tarifas_pricing_rules_country_id'), 'alter table public.tbl_tarifas_pricing_rules rename constraint fk_tarifas_pricing_rules_country_id to tarifas_pricing_rules_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'fk_tarifas_pricing_rules_party_id'), 'alter table public.tbl_tarifas_pricing_rules rename constraint fk_tarifas_pricing_rules_party_id to tarifas_pricing_rules_party_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'pk_tarifas_pricing_rules'), 'alter table public.tbl_tarifas_pricing_rules rename constraint pk_tarifas_pricing_rules to tarifas_pricing_rules_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_templates', 'fk_tarifas_pricing_templates_country_id'), 'alter table public.tbl_tarifas_pricing_templates rename constraint fk_tarifas_pricing_templates_country_id to tarifas_pricing_templates_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_templates', 'pk_tarifas_pricing_templates'), 'alter table public.tbl_tarifas_pricing_templates rename constraint pk_tarifas_pricing_templates to tarifas_pricing_templates_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_party_variables', 'fk_tarifas_party_variables_party_id'), 'alter table public.tbl_tarifas_party_variables rename constraint fk_tarifas_party_variables_party_id to tarifas_party_variables_party_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_party_variables', 'pk_tarifas_party_variables'), 'alter table public.tbl_tarifas_party_variables rename constraint pk_tarifas_party_variables to tarifas_party_variables_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'fk_tarifas_settlements_country_id'), 'alter table public.tbl_tarifas_settlements rename constraint fk_tarifas_settlements_country_id to tarifas_settlements_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'fk_tarifas_settlements_party_id'), 'alter table public.tbl_tarifas_settlements rename constraint fk_tarifas_settlements_party_id to tarifas_settlements_party_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'fk_tarifas_settlements_trip_id'), 'alter table public.tbl_tarifas_settlements rename constraint fk_tarifas_settlements_trip_id to tarifas_settlements_trip_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'pk_tarifas_settlements'), 'alter table public.tbl_tarifas_settlements rename constraint pk_tarifas_settlements to tarifas_settlements_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structures', 'fk_tarifas_cost_structures_country_id'), 'alter table public.tbl_tarifas_cost_structures rename constraint fk_tarifas_cost_structures_country_id to tarifas_cost_structures_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structures', 'fk_tarifas_cost_structures_party_id'), 'alter table public.tbl_tarifas_cost_structures rename constraint fk_tarifas_cost_structures_party_id to tarifas_cost_structures_party_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structures', 'pk_tarifas_cost_structures'), 'alter table public.tbl_tarifas_cost_structures rename constraint pk_tarifas_cost_structures to tarifas_cost_structures_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structure_rows', 'fk_tarifas_cost_structure_rows_structure_id'), 'alter table public.tbl_tarifas_cost_structure_rows rename constraint fk_tarifas_cost_structure_rows_structure_id to tarifas_cost_structure_rows_structure_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structure_rows', 'pk_tarifas_cost_structure_rows'), 'alter table public.tbl_tarifas_cost_structure_rows rename constraint pk_tarifas_cost_structure_rows to tarifas_cost_structure_rows_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_tables', 'fk_tarifas_rate_tables_country_id'), 'alter table public.tbl_tarifas_rate_tables rename constraint fk_tarifas_rate_tables_country_id to tarifas_rate_tables_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_tables', 'fk_tarifas_rate_tables_party_id'), 'alter table public.tbl_tarifas_rate_tables rename constraint fk_tarifas_rate_tables_party_id to tarifas_rate_tables_party_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_tables', 'pk_tarifas_rate_tables'), 'alter table public.tbl_tarifas_rate_tables rename constraint pk_tarifas_rate_tables to tarifas_rate_tables_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_table_rows', 'fk_tarifas_rate_table_rows_table_id'), 'alter table public.tbl_tarifas_rate_table_rows rename constraint fk_tarifas_rate_table_rows_table_id to tarifas_rate_table_rows_table_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_table_rows', 'pk_tarifas_rate_table_rows'), 'alter table public.tbl_tarifas_rate_table_rows rename constraint pk_tarifas_rate_table_rows to tarifas_rate_table_rows_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_margin_policies', 'fk_tarifas_margin_policies_country_id'), 'alter table public.tbl_tarifas_margin_policies rename constraint fk_tarifas_margin_policies_country_id to tarifas_margin_policies_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_margin_policies', 'pk_tarifas_margin_policies'), 'alter table public.tbl_tarifas_margin_policies rename constraint pk_tarifas_margin_policies to tarifas_margin_policies_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_audit_log', 'pk_tarifas_audit_log'), 'alter table public.tbl_tarifas_audit_log rename constraint pk_tarifas_audit_log to tarifas_audit_log_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_order_marks', 'fk_tarifas_trip_order_marks_country_id'), 'alter table public.tbl_tarifas_trip_order_marks rename constraint fk_tarifas_trip_order_marks_country_id to tarifas_trip_order_marks_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_order_marks', 'fk_tarifas_trip_order_marks_trip_id'), 'alter table public.tbl_tarifas_trip_order_marks rename constraint fk_tarifas_trip_order_marks_trip_id to tarifas_trip_order_marks_trip_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_order_marks', 'pk_tarifas_trip_order_marks'), 'alter table public.tbl_tarifas_trip_order_marks rename constraint pk_tarifas_trip_order_marks to tarifas_trip_order_marks_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'ck_tracking_positions_battery_pct'), 'alter table public.tbl_tracking_positions rename constraint ck_tracking_positions_battery_pct to tracking_positions_battery_pct_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'ck_tracking_positions_heading_deg'), 'alter table public.tbl_tracking_positions rename constraint ck_tracking_positions_heading_deg to tracking_positions_heading_deg_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'ck_tracking_positions_latitude'), 'alter table public.tbl_tracking_positions rename constraint ck_tracking_positions_latitude to tracking_positions_latitude_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'ck_tracking_positions_longitude'), 'alter table public.tbl_tracking_positions rename constraint ck_tracking_positions_longitude to tracking_positions_longitude_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'ck_tracking_positions_speed_mps'), 'alter table public.tbl_tracking_positions rename constraint ck_tracking_positions_speed_mps to tracking_positions_speed_mps_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'fk_tracking_positions_driver_id'), 'alter table public.tbl_tracking_positions rename constraint fk_tracking_positions_driver_id to tracking_positions_driver_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'fk_tracking_positions_organization_id'), 'alter table public.tbl_tracking_positions rename constraint fk_tracking_positions_organization_id to tracking_positions_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'fk_tracking_positions_route_id'), 'alter table public.tbl_tracking_positions rename constraint fk_tracking_positions_route_id to tracking_positions_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'fk_tracking_positions_vehicle_id'), 'alter table public.tbl_tracking_positions rename constraint fk_tracking_positions_vehicle_id to tracking_positions_vehicle_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'pk_tracking_positions'), 'alter table public.tbl_tracking_positions rename constraint pk_tracking_positions to tracking_positions_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_last_positions', 'fk_tracking_last_positions_organization_id'), 'alter table public.tbl_tracking_last_positions rename constraint fk_tracking_last_positions_organization_id to tracking_last_positions_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_last_positions', 'fk_tracking_last_positions_route_id'), 'alter table public.tbl_tracking_last_positions rename constraint fk_tracking_last_positions_route_id to tracking_last_positions_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_last_positions', 'pk_tracking_last_positions'), 'alter table public.tbl_tracking_last_positions rename constraint pk_tracking_last_positions to tracking_last_positions_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'fk_tracking_evidences_dispatch_guide_id'), 'alter table public.tbl_tracking_evidences rename constraint fk_tracking_evidences_dispatch_guide_id to tracking_evidences_dispatch_guide_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'fk_tracking_evidences_organization_id'), 'alter table public.tbl_tracking_evidences rename constraint fk_tracking_evidences_organization_id to tracking_evidences_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'fk_tracking_evidences_route_id'), 'alter table public.tbl_tracking_evidences rename constraint fk_tracking_evidences_route_id to tracking_evidences_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'pk_tracking_evidences'), 'alter table public.tbl_tracking_evidences rename constraint pk_tracking_evidences to tracking_evidences_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'fk_tracking_reviews_organization_id'), 'alter table public.tbl_tracking_reviews rename constraint fk_tracking_reviews_organization_id to tracking_reviews_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'fk_tracking_reviews_reviewed_by'), 'alter table public.tbl_tracking_reviews rename constraint fk_tracking_reviews_reviewed_by to tracking_reviews_reviewed_by_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'fk_tracking_reviews_route_id'), 'alter table public.tbl_tracking_reviews rename constraint fk_tracking_reviews_route_id to tracking_reviews_route_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'pk_tracking_reviews'), 'alter table public.tbl_tracking_reviews rename constraint pk_tracking_reviews to tracking_reviews_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones_detalle', 'fk_wms_expediciones_detalle_expedicion_id'), 'alter table public.tbl_wms_expediciones_detalle rename constraint fk_wms_expediciones_detalle_expedicion_id to wms_expediciones_detalle_expedicion_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones_detalle', 'pk_wms_expediciones_detalle'), 'alter table public.tbl_wms_expediciones_detalle rename constraint pk_wms_expediciones_detalle to wms_expediciones_detalle_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'fk_tracking_consents_app_user_id'), 'alter table public.tbl_tracking_consents rename constraint fk_tracking_consents_app_user_id to tracking_consents_app_user_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'fk_tracking_consents_organization_id'), 'alter table public.tbl_tracking_consents rename constraint fk_tracking_consents_organization_id to tracking_consents_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'pk_tracking_consents'), 'alter table public.tbl_tracking_consents rename constraint pk_tracking_consents to tracking_consents_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'uq_tracking_consents_app_user_id_version'), 'alter table public.tbl_tracking_consents rename constraint uq_tracking_consents_app_user_id_version to tracking_consents_app_user_id_version_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_mobile_refresh_tokens', 'fk_mobile_refresh_tokens_app_user_id'), 'alter table public.tbl_mobile_refresh_tokens rename constraint fk_mobile_refresh_tokens_app_user_id to mobile_refresh_tokens_app_user_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_mobile_refresh_tokens', 'pk_mobile_refresh_tokens'), 'alter table public.tbl_mobile_refresh_tokens rename constraint pk_mobile_refresh_tokens to mobile_refresh_tokens_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_mobile_refresh_tokens', 'uq_mobile_refresh_tokens_token_hash'), 'alter table public.tbl_mobile_refresh_tokens rename constraint uq_mobile_refresh_tokens_token_hash to mobile_refresh_tokens_token_hash_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proformas', 'fk_tarifas_proformas_carrier_id'), 'alter table public.tbl_tarifas_proformas rename constraint fk_tarifas_proformas_carrier_id to tarifas_proformas_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proformas', 'fk_tarifas_proformas_country_id'), 'alter table public.tbl_tarifas_proformas rename constraint fk_tarifas_proformas_country_id to tarifas_proformas_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proformas', 'pk_tarifas_proformas'), 'alter table public.tbl_tarifas_proformas rename constraint pk_tarifas_proformas to tarifas_proformas_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_items', 'fk_tarifas_proforma_items_proforma_id'), 'alter table public.tbl_tarifas_proforma_items rename constraint fk_tarifas_proforma_items_proforma_id to tarifas_proforma_items_proforma_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_items', 'fk_tarifas_proforma_items_settlement_id'), 'alter table public.tbl_tarifas_proforma_items rename constraint fk_tarifas_proforma_items_settlement_id to tarifas_proforma_items_settlement_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_items', 'pk_tarifas_proforma_items'), 'alter table public.tbl_tarifas_proforma_items rename constraint pk_tarifas_proforma_items to tarifas_proforma_items_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_phases', 'fk_tarifas_proforma_phases_proforma_id'), 'alter table public.tbl_tarifas_proforma_phases rename constraint fk_tarifas_proforma_phases_proforma_id to tarifas_proforma_phases_proforma_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_phases', 'pk_tarifas_proforma_phases'), 'alter table public.tbl_tarifas_proforma_phases rename constraint pk_tarifas_proforma_phases to tarifas_proforma_phases_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_flow_phases', 'fk_tarifas_proforma_flow_phases_country_id'), 'alter table public.tbl_tarifas_proforma_flow_phases rename constraint fk_tarifas_proforma_flow_phases_country_id to tarifas_proforma_flow_phases_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_flow_phases', 'pk_tarifas_proforma_flow_phases'), 'alter table public.tbl_tarifas_proforma_flow_phases rename constraint pk_tarifas_proforma_flow_phases to tarifas_proforma_flow_phases_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_email_config', 'fk_tarifas_proforma_email_config_country_id'), 'alter table public.tbl_tarifas_proforma_email_config rename constraint fk_tarifas_proforma_email_config_country_id to tarifas_proforma_email_config_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_email_config', 'pk_tarifas_proforma_email_config'), 'alter table public.tbl_tarifas_proforma_email_config rename constraint pk_tarifas_proforma_email_config to tarifas_proforma_email_config_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'ck_tarifas_trip_tender_awards_amount'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint ck_tarifas_trip_tender_awards_amount to tarifas_trip_tender_awards_amount_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'fk_tarifas_trip_tender_awards_carrier_id'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint fk_tarifas_trip_tender_awards_carrier_id to tarifas_trip_tender_awards_carrier_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'fk_tarifas_trip_tender_awards_country_id'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint fk_tarifas_trip_tender_awards_country_id to tarifas_trip_tender_awards_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'fk_tarifas_trip_tender_awards_trip_id'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint fk_tarifas_trip_tender_awards_trip_id to tarifas_trip_tender_awards_trip_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'pk_tarifas_trip_tender_awards'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint pk_tarifas_trip_tender_awards to tarifas_trip_tender_awards_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'ck_driver_presence_battery_pct'), 'alter table public.tbl_driver_presence rename constraint ck_driver_presence_battery_pct to driver_presence_battery_pct_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'ck_driver_presence_last_event'), 'alter table public.tbl_driver_presence rename constraint ck_driver_presence_last_event to driver_presence_last_event_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'ck_driver_presence_status'), 'alter table public.tbl_driver_presence rename constraint ck_driver_presence_status to driver_presence_status_check');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'fk_driver_presence_driver_id'), 'alter table public.tbl_driver_presence rename constraint fk_driver_presence_driver_id to driver_presence_driver_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'fk_driver_presence_organization_id'), 'alter table public.tbl_driver_presence rename constraint fk_driver_presence_organization_id to driver_presence_organization_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'pk_driver_presence'), 'alter table public.tbl_driver_presence rename constraint pk_driver_presence to driver_presence_pkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_claims', 'fk_tarifas_proforma_claims_country_id'), 'alter table public.tbl_tarifas_proforma_claims rename constraint fk_tarifas_proforma_claims_country_id to tarifas_proforma_claims_country_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_claims', 'fk_tarifas_proforma_claims_proforma_id'), 'alter table public.tbl_tarifas_proforma_claims rename constraint fk_tarifas_proforma_claims_proforma_id to tarifas_proforma_claims_proforma_id_fkey');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_claims', 'pk_tarifas_proforma_claims'), 'alter table public.tbl_tarifas_proforma_claims rename constraint pk_tarifas_proforma_claims to tarifas_proforma_claims_pkey');

select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events', 'rp'), 'alter table audit.tbl_events rename to events');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_tracked_tables', 'rp'), 'alter table audit.tbl_tracked_tables rename to tracked_tables');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2026_09', 'rp'), 'alter table audit.tbl_events_2026_09 rename to events_2026_09');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2026_10', 'rp'), 'alter table audit.tbl_events_2026_10 rename to events_2026_10');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2026_11', 'rp'), 'alter table audit.tbl_events_2026_11 rename to events_2026_11');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2026_12', 'rp'), 'alter table audit.tbl_events_2026_12 rename to events_2026_12');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_01', 'rp'), 'alter table audit.tbl_events_2027_01 rename to events_2027_01');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_02', 'rp'), 'alter table audit.tbl_events_2027_02 rename to events_2027_02');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_03', 'rp'), 'alter table audit.tbl_events_2027_03 rename to events_2027_03');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_04', 'rp'), 'alter table audit.tbl_events_2027_04 rename to events_2027_04');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_05', 'rp'), 'alter table audit.tbl_events_2027_05 rename to events_2027_05');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_06', 'rp'), 'alter table audit.tbl_events_2027_06 rename to events_2027_06');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_07', 'rp'), 'alter table audit.tbl_events_2027_07 rename to events_2027_07');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_08', 'rp'), 'alter table audit.tbl_events_2027_08 rename to events_2027_08');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_09', 'rp'), 'alter table audit.tbl_events_2027_09 rename to events_2027_09');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_10', 'rp'), 'alter table audit.tbl_events_2027_10 rename to events_2027_10');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_11', 'rp'), 'alter table audit.tbl_events_2027_11 rename to events_2027_11');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_2027_12', 'rp'), 'alter table audit.tbl_events_2027_12 rename to events_2027_12');
select pg_temp.exec_if(pg_temp.rel_is('audit.tbl_events_default', 'rp'), 'alter table audit.tbl_events_default rename to events_default');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_addresses', 'rp'), 'alter table public.tbl_addresses rename to addresses');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_app_modules', 'rp'), 'alter table public.tbl_app_modules rename to app_modules');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_app_users', 'rp'), 'alter table public.tbl_app_users rename to app_users');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_auth_credentials', 'rp'), 'alter table public.tbl_auth_credentials rename to auth_credentials');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_branches', 'rp'), 'alter table public.tbl_branches rename to branches');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_carriers', 'rp'), 'alter table public.tbl_carriers rename to carriers');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_contacts', 'rp'), 'alter table public.tbl_contacts rename to contacts');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_contract_documents', 'rp'), 'alter table public.tbl_contract_documents rename to contract_documents');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_contracts', 'rp'), 'alter table public.tbl_contracts rename to contracts');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_costos_fijos', 'rp'), 'alter table public.tbl_costos_fijos rename to costos_fijos');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_costos_variables', 'rp'), 'alter table public.tbl_costos_variables rename to costos_variables');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_countries', 'rp'), 'alter table public.tbl_countries rename to countries');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_customers', 'rp'), 'alter table public.tbl_customers rename to customers');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_delivery_points', 'rp'), 'alter table public.tbl_delivery_points rename to delivery_points');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_depreciacion', 'rp'), 'alter table public.tbl_depreciacion rename to depreciacion');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_dispatch_guides', 'rp'), 'alter table public.tbl_dispatch_guides rename to dispatch_guides');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_driver_license_types', 'rp'), 'alter table public.tbl_driver_license_types rename to driver_license_types');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_driver_licenses', 'rp'), 'alter table public.tbl_driver_licenses rename to driver_licenses');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_driver_presence', 'rp'), 'alter table public.tbl_driver_presence rename to driver_presence');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_drivers', 'rp'), 'alter table public.tbl_drivers rename to drivers');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_final_customers', 'rp'), 'alter table public.tbl_final_customers rename to final_customers');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_mobile_refresh_tokens', 'rp'), 'alter table public.tbl_mobile_refresh_tokens rename to mobile_refresh_tokens');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_oms_logs', 'rp'), 'alter table public.tbl_oms_logs rename to oms_logs');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_oms_rule_configs', 'rp'), 'alter table public.tbl_oms_rule_configs rename to oms_rule_configs');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_order_items', 'rp'), 'alter table public.tbl_order_items rename to order_items');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_orders', 'rp'), 'alter table public.tbl_orders rename to orders');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_organizations', 'rp'), 'alter table public.tbl_organizations rename to organizations');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_parametros_globales', 'rp'), 'alter table public.tbl_parametros_globales rename to parametros_globales');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_plan_stops', 'rp'), 'alter table public.tbl_plan_stops rename to plan_stops');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_plan_trips', 'rp'), 'alter table public.tbl_plan_trips rename to plan_trips');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_rates', 'rp'), 'alter table public.tbl_rates rename to rates');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_returns', 'rp'), 'alter table public.tbl_returns rename to returns');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_role_countries', 'rp'), 'alter table public.tbl_role_countries rename to role_countries');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_role_permissions', 'rp'), 'alter table public.tbl_role_permissions rename to role_permissions');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_roles', 'rp'), 'alter table public.tbl_roles rename to roles');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_route_plans', 'rp'), 'alter table public.tbl_route_plans rename to route_plans');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_routes', 'rp'), 'alter table public.tbl_routes rename to routes');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_rutas_costeo', 'rp'), 'alter table public.tbl_rutas_costeo rename to rutas_costeo');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_settlements', 'rp'), 'alter table public.tbl_settlements rename to settlements');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_sku_cotizaciones', 'rp'), 'alter table public.tbl_sku_cotizaciones rename to sku_cotizaciones');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_stores', 'rp'), 'alter table public.tbl_stores rename to stores');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_audit_log', 'rp'), 'alter table public.tbl_tarifas_audit_log rename to tarifas_audit_log');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_cost_structure_rows', 'rp'), 'alter table public.tbl_tarifas_cost_structure_rows rename to tarifas_cost_structure_rows');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_cost_structures', 'rp'), 'alter table public.tbl_tarifas_cost_structures rename to tarifas_cost_structures');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_country_settings', 'rp'), 'alter table public.tbl_tarifas_country_settings rename to tarifas_country_settings');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_margin_policies', 'rp'), 'alter table public.tbl_tarifas_margin_policies rename to tarifas_margin_policies');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_party_variables', 'rp'), 'alter table public.tbl_tarifas_party_variables rename to tarifas_party_variables');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_pricing_rules', 'rp'), 'alter table public.tbl_tarifas_pricing_rules rename to tarifas_pricing_rules');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_pricing_templates', 'rp'), 'alter table public.tbl_tarifas_pricing_templates rename to tarifas_pricing_templates');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_proforma_claims', 'rp'), 'alter table public.tbl_tarifas_proforma_claims rename to tarifas_proforma_claims');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_proforma_email_config', 'rp'), 'alter table public.tbl_tarifas_proforma_email_config rename to tarifas_proforma_email_config');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_proforma_flow_phases', 'rp'), 'alter table public.tbl_tarifas_proforma_flow_phases rename to tarifas_proforma_flow_phases');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_proforma_items', 'rp'), 'alter table public.tbl_tarifas_proforma_items rename to tarifas_proforma_items');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_proforma_phases', 'rp'), 'alter table public.tbl_tarifas_proforma_phases rename to tarifas_proforma_phases');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_proformas', 'rp'), 'alter table public.tbl_tarifas_proformas rename to tarifas_proformas');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_rate_table_rows', 'rp'), 'alter table public.tbl_tarifas_rate_table_rows rename to tarifas_rate_table_rows');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_rate_tables', 'rp'), 'alter table public.tbl_tarifas_rate_tables rename to tarifas_rate_tables');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_settlement_parties', 'rp'), 'alter table public.tbl_tarifas_settlement_parties rename to tarifas_settlement_parties');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_settlements', 'rp'), 'alter table public.tbl_tarifas_settlements rename to tarifas_settlements');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_trip_order_marks', 'rp'), 'alter table public.tbl_tarifas_trip_order_marks rename to tarifas_trip_order_marks');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_trip_tender_awards', 'rp'), 'alter table public.tbl_tarifas_trip_tender_awards rename to tarifas_trip_tender_awards');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tarifas_zone_groups', 'rp'), 'alter table public.tbl_tarifas_zone_groups rename to tarifas_zone_groups');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tariff_types', 'rp'), 'alter table public.tbl_tariff_types rename to tariff_types');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tipos_camion', 'rp'), 'alter table public.tbl_tipos_camion rename to tipos_camion');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tracking_consents', 'rp'), 'alter table public.tbl_tracking_consents rename to tracking_consents');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tracking_events', 'rp'), 'alter table public.tbl_tracking_events rename to tracking_events');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tracking_evidences', 'rp'), 'alter table public.tbl_tracking_evidences rename to tracking_evidences');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tracking_last_positions', 'rp'), 'alter table public.tbl_tracking_last_positions rename to tracking_last_positions');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tracking_positions', 'rp'), 'alter table public.tbl_tracking_positions rename to tracking_positions');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_tracking_reviews', 'rp'), 'alter table public.tbl_tracking_reviews rename to tracking_reviews');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_user_scopes', 'rp'), 'alter table public.tbl_user_scopes rename to user_scopes');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_vehicle_types', 'rp'), 'alter table public.tbl_vehicle_types rename to vehicle_types');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_vehicles', 'rp'), 'alter table public.tbl_vehicles rename to vehicles');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_warehouses', 'rp'), 'alter table public.tbl_warehouses rename to warehouses');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_wms_expediciones', 'rp'), 'alter table public.tbl_wms_expediciones rename to wms_expediciones');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_wms_expediciones_detalle', 'rp'), 'alter table public.tbl_wms_expediciones_detalle rename to wms_expediciones_detalle');
select pg_temp.exec_if(pg_temp.rel_is('public.tbl_zones', 'rp'), 'alter table public.tbl_zones rename to zones');

-- Funciones con su definición original (después de devolver los nombres de tabla).
CREATE OR REPLACE FUNCTION audit.capture_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  cfg      audit.tracked_tables;
  actor    jsonb := nullif(current_setting('tms.audit_actor', true), '')::jsonb;
  old_row  jsonb;
  new_row  jsonb;
  diff     jsonb;
  masked   text[];
  v_app_user uuid;
  v_role     text;
begin
  select * into cfg from audit.tracked_tables where table_name = tg_table_name;
  masked := coalesce(cfg.masked_columns, '{}');
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    -- Solo lo que cambió; un cambio en una columna oculta se registra sin su valor.
    select jsonb_object_agg(k, case when k = any(masked) then '["[oculto]", "[oculto]"]'::jsonb
                                    else jsonb_build_array(old_row -> k, new_row -> k) end)
      into diff
      from jsonb_object_keys(new_row) as k
     where (old_row -> k) is distinct from (new_row -> k) and k <> 'updated_at';
    if diff is null then
      return null;  -- nada relevante cambió (p. ej. solo updated_at)
    end if;
  end if;

  if actor ->> 'auth_user_id' is not null then
    select au.id, r.name into v_app_user, v_role
      from public.app_users au left join public.roles r on r.id = au.role_id
     where au.auth_user_id = (actor ->> 'auth_user_id')::uuid;
  end if;

  insert into audit.events (actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
                            module_key, entity_table, entity_id, changes, before, after,
                            request_id, ip, user_agent)
  values (coalesce(actor ->> 'type', 'system'),
          (actor ->> 'auth_user_id')::uuid, v_app_user, actor ->> 'email', v_role,
          coalesce(actor ->> 'source', 'db:' || coalesce(nullif(current_setting('application_name', true), ''),
                                                         session_user::text)),
          case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
          cfg.module_key, tg_table_name, coalesce(new_row, old_row) ->> coalesce(cfg.id_column, 'id'),
          diff,
          case when tg_op = 'DELETE' then old_row - masked end,
          case when tg_op = 'INSERT' then new_row - masked end,
          actor ->> 'request_id', actor ->> 'ip', actor ->> 'user_agent');
  return null;
end $function$;

CREATE OR REPLACE FUNCTION audit.ensure_partitions(months_ahead integer DEFAULT 3, from_month date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'audit'
AS $function$
declare
  first_month date := date_trunc('month', coalesce(from_month, current_date))::date;
  month_start date;
  created int := 0;
begin
  for i in 0..months_ahead loop
    month_start := (first_month + make_interval(months => i))::date;
    if to_regclass(format('audit.events_%s', to_char(month_start, 'YYYY_MM'))) is null then
      execute format('create table audit.%I partition of audit.events for values from (%L) to (%L)',
                     'events_' || to_char(month_start, 'YYYY_MM'), month_start,
                     (month_start + interval '1 month')::date);
      -- TRUNCATE directo sobre la partición no dispara el trigger de la tabla madre.
      execute format('create trigger events_no_truncate before truncate on audit.%I '
                     'for each statement execute function audit.forbid_change()',
                     'events_' || to_char(month_start, 'YYYY_MM'));
      created := created + 1;
    end if;
  end loop;
  return created;
end $function$;

CREATE OR REPLACE FUNCTION public.zone_for_point(p_country_id uuid, p_latitude numeric, p_longitude numeric)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select z.id
  from zones z
  cross join lateral (select ST_SetSRID(ST_GeomFromGeoJSON(z.geofence::text), 4326) as geom) g
  where p_latitude is not null and p_longitude is not null
    and z.country_id = p_country_id and z.status = 'active' and z.geofence is not null
    and ST_Covers(g.geom, ST_SetSRID(ST_MakePoint(p_longitude::float8, p_latitude::float8), 4326))
  order by ST_Area(g.geom), z.code
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.assign_zones_by_map(p_country_id uuid, p_address_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  changed integer;
  previous text := coalesce(current_setting('tms.zone_source_explicit', true), 'off');
begin
  perform set_config('tms.zone_source_explicit', 'on', true);
  with target as (
    select dp.id, zone_for_point(a.country_id, a.latitude, a.longitude) as zone_id
    from delivery_points dp
    join addresses a on a.id = dp.address_id
    where dp.zone_source = 'map' and a.country_id = p_country_id
      and (p_address_id is null or a.id = p_address_id)
  )
  update delivery_points dp set zone_id = t.zone_id, updated_at = now()
  from target t
  where dp.id = t.id and dp.zone_id is distinct from t.zone_id;
  get diagnostics changed = row_count;
  perform set_config('tms.zone_source_explicit', previous, true);
  return changed;
end
$function$;

CREATE OR REPLACE FUNCTION public.delivery_points_zone_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  addr record;
begin
  if coalesce(current_setting('tms.zone_source_explicit', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.zone_id is not null and new.zone_source = 'map' then
      new.zone_source := 'manual';
    end if;
  elsif new.zone_source is distinct from old.zone_source then
    null;  -- cambio explícito de origen: se respeta
  elsif new.zone_id is distinct from old.zone_id then
    new.zone_source := 'manual';
  end if;
  if new.zone_source = 'map' then
    select country_id, latitude, longitude into addr from addresses where id = new.address_id;
    new.zone_id := case when found then zone_for_point(addr.country_id, addr.latitude, addr.longitude) end;
  end if;
  return new;
end
$function$;


commit;
