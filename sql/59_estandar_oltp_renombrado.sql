-- ============================================================================
-- 59 — Estándar OLTP Intelix en tms_olo: tablas, vistas, secuencias, constraints, índices y triggers.
--
-- GENERADO por scripts/estandar-bd/generar_renombrado.py desde el catálogo. No editar a mano:
-- regenerar. Decisión: docs/decisions/0014-estandar-oltp-nombres-bd.md.
-- Corre DESPUÉS de sql/58_orders_unificar_contador_cambio_fecha.sql.
-- Tablas: 96 (incluye 17 particiones de audit.events) | constraints: 281 | índices: 185 | triggers: 87 | secuencias: 4 | vistas: 6 | vistas de compatibilidad: 85
-- Fuera de alcance (desviaciones): schema_migrations, mobile_migrations, sim_expedicionescabecera
-- (tabla de simulación, con todos sus objetos), objetos de extensiones (PostGIS) y las funciones
-- propias (se llaman por nombre desde código/migraciones; se conservan, solo cambian sus cuerpos).
-- Una transacción; idempotente (cada paso verifica el catálogo antes de actuar).
-- ROLLBACK exacto: sql/59_estandar_oltp_renombrado_rollback.sql.
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

-- 1) Tablas → tbl_ (las particiones de audit.events incluidas)
select pg_temp.exec_if(pg_temp.rel_is('audit.events', 'rp'), 'alter table audit.events rename to tbl_events');
select pg_temp.exec_if(pg_temp.rel_is('audit.tracked_tables', 'rp'), 'alter table audit.tracked_tables rename to tbl_tracked_tables');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09', 'rp'), 'alter table audit.events_2026_09 rename to tbl_events_2026_09');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10', 'rp'), 'alter table audit.events_2026_10 rename to tbl_events_2026_10');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11', 'rp'), 'alter table audit.events_2026_11 rename to tbl_events_2026_11');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12', 'rp'), 'alter table audit.events_2026_12 rename to tbl_events_2026_12');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01', 'rp'), 'alter table audit.events_2027_01 rename to tbl_events_2027_01');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02', 'rp'), 'alter table audit.events_2027_02 rename to tbl_events_2027_02');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03', 'rp'), 'alter table audit.events_2027_03 rename to tbl_events_2027_03');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04', 'rp'), 'alter table audit.events_2027_04 rename to tbl_events_2027_04');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05', 'rp'), 'alter table audit.events_2027_05 rename to tbl_events_2027_05');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06', 'rp'), 'alter table audit.events_2027_06 rename to tbl_events_2027_06');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07', 'rp'), 'alter table audit.events_2027_07 rename to tbl_events_2027_07');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08', 'rp'), 'alter table audit.events_2027_08 rename to tbl_events_2027_08');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09', 'rp'), 'alter table audit.events_2027_09 rename to tbl_events_2027_09');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10', 'rp'), 'alter table audit.events_2027_10 rename to tbl_events_2027_10');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11', 'rp'), 'alter table audit.events_2027_11 rename to tbl_events_2027_11');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12', 'rp'), 'alter table audit.events_2027_12 rename to tbl_events_2027_12');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default', 'rp'), 'alter table audit.events_default rename to tbl_events_default');
select pg_temp.exec_if(pg_temp.rel_is('public.addresses', 'rp'), 'alter table public.addresses rename to tbl_addresses');
select pg_temp.exec_if(pg_temp.rel_is('public.app_modules', 'rp'), 'alter table public.app_modules rename to tbl_app_modules');
select pg_temp.exec_if(pg_temp.rel_is('public.app_users', 'rp'), 'alter table public.app_users rename to tbl_app_users');
select pg_temp.exec_if(pg_temp.rel_is('public.auth_credentials', 'rp'), 'alter table public.auth_credentials rename to tbl_auth_credentials');
select pg_temp.exec_if(pg_temp.rel_is('public.branches', 'rp'), 'alter table public.branches rename to tbl_branches');
select pg_temp.exec_if(pg_temp.rel_is('public.carriers', 'rp'), 'alter table public.carriers rename to tbl_carriers');
select pg_temp.exec_if(pg_temp.rel_is('public.contacts', 'rp'), 'alter table public.contacts rename to tbl_contacts');
select pg_temp.exec_if(pg_temp.rel_is('public.contract_documents', 'rp'), 'alter table public.contract_documents rename to tbl_contract_documents');
select pg_temp.exec_if(pg_temp.rel_is('public.contracts', 'rp'), 'alter table public.contracts rename to tbl_contracts');
select pg_temp.exec_if(pg_temp.rel_is('public.costos_fijos', 'rp'), 'alter table public.costos_fijos rename to tbl_costos_fijos');
select pg_temp.exec_if(pg_temp.rel_is('public.costos_variables', 'rp'), 'alter table public.costos_variables rename to tbl_costos_variables');
select pg_temp.exec_if(pg_temp.rel_is('public.countries', 'rp'), 'alter table public.countries rename to tbl_countries');
select pg_temp.exec_if(pg_temp.rel_is('public.customers', 'rp'), 'alter table public.customers rename to tbl_customers');
select pg_temp.exec_if(pg_temp.rel_is('public.delivery_points', 'rp'), 'alter table public.delivery_points rename to tbl_delivery_points');
select pg_temp.exec_if(pg_temp.rel_is('public.depreciacion', 'rp'), 'alter table public.depreciacion rename to tbl_depreciacion');
select pg_temp.exec_if(pg_temp.rel_is('public.dispatch_guides', 'rp'), 'alter table public.dispatch_guides rename to tbl_dispatch_guides');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_license_types', 'rp'), 'alter table public.driver_license_types rename to tbl_driver_license_types');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_licenses', 'rp'), 'alter table public.driver_licenses rename to tbl_driver_licenses');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_presence', 'rp'), 'alter table public.driver_presence rename to tbl_driver_presence');
select pg_temp.exec_if(pg_temp.rel_is('public.drivers', 'rp'), 'alter table public.drivers rename to tbl_drivers');
select pg_temp.exec_if(pg_temp.rel_is('public.final_customers', 'rp'), 'alter table public.final_customers rename to tbl_final_customers');
select pg_temp.exec_if(pg_temp.rel_is('public.mobile_refresh_tokens', 'rp'), 'alter table public.mobile_refresh_tokens rename to tbl_mobile_refresh_tokens');
select pg_temp.exec_if(pg_temp.rel_is('public.oms_logs', 'rp'), 'alter table public.oms_logs rename to tbl_oms_logs');
select pg_temp.exec_if(pg_temp.rel_is('public.oms_rule_configs', 'rp'), 'alter table public.oms_rule_configs rename to tbl_oms_rule_configs');
select pg_temp.exec_if(pg_temp.rel_is('public.order_items', 'rp'), 'alter table public.order_items rename to tbl_order_items');
select pg_temp.exec_if(pg_temp.rel_is('public.orders', 'rp'), 'alter table public.orders rename to tbl_orders');
select pg_temp.exec_if(pg_temp.rel_is('public.organizations', 'rp'), 'alter table public.organizations rename to tbl_organizations');
select pg_temp.exec_if(pg_temp.rel_is('public.parametros_globales', 'rp'), 'alter table public.parametros_globales rename to tbl_parametros_globales');
select pg_temp.exec_if(pg_temp.rel_is('public.plan_stops', 'rp'), 'alter table public.plan_stops rename to tbl_plan_stops');
select pg_temp.exec_if(pg_temp.rel_is('public.plan_trips', 'rp'), 'alter table public.plan_trips rename to tbl_plan_trips');
select pg_temp.exec_if(pg_temp.rel_is('public.rates', 'rp'), 'alter table public.rates rename to tbl_rates');
select pg_temp.exec_if(pg_temp.rel_is('public.returns', 'rp'), 'alter table public.returns rename to tbl_returns');
select pg_temp.exec_if(pg_temp.rel_is('public.role_countries', 'rp'), 'alter table public.role_countries rename to tbl_role_countries');
select pg_temp.exec_if(pg_temp.rel_is('public.role_permissions', 'rp'), 'alter table public.role_permissions rename to tbl_role_permissions');
select pg_temp.exec_if(pg_temp.rel_is('public.roles', 'rp'), 'alter table public.roles rename to tbl_roles');
select pg_temp.exec_if(pg_temp.rel_is('public.route_plans', 'rp'), 'alter table public.route_plans rename to tbl_route_plans');
select pg_temp.exec_if(pg_temp.rel_is('public.routes', 'rp'), 'alter table public.routes rename to tbl_routes');
select pg_temp.exec_if(pg_temp.rel_is('public.rutas_costeo', 'rp'), 'alter table public.rutas_costeo rename to tbl_rutas_costeo');
select pg_temp.exec_if(pg_temp.rel_is('public.settlements', 'rp'), 'alter table public.settlements rename to tbl_settlements');
select pg_temp.exec_if(pg_temp.rel_is('public.sku_cotizaciones', 'rp'), 'alter table public.sku_cotizaciones rename to tbl_sku_cotizaciones');
select pg_temp.exec_if(pg_temp.rel_is('public.stores', 'rp'), 'alter table public.stores rename to tbl_stores');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_audit_log', 'rp'), 'alter table public.tarifas_audit_log rename to tbl_tarifas_audit_log');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structure_rows', 'rp'), 'alter table public.tarifas_cost_structure_rows rename to tbl_tarifas_cost_structure_rows');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structures', 'rp'), 'alter table public.tarifas_cost_structures rename to tbl_tarifas_cost_structures');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_country_settings', 'rp'), 'alter table public.tarifas_country_settings rename to tbl_tarifas_country_settings');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_margin_policies', 'rp'), 'alter table public.tarifas_margin_policies rename to tbl_tarifas_margin_policies');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_party_variables', 'rp'), 'alter table public.tarifas_party_variables rename to tbl_tarifas_party_variables');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_rules', 'rp'), 'alter table public.tarifas_pricing_rules rename to tbl_tarifas_pricing_rules');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_templates', 'rp'), 'alter table public.tarifas_pricing_templates rename to tbl_tarifas_pricing_templates');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_claims', 'rp'), 'alter table public.tarifas_proforma_claims rename to tbl_tarifas_proforma_claims');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_email_config', 'rp'), 'alter table public.tarifas_proforma_email_config rename to tbl_tarifas_proforma_email_config');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_flow_phases', 'rp'), 'alter table public.tarifas_proforma_flow_phases rename to tbl_tarifas_proforma_flow_phases');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_items', 'rp'), 'alter table public.tarifas_proforma_items rename to tbl_tarifas_proforma_items');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_phases', 'rp'), 'alter table public.tarifas_proforma_phases rename to tbl_tarifas_proforma_phases');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proformas', 'rp'), 'alter table public.tarifas_proformas rename to tbl_tarifas_proformas');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_table_rows', 'rp'), 'alter table public.tarifas_rate_table_rows rename to tbl_tarifas_rate_table_rows');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_tables', 'rp'), 'alter table public.tarifas_rate_tables rename to tbl_tarifas_rate_tables');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlement_parties', 'rp'), 'alter table public.tarifas_settlement_parties rename to tbl_tarifas_settlement_parties');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements', 'rp'), 'alter table public.tarifas_settlements rename to tbl_tarifas_settlements');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_order_marks', 'rp'), 'alter table public.tarifas_trip_order_marks rename to tbl_tarifas_trip_order_marks');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_tender_awards', 'rp'), 'alter table public.tarifas_trip_tender_awards rename to tbl_tarifas_trip_tender_awards');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_zone_groups', 'rp'), 'alter table public.tarifas_zone_groups rename to tbl_tarifas_zone_groups');
select pg_temp.exec_if(pg_temp.rel_is('public.tariff_types', 'rp'), 'alter table public.tariff_types rename to tbl_tariff_types');
select pg_temp.exec_if(pg_temp.rel_is('public.tipos_camion', 'rp'), 'alter table public.tipos_camion rename to tbl_tipos_camion');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_consents', 'rp'), 'alter table public.tracking_consents rename to tbl_tracking_consents');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_events', 'rp'), 'alter table public.tracking_events rename to tbl_tracking_events');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_evidences', 'rp'), 'alter table public.tracking_evidences rename to tbl_tracking_evidences');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_last_positions', 'rp'), 'alter table public.tracking_last_positions rename to tbl_tracking_last_positions');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_positions', 'rp'), 'alter table public.tracking_positions rename to tbl_tracking_positions');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_reviews', 'rp'), 'alter table public.tracking_reviews rename to tbl_tracking_reviews');
select pg_temp.exec_if(pg_temp.rel_is('public.user_scopes', 'rp'), 'alter table public.user_scopes rename to tbl_user_scopes');
select pg_temp.exec_if(pg_temp.rel_is('public.vehicle_types', 'rp'), 'alter table public.vehicle_types rename to tbl_vehicle_types');
select pg_temp.exec_if(pg_temp.rel_is('public.vehicles', 'rp'), 'alter table public.vehicles rename to tbl_vehicles');
select pg_temp.exec_if(pg_temp.rel_is('public.warehouses', 'rp'), 'alter table public.warehouses rename to tbl_warehouses');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones', 'rp'), 'alter table public.wms_expediciones rename to tbl_wms_expediciones');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones_detalle', 'rp'), 'alter table public.wms_expediciones_detalle rename to tbl_wms_expediciones_detalle');
select pg_temp.exec_if(pg_temp.rel_is('public.zones', 'rp'), 'alter table public.zones rename to tbl_zones');

-- 2) Constraints → pk_/fk_/uq_/ck_ (PK/UQ de particiones: por su índice)
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'app_users_organization_id_fkey'), 'alter table public.tbl_app_users rename constraint app_users_organization_id_fkey to fk_app_users_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'app_users_role_id_fkey'), 'alter table public.tbl_app_users rename constraint app_users_role_id_fkey to fk_app_users_role_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'app_users_pkey'), 'alter table public.tbl_app_users rename constraint app_users_pkey to pk_app_users');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_users', 'app_users_email_key'), 'alter table public.tbl_app_users rename constraint app_users_email_key to uq_app_users_email');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'carriers_flat_rate_amount_check'), 'alter table public.tbl_carriers rename constraint carriers_flat_rate_amount_check to ck_carriers_flat_rate_amount');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'carriers_rate_type_check'), 'alter table public.tbl_carriers rename constraint carriers_rate_type_check to ck_carriers_rate_type');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'carriers_country_id_fkey'), 'alter table public.tbl_carriers rename constraint carriers_country_id_fkey to fk_carriers_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'carriers_organization_id_fkey'), 'alter table public.tbl_carriers rename constraint carriers_organization_id_fkey to fk_carriers_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'carriers_pkey'), 'alter table public.tbl_carriers rename constraint carriers_pkey to pk_carriers');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_carriers', 'carriers_organization_id_code_key'), 'alter table public.tbl_carriers rename constraint carriers_organization_id_code_key to uq_carriers_organization_id_code');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contract_documents', 'contract_documents_contract_id_fkey'), 'alter table public.tbl_contract_documents rename constraint contract_documents_contract_id_fkey to fk_contract_documents_contract_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contract_documents', 'contract_documents_organization_id_fkey'), 'alter table public.tbl_contract_documents rename constraint contract_documents_organization_id_fkey to fk_contract_documents_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contract_documents', 'contract_documents_pkey'), 'alter table public.tbl_contract_documents rename constraint contract_documents_pkey to pk_contract_documents');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contracts', 'contracts_organization_id_fkey'), 'alter table public.tbl_contracts rename constraint contracts_organization_id_fkey to fk_contracts_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contracts', 'contracts_pkey'), 'alter table public.tbl_contracts rename constraint contracts_pkey to pk_contracts');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_fijos', 'costos_fijos_monto_check'), 'alter table public.tbl_costos_fijos rename constraint costos_fijos_monto_check to ck_costos_fijos_monto');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_fijos', 'costos_fijos_pkey'), 'alter table public.tbl_costos_fijos rename constraint costos_fijos_pkey to pk_costos_fijos');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_fijos', 'costos_fijos_categoria_concepto_key'), 'alter table public.tbl_costos_fijos rename constraint costos_fijos_categoria_concepto_key to uq_costos_fijos_categoria_concepto');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_costo_t1_check'), 'alter table public.tbl_costos_variables rename constraint costos_variables_costo_t1_check to ck_costos_variables_costo_t1');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_costo_t3_check'), 'alter table public.tbl_costos_variables rename constraint costos_variables_costo_t3_check to ck_costos_variables_costo_t3');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_costo_t5_check'), 'alter table public.tbl_costos_variables rename constraint costos_variables_costo_t5_check to ck_costos_variables_costo_t5');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_freq_t1_check'), 'alter table public.tbl_costos_variables rename constraint costos_variables_freq_t1_check to ck_costos_variables_freq_t1');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_freq_t3_check'), 'alter table public.tbl_costos_variables rename constraint costos_variables_freq_t3_check to ck_costos_variables_freq_t3');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_freq_t5_check'), 'alter table public.tbl_costos_variables rename constraint costos_variables_freq_t5_check to ck_costos_variables_freq_t5');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_pkey'), 'alter table public.tbl_costos_variables rename constraint costos_variables_pkey to pk_costos_variables');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_costos_variables', 'costos_variables_componente_key'), 'alter table public.tbl_costos_variables rename constraint costos_variables_componente_key to uq_costos_variables_componente');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_countries', 'countries_organization_id_fkey'), 'alter table public.tbl_countries rename constraint countries_organization_id_fkey to fk_countries_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_countries', 'countries_pkey'), 'alter table public.tbl_countries rename constraint countries_pkey to pk_countries');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_countries', 'countries_organization_id_code_key'), 'alter table public.tbl_countries rename constraint countries_organization_id_code_key to uq_countries_organization_id_code');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'depreciacion_valor_vehiculo_check'), 'alter table public.tbl_depreciacion rename constraint depreciacion_valor_vehiculo_check to ck_depreciacion_valor_vehiculo');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'depreciacion_vida_meses_check'), 'alter table public.tbl_depreciacion rename constraint depreciacion_vida_meses_check to ck_depreciacion_vida_meses');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'depreciacion_codigo_camion_fkey'), 'alter table public.tbl_depreciacion rename constraint depreciacion_codigo_camion_fkey to fk_depreciacion_codigo_camion');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_depreciacion', 'depreciacion_pkey'), 'alter table public.tbl_depreciacion rename constraint depreciacion_pkey to pk_depreciacion');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'dispatch_guides_order_id_fkey'), 'alter table public.tbl_dispatch_guides rename constraint dispatch_guides_order_id_fkey to fk_dispatch_guides_order_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'dispatch_guides_organization_id_fkey'), 'alter table public.tbl_dispatch_guides rename constraint dispatch_guides_organization_id_fkey to fk_dispatch_guides_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'dispatch_guides_route_id_fkey'), 'alter table public.tbl_dispatch_guides rename constraint dispatch_guides_route_id_fkey to fk_dispatch_guides_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'dispatch_guides_pkey'), 'alter table public.tbl_dispatch_guides rename constraint dispatch_guides_pkey to pk_dispatch_guides');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_dispatch_guides', 'dispatch_guides_organization_id_guide_number_key'), 'alter table public.tbl_dispatch_guides rename constraint dispatch_guides_organization_id_guide_number_key to uq_dispatch_guides_organization_id_guide_number');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'drivers_app_user_id_fkey'), 'alter table public.tbl_drivers rename constraint drivers_app_user_id_fkey to fk_drivers_app_user_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'drivers_carrier_id_fkey'), 'alter table public.tbl_drivers rename constraint drivers_carrier_id_fkey to fk_drivers_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'drivers_license_type_id_fkey'), 'alter table public.tbl_drivers rename constraint drivers_license_type_id_fkey to fk_drivers_license_type_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'drivers_organization_id_fkey'), 'alter table public.tbl_drivers rename constraint drivers_organization_id_fkey to fk_drivers_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'drivers_pkey'), 'alter table public.tbl_drivers rename constraint drivers_pkey to pk_drivers');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_drivers', 'drivers_organization_id_code_key'), 'alter table public.tbl_drivers rename constraint drivers_organization_id_code_key to uq_drivers_organization_id_code');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_organizations', 'organizations_pkey'), 'alter table public.tbl_organizations rename constraint organizations_pkey to pk_organizations');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_organizations', 'organizations_slug_key'), 'alter table public.tbl_organizations rename constraint organizations_slug_key to uq_organizations_slug');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_parametros_globales', 'parametros_globales_pkey'), 'alter table public.tbl_parametros_globales rename constraint parametros_globales_pkey to pk_parametros_globales');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'rates_carrier_id_fkey'), 'alter table public.tbl_rates rename constraint rates_carrier_id_fkey to fk_rates_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'rates_country_id_fkey'), 'alter table public.tbl_rates rename constraint rates_country_id_fkey to fk_rates_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'rates_organization_id_fkey'), 'alter table public.tbl_rates rename constraint rates_organization_id_fkey to fk_rates_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'rates_tariff_type_id_fkey'), 'alter table public.tbl_rates rename constraint rates_tariff_type_id_fkey to fk_rates_tariff_type_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rates', 'rates_pkey'), 'alter table public.tbl_rates rename constraint rates_pkey to pk_rates');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'returns_dispatch_guide_id_fkey'), 'alter table public.tbl_returns rename constraint returns_dispatch_guide_id_fkey to fk_returns_dispatch_guide_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'returns_order_id_fkey'), 'alter table public.tbl_returns rename constraint returns_order_id_fkey to fk_returns_order_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'returns_organization_id_fkey'), 'alter table public.tbl_returns rename constraint returns_organization_id_fkey to fk_returns_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'returns_pkey'), 'alter table public.tbl_returns rename constraint returns_pkey to pk_returns');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_returns', 'returns_organization_id_return_number_key'), 'alter table public.tbl_returns rename constraint returns_organization_id_return_number_key to uq_returns_organization_id_return_number');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_roles', 'roles_pkey'), 'alter table public.tbl_roles rename constraint roles_pkey to pk_roles');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_roles', 'roles_name_key'), 'alter table public.tbl_roles rename constraint roles_name_key to uq_roles_name');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'zones_geofence_geojson_check'), 'alter table public.tbl_zones rename constraint zones_geofence_geojson_check to ck_zones_geofence_geojson');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'zones_status_check'), 'alter table public.tbl_zones rename constraint zones_status_check to ck_zones_status');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'zones_country_id_fkey'), 'alter table public.tbl_zones rename constraint zones_country_id_fkey to fk_zones_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'zones_organization_id_fkey'), 'alter table public.tbl_zones rename constraint zones_organization_id_fkey to fk_zones_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_zones', 'zones_pkey'), 'alter table public.tbl_zones rename constraint zones_pkey to pk_zones');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_carrier_id_fkey'), 'alter table public.tbl_routes rename constraint routes_carrier_id_fkey to fk_routes_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_driver_id_fkey'), 'alter table public.tbl_routes rename constraint routes_driver_id_fkey to fk_routes_driver_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_organization_id_fkey'), 'alter table public.tbl_routes rename constraint routes_organization_id_fkey to fk_routes_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_plan_trip_id_fkey'), 'alter table public.tbl_routes rename constraint routes_plan_trip_id_fkey to fk_routes_plan_trip_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_route_type_id_fkey'), 'alter table public.tbl_routes rename constraint routes_route_type_id_fkey to fk_routes_route_type_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_store_id_fkey'), 'alter table public.tbl_routes rename constraint routes_store_id_fkey to fk_routes_store_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_vehicle_id_fkey'), 'alter table public.tbl_routes rename constraint routes_vehicle_id_fkey to fk_routes_vehicle_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_pkey'), 'alter table public.tbl_routes rename constraint routes_pkey to pk_routes');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_routes', 'routes_organization_id_route_number_key'), 'alter table public.tbl_routes rename constraint routes_organization_id_route_number_key to uq_routes_organization_id_route_number');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'rutas_costeo_dias_check'), 'alter table public.tbl_rutas_costeo rename constraint rutas_costeo_dias_check to ck_rutas_costeo_dias');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'rutas_costeo_horas_check'), 'alter table public.tbl_rutas_costeo rename constraint rutas_costeo_horas_check to ck_rutas_costeo_horas');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'rutas_costeo_kilometros_check'), 'alter table public.tbl_rutas_costeo rename constraint rutas_costeo_kilometros_check to ck_rutas_costeo_kilometros');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'rutas_costeo_codigo_camion_fkey'), 'alter table public.tbl_rutas_costeo rename constraint rutas_costeo_codigo_camion_fkey to fk_rutas_costeo_codigo_camion');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_rutas_costeo', 'rutas_costeo_pkey'), 'alter table public.tbl_rutas_costeo rename constraint rutas_costeo_pkey to pk_rutas_costeo');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'settlements_carrier_id_fkey'), 'alter table public.tbl_settlements rename constraint settlements_carrier_id_fkey to fk_settlements_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'settlements_driver_id_fkey'), 'alter table public.tbl_settlements rename constraint settlements_driver_id_fkey to fk_settlements_driver_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'settlements_organization_id_fkey'), 'alter table public.tbl_settlements rename constraint settlements_organization_id_fkey to fk_settlements_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'settlements_route_id_fkey'), 'alter table public.tbl_settlements rename constraint settlements_route_id_fkey to fk_settlements_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'settlements_pkey'), 'alter table public.tbl_settlements rename constraint settlements_pkey to pk_settlements');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_settlements', 'settlements_organization_id_settlement_number_key'), 'alter table public.tbl_settlements rename constraint settlements_organization_id_settlement_number_key to uq_settlements_organization_id_settlement_number');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'sku_cotizaciones_cantidad_check'), 'alter table public.tbl_sku_cotizaciones rename constraint sku_cotizaciones_cantidad_check to ck_sku_cotizaciones_cantidad');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'sku_cotizaciones_peso_kg_check'), 'alter table public.tbl_sku_cotizaciones rename constraint sku_cotizaciones_peso_kg_check to ck_sku_cotizaciones_peso_kg');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'sku_cotizaciones_volumen_m3_check'), 'alter table public.tbl_sku_cotizaciones rename constraint sku_cotizaciones_volumen_m3_check to ck_sku_cotizaciones_volumen_m3');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'sku_cotizaciones_ruta_id_fkey'), 'alter table public.tbl_sku_cotizaciones rename constraint sku_cotizaciones_ruta_id_fkey to fk_sku_cotizaciones_ruta_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_sku_cotizaciones', 'sku_cotizaciones_pkey'), 'alter table public.tbl_sku_cotizaciones rename constraint sku_cotizaciones_pkey to pk_sku_cotizaciones');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'stores_country_id_fkey'), 'alter table public.tbl_stores rename constraint stores_country_id_fkey to fk_stores_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'stores_organization_id_fkey'), 'alter table public.tbl_stores rename constraint stores_organization_id_fkey to fk_stores_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'stores_warehouse_id_fkey'), 'alter table public.tbl_stores rename constraint stores_warehouse_id_fkey to fk_stores_warehouse_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'stores_pkey'), 'alter table public.tbl_stores rename constraint stores_pkey to pk_stores');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_stores', 'stores_organization_id_code_key'), 'alter table public.tbl_stores rename constraint stores_organization_id_code_key to uq_stores_organization_id_code');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'tipos_camion_capacidad_kg_check'), 'alter table public.tbl_tipos_camion rename constraint tipos_camion_capacidad_kg_check to ck_tipos_camion_capacidad_kg');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'tipos_camion_capacidad_m3_check'), 'alter table public.tbl_tipos_camion rename constraint tipos_camion_capacidad_m3_check to ck_tipos_camion_capacidad_m3');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'tipos_camion_km_por_litro_check'), 'alter table public.tbl_tipos_camion rename constraint tipos_camion_km_por_litro_check to ck_tipos_camion_km_por_litro');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tipos_camion', 'tipos_camion_pkey'), 'alter table public.tbl_tipos_camion rename constraint tipos_camion_pkey to pk_tipos_camion');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'tracking_events_distance_m_check'), 'alter table public.tbl_tracking_events rename constraint tracking_events_distance_m_check to ck_tracking_events_distance_m');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'tracking_events_dispatch_guide_id_fkey'), 'alter table public.tbl_tracking_events rename constraint tracking_events_dispatch_guide_id_fkey to fk_tracking_events_dispatch_guide_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'tracking_events_organization_id_fkey'), 'alter table public.tbl_tracking_events rename constraint tracking_events_organization_id_fkey to fk_tracking_events_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'tracking_events_route_id_fkey'), 'alter table public.tbl_tracking_events rename constraint tracking_events_route_id_fkey to fk_tracking_events_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_events', 'tracking_events_pkey'), 'alter table public.tbl_tracking_events rename constraint tracking_events_pkey to pk_tracking_events');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicle_types', 'vehicle_types_status_check'), 'alter table public.tbl_vehicle_types rename constraint vehicle_types_status_check to ck_vehicle_types_status');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicle_types', 'vehicle_types_organization_id_fkey'), 'alter table public.tbl_vehicle_types rename constraint vehicle_types_organization_id_fkey to fk_vehicle_types_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicle_types', 'vehicle_types_pkey'), 'alter table public.tbl_vehicle_types rename constraint vehicle_types_pkey to pk_vehicle_types');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'vehicles_container_dimensions_check'), 'alter table public.tbl_vehicles rename constraint vehicles_container_dimensions_check to ck_vehicles_container_dimensions');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'vehicles_container_unit_check'), 'alter table public.tbl_vehicles rename constraint vehicles_container_unit_check to ck_vehicles_container_unit');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'vehicles_carrier_id_fkey'), 'alter table public.tbl_vehicles rename constraint vehicles_carrier_id_fkey to fk_vehicles_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'vehicles_organization_id_fkey'), 'alter table public.tbl_vehicles rename constraint vehicles_organization_id_fkey to fk_vehicles_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'vehicles_pkey'), 'alter table public.tbl_vehicles rename constraint vehicles_pkey to pk_vehicles');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_vehicles', 'vehicles_organization_id_plate_key'), 'alter table public.tbl_vehicles rename constraint vehicles_organization_id_plate_key to uq_vehicles_organization_id_plate');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_auth_credentials', 'auth_credentials_pkey'), 'alter table public.tbl_auth_credentials rename constraint auth_credentials_pkey to pk_auth_credentials');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_auth_credentials', 'auth_credentials_email_key'), 'alter table public.tbl_auth_credentials rename constraint auth_credentials_email_key to uq_auth_credentials_email');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_license_types', 'driver_license_types_country_id_fkey'), 'alter table public.tbl_driver_license_types rename constraint driver_license_types_country_id_fkey to fk_driver_license_types_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_license_types', 'license_types_pkey'), 'alter table public.tbl_driver_license_types rename constraint license_types_pkey to pk_driver_license_types');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tariff_types', 'tariff_types_pkey'), 'alter table public.tbl_tariff_types rename constraint tariff_types_pkey to pk_tariff_types');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tariff_types', 'tariff_types_code_key'), 'alter table public.tbl_tariff_types rename constraint tariff_types_code_key to uq_tariff_types_code');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_addresses', 'addresses_country_id_fkey'), 'alter table public.tbl_addresses rename constraint addresses_country_id_fkey to fk_addresses_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_addresses', 'addresses_pkey'), 'alter table public.tbl_addresses rename constraint addresses_pkey to pk_addresses');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'delivery_points_zone_source_check'), 'alter table public.tbl_delivery_points rename constraint delivery_points_zone_source_check to ck_delivery_points_zone_source');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'delivery_points_address_id_fkey'), 'alter table public.tbl_delivery_points rename constraint delivery_points_address_id_fkey to fk_delivery_points_address_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'delivery_points_final_customer_id_fkey'), 'alter table public.tbl_delivery_points rename constraint delivery_points_final_customer_id_fkey to fk_delivery_points_final_customer_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'delivery_points_zone_id_fkey'), 'alter table public.tbl_delivery_points rename constraint delivery_points_zone_id_fkey to fk_delivery_points_zone_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_delivery_points', 'delivery_points_pkey'), 'alter table public.tbl_delivery_points rename constraint delivery_points_pkey to pk_delivery_points');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'contacts_exactly_one_parent'), 'alter table public.tbl_contacts rename constraint contacts_exactly_one_parent to ck_contacts_exactly_one_parent');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'contacts_delivery_point_id_fkey'), 'alter table public.tbl_contacts rename constraint contacts_delivery_point_id_fkey to fk_contacts_delivery_point_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'contacts_final_customer_id_fkey'), 'alter table public.tbl_contacts rename constraint contacts_final_customer_id_fkey to fk_contacts_final_customer_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_contacts', 'contacts_pkey'), 'alter table public.tbl_contacts rename constraint contacts_pkey to pk_contacts');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'driver_licenses_driver_id_fkey'), 'alter table public.tbl_driver_licenses rename constraint driver_licenses_driver_id_fkey to fk_driver_licenses_driver_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'driver_licenses_driver_license_type_id_fkey'), 'alter table public.tbl_driver_licenses rename constraint driver_licenses_driver_license_type_id_fkey to fk_driver_licenses_driver_license_type_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'driver_licenses_pkey'), 'alter table public.tbl_driver_licenses rename constraint driver_licenses_pkey to pk_driver_licenses');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_licenses', 'driver_licenses_driver_id_driver_license_type_id_key'), 'alter table public.tbl_driver_licenses rename constraint driver_licenses_driver_id_driver_license_type_id_key to uq_driver_licenses_driver_id_driver_license_type_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'user_scopes_app_user_id_fkey'), 'alter table public.tbl_user_scopes rename constraint user_scopes_app_user_id_fkey to fk_user_scopes_app_user_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'user_scopes_country_id_fkey'), 'alter table public.tbl_user_scopes rename constraint user_scopes_country_id_fkey to fk_user_scopes_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'user_scopes_customer_id_fkey'), 'alter table public.tbl_user_scopes rename constraint user_scopes_customer_id_fkey to fk_user_scopes_customer_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'user_scopes_role_id_fkey'), 'alter table public.tbl_user_scopes rename constraint user_scopes_role_id_fkey to fk_user_scopes_role_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'user_scopes_warehouse_id_fkey'), 'alter table public.tbl_user_scopes rename constraint user_scopes_warehouse_id_fkey to fk_user_scopes_warehouse_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_user_scopes', 'user_scopes_pkey'), 'alter table public.tbl_user_scopes rename constraint user_scopes_pkey to pk_user_scopes');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'wms_expediciones_final_customer_id_fkey'), 'alter table public.tbl_wms_expediciones rename constraint wms_expediciones_final_customer_id_fkey to fk_wms_expediciones_final_customer_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'wms_expediciones_organization_id_fkey'), 'alter table public.tbl_wms_expediciones rename constraint wms_expediciones_organization_id_fkey to fk_wms_expediciones_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'wms_expediciones_warehouse_id_fkey'), 'alter table public.tbl_wms_expediciones rename constraint wms_expediciones_warehouse_id_fkey to fk_wms_expediciones_warehouse_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones', 'wms_expediciones_pkey'), 'alter table public.tbl_wms_expediciones rename constraint wms_expediciones_pkey to pk_wms_expediciones');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_app_modules', 'app_modules_pkey'), 'alter table public.tbl_app_modules rename constraint app_modules_pkey to pk_app_modules');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'role_permissions_action_check'), 'alter table public.tbl_role_permissions rename constraint role_permissions_action_check to ck_role_permissions_action');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'role_permissions_module_key_fkey'), 'alter table public.tbl_role_permissions rename constraint role_permissions_module_key_fkey to fk_role_permissions_module_key');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'role_permissions_role_id_fkey'), 'alter table public.tbl_role_permissions rename constraint role_permissions_role_id_fkey to fk_role_permissions_role_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_permissions', 'role_permissions_pkey'), 'alter table public.tbl_role_permissions rename constraint role_permissions_pkey to pk_role_permissions');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_countries', 'role_countries_country_id_fkey'), 'alter table public.tbl_role_countries rename constraint role_countries_country_id_fkey to fk_role_countries_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_countries', 'role_countries_role_id_fkey'), 'alter table public.tbl_role_countries rename constraint role_countries_role_id_fkey to fk_role_countries_role_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_role_countries', 'role_countries_pkey'), 'alter table public.tbl_role_countries rename constraint role_countries_pkey to pk_role_countries');
select pg_temp.exec_if(pg_temp.con_on('audit.tbl_tracked_tables', 'tracked_tables_pkey'), 'alter table audit.tbl_tracked_tables rename constraint tracked_tables_pkey to pk_tracked_tables');
select pg_temp.exec_if(pg_temp.con_on('audit.tbl_events', 'events_actor_type_check1'), 'alter table audit.tbl_events rename constraint events_actor_type_check1 to ck_events_actor_type');
select pg_temp.exec_if(pg_temp.con_on('audit.tbl_events', 'events_pkey'), 'alter table audit.tbl_events rename constraint events_pkey to pk_events');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default_pkey', 'iI'), 'alter index audit.events_default_pkey rename to pk_events_default');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09_pkey', 'iI'), 'alter index audit.events_2026_09_pkey rename to pk_events_2026_09');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10_pkey', 'iI'), 'alter index audit.events_2026_10_pkey rename to pk_events_2026_10');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11_pkey', 'iI'), 'alter index audit.events_2026_11_pkey rename to pk_events_2026_11');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12_pkey', 'iI'), 'alter index audit.events_2026_12_pkey rename to pk_events_2026_12');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01_pkey', 'iI'), 'alter index audit.events_2027_01_pkey rename to pk_events_2027_01');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02_pkey', 'iI'), 'alter index audit.events_2027_02_pkey rename to pk_events_2027_02');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03_pkey', 'iI'), 'alter index audit.events_2027_03_pkey rename to pk_events_2027_03');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04_pkey', 'iI'), 'alter index audit.events_2027_04_pkey rename to pk_events_2027_04');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05_pkey', 'iI'), 'alter index audit.events_2027_05_pkey rename to pk_events_2027_05');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06_pkey', 'iI'), 'alter index audit.events_2027_06_pkey rename to pk_events_2027_06');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07_pkey', 'iI'), 'alter index audit.events_2027_07_pkey rename to pk_events_2027_07');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08_pkey', 'iI'), 'alter index audit.events_2027_08_pkey rename to pk_events_2027_08');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09_pkey', 'iI'), 'alter index audit.events_2027_09_pkey rename to pk_events_2027_09');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10_pkey', 'iI'), 'alter index audit.events_2027_10_pkey rename to pk_events_2027_10');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11_pkey', 'iI'), 'alter index audit.events_2027_11_pkey rename to pk_events_2027_11');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12_pkey', 'iI'), 'alter index audit.events_2027_12_pkey rename to pk_events_2027_12');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_status_check'), 'alter table public.tbl_route_plans rename constraint route_plans_status_check to ck_route_plans_status');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_country_id_fkey'), 'alter table public.tbl_route_plans rename constraint route_plans_country_id_fkey to fk_route_plans_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_created_by_fkey'), 'alter table public.tbl_route_plans rename constraint route_plans_created_by_fkey to fk_route_plans_created_by');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_customer_id_fkey'), 'alter table public.tbl_route_plans rename constraint route_plans_customer_id_fkey to fk_route_plans_customer_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_organization_id_fkey'), 'alter table public.tbl_route_plans rename constraint route_plans_organization_id_fkey to fk_route_plans_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_warehouse_id_fkey'), 'alter table public.tbl_route_plans rename constraint route_plans_warehouse_id_fkey to fk_route_plans_warehouse_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_route_plans', 'route_plans_pkey'), 'alter table public.tbl_route_plans rename constraint route_plans_pkey to pk_route_plans');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'plan_trips_status_check'), 'alter table public.tbl_plan_trips rename constraint plan_trips_status_check to ck_plan_trips_status');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'plan_trips_driver_id_fkey'), 'alter table public.tbl_plan_trips rename constraint plan_trips_driver_id_fkey to fk_plan_trips_driver_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'plan_trips_plan_id_fkey'), 'alter table public.tbl_plan_trips rename constraint plan_trips_plan_id_fkey to fk_plan_trips_plan_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'plan_trips_vehicle_id_fkey'), 'alter table public.tbl_plan_trips rename constraint plan_trips_vehicle_id_fkey to fk_plan_trips_vehicle_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_trips', 'plan_trips_pkey'), 'alter table public.tbl_plan_trips rename constraint plan_trips_pkey to pk_plan_trips');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_stops', 'plan_stops_order_id_fkey'), 'alter table public.tbl_plan_stops rename constraint plan_stops_order_id_fkey to fk_plan_stops_order_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_stops', 'plan_stops_trip_id_fkey'), 'alter table public.tbl_plan_stops rename constraint plan_stops_trip_id_fkey to fk_plan_stops_trip_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_plan_stops', 'plan_stops_pkey'), 'alter table public.tbl_plan_stops rename constraint plan_stops_pkey to pk_plan_stops');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_country_settings', 'tarifas_country_settings_country_id_fkey'), 'alter table public.tbl_tarifas_country_settings rename constraint tarifas_country_settings_country_id_fkey to fk_tarifas_country_settings_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_country_settings', 'tarifas_country_settings_pkey'), 'alter table public.tbl_tarifas_country_settings rename constraint tarifas_country_settings_pkey to pk_tarifas_country_settings');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_country_settings', 'tarifas_country_settings_country_id_key'), 'alter table public.tbl_tarifas_country_settings rename constraint tarifas_country_settings_country_id_key to uq_tarifas_country_settings_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_zone_groups', 'tarifas_zone_groups_country_id_fkey'), 'alter table public.tbl_tarifas_zone_groups rename constraint tarifas_zone_groups_country_id_fkey to fk_tarifas_zone_groups_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_zone_groups', 'tarifas_zone_groups_pkey'), 'alter table public.tbl_tarifas_zone_groups rename constraint tarifas_zone_groups_pkey to pk_tarifas_zone_groups');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlement_parties', 'tarifas_settlement_parties_carrier_id_fkey'), 'alter table public.tbl_tarifas_settlement_parties rename constraint tarifas_settlement_parties_carrier_id_fkey to fk_tarifas_settlement_parties_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlement_parties', 'tarifas_settlement_parties_pkey'), 'alter table public.tbl_tarifas_settlement_parties rename constraint tarifas_settlement_parties_pkey to pk_tarifas_settlement_parties');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlement_parties', 'tarifas_settlement_parties_carrier_id_key'), 'alter table public.tbl_tarifas_settlement_parties rename constraint tarifas_settlement_parties_carrier_id_key to uq_tarifas_settlement_parties_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_applies_to_base_check'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_applies_to_base_check to ck_tarifas_pricing_rules_applies_to_base');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_base_method_check'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_base_method_check to ck_tarifas_pricing_rules_base_method');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_category_check'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_category_check to ck_tarifas_pricing_rules_category');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_exclusive_only_base_check'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_exclusive_only_base_check to ck_tarifas_pricing_rules_exclusive_only_base');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_country_id_fkey'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_country_id_fkey to fk_tarifas_pricing_rules_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_party_id_fkey'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_party_id_fkey to fk_tarifas_pricing_rules_party_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_rules', 'tarifas_pricing_rules_pkey'), 'alter table public.tbl_tarifas_pricing_rules rename constraint tarifas_pricing_rules_pkey to pk_tarifas_pricing_rules');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_templates', 'tarifas_pricing_templates_country_id_fkey'), 'alter table public.tbl_tarifas_pricing_templates rename constraint tarifas_pricing_templates_country_id_fkey to fk_tarifas_pricing_templates_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_pricing_templates', 'tarifas_pricing_templates_pkey'), 'alter table public.tbl_tarifas_pricing_templates rename constraint tarifas_pricing_templates_pkey to pk_tarifas_pricing_templates');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_party_variables', 'tarifas_party_variables_party_id_fkey'), 'alter table public.tbl_tarifas_party_variables rename constraint tarifas_party_variables_party_id_fkey to fk_tarifas_party_variables_party_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_party_variables', 'tarifas_party_variables_pkey'), 'alter table public.tbl_tarifas_party_variables rename constraint tarifas_party_variables_pkey to pk_tarifas_party_variables');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'tarifas_settlements_country_id_fkey'), 'alter table public.tbl_tarifas_settlements rename constraint tarifas_settlements_country_id_fkey to fk_tarifas_settlements_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'tarifas_settlements_party_id_fkey'), 'alter table public.tbl_tarifas_settlements rename constraint tarifas_settlements_party_id_fkey to fk_tarifas_settlements_party_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'tarifas_settlements_trip_id_fkey'), 'alter table public.tbl_tarifas_settlements rename constraint tarifas_settlements_trip_id_fkey to fk_tarifas_settlements_trip_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_settlements', 'tarifas_settlements_pkey'), 'alter table public.tbl_tarifas_settlements rename constraint tarifas_settlements_pkey to pk_tarifas_settlements');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structures', 'tarifas_cost_structures_country_id_fkey'), 'alter table public.tbl_tarifas_cost_structures rename constraint tarifas_cost_structures_country_id_fkey to fk_tarifas_cost_structures_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structures', 'tarifas_cost_structures_party_id_fkey'), 'alter table public.tbl_tarifas_cost_structures rename constraint tarifas_cost_structures_party_id_fkey to fk_tarifas_cost_structures_party_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structures', 'tarifas_cost_structures_pkey'), 'alter table public.tbl_tarifas_cost_structures rename constraint tarifas_cost_structures_pkey to pk_tarifas_cost_structures');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structure_rows', 'tarifas_cost_structure_rows_structure_id_fkey'), 'alter table public.tbl_tarifas_cost_structure_rows rename constraint tarifas_cost_structure_rows_structure_id_fkey to fk_tarifas_cost_structure_rows_structure_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_cost_structure_rows', 'tarifas_cost_structure_rows_pkey'), 'alter table public.tbl_tarifas_cost_structure_rows rename constraint tarifas_cost_structure_rows_pkey to pk_tarifas_cost_structure_rows');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_tables', 'tarifas_rate_tables_country_id_fkey'), 'alter table public.tbl_tarifas_rate_tables rename constraint tarifas_rate_tables_country_id_fkey to fk_tarifas_rate_tables_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_tables', 'tarifas_rate_tables_party_id_fkey'), 'alter table public.tbl_tarifas_rate_tables rename constraint tarifas_rate_tables_party_id_fkey to fk_tarifas_rate_tables_party_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_tables', 'tarifas_rate_tables_pkey'), 'alter table public.tbl_tarifas_rate_tables rename constraint tarifas_rate_tables_pkey to pk_tarifas_rate_tables');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_table_rows', 'tarifas_rate_table_rows_table_id_fkey'), 'alter table public.tbl_tarifas_rate_table_rows rename constraint tarifas_rate_table_rows_table_id_fkey to fk_tarifas_rate_table_rows_table_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_rate_table_rows', 'tarifas_rate_table_rows_pkey'), 'alter table public.tbl_tarifas_rate_table_rows rename constraint tarifas_rate_table_rows_pkey to pk_tarifas_rate_table_rows');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_margin_policies', 'tarifas_margin_policies_country_id_fkey'), 'alter table public.tbl_tarifas_margin_policies rename constraint tarifas_margin_policies_country_id_fkey to fk_tarifas_margin_policies_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_margin_policies', 'tarifas_margin_policies_pkey'), 'alter table public.tbl_tarifas_margin_policies rename constraint tarifas_margin_policies_pkey to pk_tarifas_margin_policies');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_audit_log', 'tarifas_audit_log_pkey'), 'alter table public.tbl_tarifas_audit_log rename constraint tarifas_audit_log_pkey to pk_tarifas_audit_log');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_order_marks', 'tarifas_trip_order_marks_country_id_fkey'), 'alter table public.tbl_tarifas_trip_order_marks rename constraint tarifas_trip_order_marks_country_id_fkey to fk_tarifas_trip_order_marks_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_order_marks', 'tarifas_trip_order_marks_trip_id_fkey'), 'alter table public.tbl_tarifas_trip_order_marks rename constraint tarifas_trip_order_marks_trip_id_fkey to fk_tarifas_trip_order_marks_trip_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_order_marks', 'tarifas_trip_order_marks_pkey'), 'alter table public.tbl_tarifas_trip_order_marks rename constraint tarifas_trip_order_marks_pkey to pk_tarifas_trip_order_marks');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_battery_pct_check'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_battery_pct_check to ck_tracking_positions_battery_pct');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_heading_deg_check'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_heading_deg_check to ck_tracking_positions_heading_deg');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_latitude_check'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_latitude_check to ck_tracking_positions_latitude');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_longitude_check'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_longitude_check to ck_tracking_positions_longitude');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_speed_mps_check'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_speed_mps_check to ck_tracking_positions_speed_mps');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_driver_id_fkey'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_driver_id_fkey to fk_tracking_positions_driver_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_organization_id_fkey'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_organization_id_fkey to fk_tracking_positions_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_route_id_fkey'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_route_id_fkey to fk_tracking_positions_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_vehicle_id_fkey'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_vehicle_id_fkey to fk_tracking_positions_vehicle_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_positions', 'tracking_positions_pkey'), 'alter table public.tbl_tracking_positions rename constraint tracking_positions_pkey to pk_tracking_positions');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_last_positions', 'tracking_last_positions_organization_id_fkey'), 'alter table public.tbl_tracking_last_positions rename constraint tracking_last_positions_organization_id_fkey to fk_tracking_last_positions_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_last_positions', 'tracking_last_positions_route_id_fkey'), 'alter table public.tbl_tracking_last_positions rename constraint tracking_last_positions_route_id_fkey to fk_tracking_last_positions_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_last_positions', 'tracking_last_positions_pkey'), 'alter table public.tbl_tracking_last_positions rename constraint tracking_last_positions_pkey to pk_tracking_last_positions');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'tracking_evidences_dispatch_guide_id_fkey'), 'alter table public.tbl_tracking_evidences rename constraint tracking_evidences_dispatch_guide_id_fkey to fk_tracking_evidences_dispatch_guide_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'tracking_evidences_organization_id_fkey'), 'alter table public.tbl_tracking_evidences rename constraint tracking_evidences_organization_id_fkey to fk_tracking_evidences_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'tracking_evidences_route_id_fkey'), 'alter table public.tbl_tracking_evidences rename constraint tracking_evidences_route_id_fkey to fk_tracking_evidences_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_evidences', 'tracking_evidences_pkey'), 'alter table public.tbl_tracking_evidences rename constraint tracking_evidences_pkey to pk_tracking_evidences');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'tracking_reviews_organization_id_fkey'), 'alter table public.tbl_tracking_reviews rename constraint tracking_reviews_organization_id_fkey to fk_tracking_reviews_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'tracking_reviews_reviewed_by_fkey'), 'alter table public.tbl_tracking_reviews rename constraint tracking_reviews_reviewed_by_fkey to fk_tracking_reviews_reviewed_by');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'tracking_reviews_route_id_fkey'), 'alter table public.tbl_tracking_reviews rename constraint tracking_reviews_route_id_fkey to fk_tracking_reviews_route_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_reviews', 'tracking_reviews_pkey'), 'alter table public.tbl_tracking_reviews rename constraint tracking_reviews_pkey to pk_tracking_reviews');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones_detalle', 'wms_expediciones_detalle_expedicion_id_fkey'), 'alter table public.tbl_wms_expediciones_detalle rename constraint wms_expediciones_detalle_expedicion_id_fkey to fk_wms_expediciones_detalle_expedicion_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_wms_expediciones_detalle', 'wms_expediciones_detalle_pkey'), 'alter table public.tbl_wms_expediciones_detalle rename constraint wms_expediciones_detalle_pkey to pk_wms_expediciones_detalle');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'tracking_consents_app_user_id_fkey'), 'alter table public.tbl_tracking_consents rename constraint tracking_consents_app_user_id_fkey to fk_tracking_consents_app_user_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'tracking_consents_organization_id_fkey'), 'alter table public.tbl_tracking_consents rename constraint tracking_consents_organization_id_fkey to fk_tracking_consents_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'tracking_consents_pkey'), 'alter table public.tbl_tracking_consents rename constraint tracking_consents_pkey to pk_tracking_consents');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tracking_consents', 'tracking_consents_app_user_id_version_key'), 'alter table public.tbl_tracking_consents rename constraint tracking_consents_app_user_id_version_key to uq_tracking_consents_app_user_id_version');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_mobile_refresh_tokens', 'mobile_refresh_tokens_app_user_id_fkey'), 'alter table public.tbl_mobile_refresh_tokens rename constraint mobile_refresh_tokens_app_user_id_fkey to fk_mobile_refresh_tokens_app_user_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_mobile_refresh_tokens', 'mobile_refresh_tokens_pkey'), 'alter table public.tbl_mobile_refresh_tokens rename constraint mobile_refresh_tokens_pkey to pk_mobile_refresh_tokens');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_mobile_refresh_tokens', 'mobile_refresh_tokens_token_hash_key'), 'alter table public.tbl_mobile_refresh_tokens rename constraint mobile_refresh_tokens_token_hash_key to uq_mobile_refresh_tokens_token_hash');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proformas', 'tarifas_proformas_carrier_id_fkey'), 'alter table public.tbl_tarifas_proformas rename constraint tarifas_proformas_carrier_id_fkey to fk_tarifas_proformas_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proformas', 'tarifas_proformas_country_id_fkey'), 'alter table public.tbl_tarifas_proformas rename constraint tarifas_proformas_country_id_fkey to fk_tarifas_proformas_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proformas', 'tarifas_proformas_pkey'), 'alter table public.tbl_tarifas_proformas rename constraint tarifas_proformas_pkey to pk_tarifas_proformas');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_items', 'tarifas_proforma_items_proforma_id_fkey'), 'alter table public.tbl_tarifas_proforma_items rename constraint tarifas_proforma_items_proforma_id_fkey to fk_tarifas_proforma_items_proforma_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_items', 'tarifas_proforma_items_settlement_id_fkey'), 'alter table public.tbl_tarifas_proforma_items rename constraint tarifas_proforma_items_settlement_id_fkey to fk_tarifas_proforma_items_settlement_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_items', 'tarifas_proforma_items_pkey'), 'alter table public.tbl_tarifas_proforma_items rename constraint tarifas_proforma_items_pkey to pk_tarifas_proforma_items');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_phases', 'tarifas_proforma_phases_proforma_id_fkey'), 'alter table public.tbl_tarifas_proforma_phases rename constraint tarifas_proforma_phases_proforma_id_fkey to fk_tarifas_proforma_phases_proforma_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_phases', 'tarifas_proforma_phases_pkey'), 'alter table public.tbl_tarifas_proforma_phases rename constraint tarifas_proforma_phases_pkey to pk_tarifas_proforma_phases');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_flow_phases', 'tarifas_proforma_flow_phases_country_id_fkey'), 'alter table public.tbl_tarifas_proforma_flow_phases rename constraint tarifas_proforma_flow_phases_country_id_fkey to fk_tarifas_proforma_flow_phases_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_flow_phases', 'tarifas_proforma_flow_phases_pkey'), 'alter table public.tbl_tarifas_proforma_flow_phases rename constraint tarifas_proforma_flow_phases_pkey to pk_tarifas_proforma_flow_phases');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_email_config', 'tarifas_proforma_email_config_country_id_fkey'), 'alter table public.tbl_tarifas_proforma_email_config rename constraint tarifas_proforma_email_config_country_id_fkey to fk_tarifas_proforma_email_config_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_email_config', 'tarifas_proforma_email_config_pkey'), 'alter table public.tbl_tarifas_proforma_email_config rename constraint tarifas_proforma_email_config_pkey to pk_tarifas_proforma_email_config');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'tarifas_trip_tender_awards_amount_check'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint tarifas_trip_tender_awards_amount_check to ck_tarifas_trip_tender_awards_amount');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'tarifas_trip_tender_awards_carrier_id_fkey'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint tarifas_trip_tender_awards_carrier_id_fkey to fk_tarifas_trip_tender_awards_carrier_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'tarifas_trip_tender_awards_country_id_fkey'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint tarifas_trip_tender_awards_country_id_fkey to fk_tarifas_trip_tender_awards_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'tarifas_trip_tender_awards_trip_id_fkey'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint tarifas_trip_tender_awards_trip_id_fkey to fk_tarifas_trip_tender_awards_trip_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_trip_tender_awards', 'tarifas_trip_tender_awards_pkey'), 'alter table public.tbl_tarifas_trip_tender_awards rename constraint tarifas_trip_tender_awards_pkey to pk_tarifas_trip_tender_awards');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'driver_presence_battery_pct_check'), 'alter table public.tbl_driver_presence rename constraint driver_presence_battery_pct_check to ck_driver_presence_battery_pct');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'driver_presence_last_event_check'), 'alter table public.tbl_driver_presence rename constraint driver_presence_last_event_check to ck_driver_presence_last_event');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'driver_presence_status_check'), 'alter table public.tbl_driver_presence rename constraint driver_presence_status_check to ck_driver_presence_status');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'driver_presence_driver_id_fkey'), 'alter table public.tbl_driver_presence rename constraint driver_presence_driver_id_fkey to fk_driver_presence_driver_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'driver_presence_organization_id_fkey'), 'alter table public.tbl_driver_presence rename constraint driver_presence_organization_id_fkey to fk_driver_presence_organization_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_driver_presence', 'driver_presence_pkey'), 'alter table public.tbl_driver_presence rename constraint driver_presence_pkey to pk_driver_presence');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_claims', 'tarifas_proforma_claims_country_id_fkey'), 'alter table public.tbl_tarifas_proforma_claims rename constraint tarifas_proforma_claims_country_id_fkey to fk_tarifas_proforma_claims_country_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_claims', 'tarifas_proforma_claims_proforma_id_fkey'), 'alter table public.tbl_tarifas_proforma_claims rename constraint tarifas_proforma_claims_proforma_id_fkey to fk_tarifas_proforma_claims_proforma_id');
select pg_temp.exec_if(pg_temp.con_on('public.tbl_tarifas_proforma_claims', 'tarifas_proforma_claims_pkey'), 'alter table public.tbl_tarifas_proforma_claims rename constraint tarifas_proforma_claims_pkey to pk_tarifas_proforma_claims');

-- 3) Índices sueltos → idx_/uidx_
select pg_temp.exec_if(pg_temp.rel_is('public.customers_name_trgm', 'iI'), 'alter index public.customers_name_trgm rename to idx_customers_name_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.dispatch_guides_guide_number_trgm', 'iI'), 'alter index public.dispatch_guides_guide_number_trgm rename to idx_dispatch_guides_guide_number_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_drivers_full_name_trgm', 'iI'), 'alter index public.ix_drivers_full_name_trgm rename to idx_drivers_full_name_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.ux_drivers_app_user', 'iI'), 'alter index public.ux_drivers_app_user rename to uidx_drivers_app_user');
select pg_temp.exec_if(pg_temp.rel_is('public.orders_order_number_trgm', 'iI'), 'alter index public.orders_order_number_trgm rename to idx_orders_order_number_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.zones_country_code_key', 'iI'), 'alter index public.zones_country_code_key rename to uidx_zones_country_code');
select pg_temp.exec_if(pg_temp.rel_is('public.zones_country_id_idx', 'iI'), 'alter index public.zones_country_id_idx rename to idx_zones_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_routes_driver_org', 'iI'), 'alter index public.ix_routes_driver_org rename to idx_routes_driver_org');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_routes_org_sort', 'iI'), 'alter index public.ix_routes_org_sort rename to idx_routes_org_sort');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_routes_route_number_trgm', 'iI'), 'alter index public.ix_routes_route_number_trgm rename to idx_routes_route_number_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_routes_status_lower', 'iI'), 'alter index public.ix_routes_status_lower rename to idx_routes_status_lower');
select pg_temp.exec_if(pg_temp.rel_is('public.ux_routes_plan_trip', 'iI'), 'alter index public.ux_routes_plan_trip rename to uidx_routes_plan_trip');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_events_route_time', 'iI'), 'alter index public.ix_tracking_events_route_time rename to idx_tracking_events_route_time');
select pg_temp.exec_if(pg_temp.rel_is('public.ux_tracking_events_client', 'iI'), 'alter index public.ux_tracking_events_client rename to uidx_tracking_events_client');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_vehicles_plate_trgm', 'iI'), 'alter index public.ix_vehicles_plate_trgm rename to idx_vehicles_plate_trgm');
select pg_temp.exec_if(pg_temp.rel_is('public.driver_license_types_country_code_key', 'iI'), 'alter index public.driver_license_types_country_code_key rename to uidx_driver_license_types_country_code');
select pg_temp.exec_if(pg_temp.rel_is('public.delivery_points_final_customer_external_code_key', 'iI'), 'alter index public.delivery_points_final_customer_external_code_key rename to uidx_delivery_points_final_customer_external_code');
select pg_temp.exec_if(pg_temp.rel_is('public.delivery_points_final_customer_id_idx', 'iI'), 'alter index public.delivery_points_final_customer_id_idx rename to idx_delivery_points_final_customer_id');
select pg_temp.exec_if(pg_temp.rel_is('public.delivery_points_one_default_per_final_customer', 'iI'), 'alter index public.delivery_points_one_default_per_final_customer rename to uidx_delivery_points_one_default_per_final_customer');
select pg_temp.exec_if(pg_temp.rel_is('public.delivery_points_zone_id_idx', 'iI'), 'alter index public.delivery_points_zone_id_idx rename to idx_delivery_points_zone_id');
select pg_temp.exec_if(pg_temp.rel_is('public.user_scopes_app_user_id_idx', 'iI'), 'alter index public.user_scopes_app_user_id_idx rename to idx_user_scopes_app_user_id');
select pg_temp.exec_if(pg_temp.rel_is('public.user_scopes_country_id_idx', 'iI'), 'alter index public.user_scopes_country_id_idx rename to idx_user_scopes_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.user_scopes_customer_id_idx', 'iI'), 'alter index public.user_scopes_customer_id_idx rename to idx_user_scopes_customer_id');
select pg_temp.exec_if(pg_temp.rel_is('public.user_scopes_warehouse_id_idx', 'iI'), 'alter index public.user_scopes_warehouse_id_idx rename to idx_user_scopes_warehouse_id');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones_id_compania_idx', 'iI'), 'alter index public.wms_expediciones_id_compania_idx rename to idx_wms_expediciones_id_compania');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones_natural_key', 'iI'), 'alter index public.wms_expediciones_natural_key rename to uidx_wms_expediciones_natural');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones_situacion_idx', 'iI'), 'alter index public.wms_expediciones_situacion_idx rename to idx_wms_expediciones_situacion');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_expediciones_warehouse_id_idx', 'iI'), 'alter index public.wms_expediciones_warehouse_id_idx rename to idx_wms_expediciones_warehouse_id');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_action_idx', 'iI'), 'alter index audit.events_action_idx rename to idx_events_action');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_app_user_idx', 'iI'), 'alter index audit.events_app_user_idx rename to idx_events_app_user');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_entity_idx', 'iI'), 'alter index audit.events_entity_idx rename to idx_events_entity');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_module_idx', 'iI'), 'alter index audit.events_module_idx rename to idx_events_module');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_occurred_at_idx', 'iI'), 'alter index audit.events_occurred_at_idx rename to idx_events_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default_action_occurred_at_idx', 'iI'), 'alter index audit.events_default_action_occurred_at_idx rename to idx_events_default_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_default_app_user_id_occurred_at_idx rename to idx_events_default_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_default_entity_table_entity_id_occurred_at_idx rename to idx_events_default_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_default_module_key_occurred_at_idx rename to idx_events_default_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_default_occurred_at_idx', 'iI'), 'alter index audit.events_default_occurred_at_idx rename to idx_events_default_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09_action_occurred_at_idx', 'iI'), 'alter index audit.events_2026_09_action_occurred_at_idx rename to idx_events_2026_09_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_09_app_user_id_occurred_at_idx rename to idx_events_2026_09_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_09_entity_table_entity_id_occurred_at_idx rename to idx_events_2026_09_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2026_09_module_key_occurred_at_idx rename to idx_events_2026_09_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_09_occurred_at_idx', 'iI'), 'alter index audit.events_2026_09_occurred_at_idx rename to idx_events_2026_09_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10_action_occurred_at_idx', 'iI'), 'alter index audit.events_2026_10_action_occurred_at_idx rename to idx_events_2026_10_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_10_app_user_id_occurred_at_idx rename to idx_events_2026_10_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_10_entity_table_entity_id_occurred_at_idx rename to idx_events_2026_10_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2026_10_module_key_occurred_at_idx rename to idx_events_2026_10_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_10_occurred_at_idx', 'iI'), 'alter index audit.events_2026_10_occurred_at_idx rename to idx_events_2026_10_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11_action_occurred_at_idx', 'iI'), 'alter index audit.events_2026_11_action_occurred_at_idx rename to idx_events_2026_11_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_11_app_user_id_occurred_at_idx rename to idx_events_2026_11_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_11_entity_table_entity_id_occurred_at_idx rename to idx_events_2026_11_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2026_11_module_key_occurred_at_idx rename to idx_events_2026_11_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_11_occurred_at_idx', 'iI'), 'alter index audit.events_2026_11_occurred_at_idx rename to idx_events_2026_11_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12_action_occurred_at_idx', 'iI'), 'alter index audit.events_2026_12_action_occurred_at_idx rename to idx_events_2026_12_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_12_app_user_id_occurred_at_idx rename to idx_events_2026_12_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2026_12_entity_table_entity_id_occurred_at_idx rename to idx_events_2026_12_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2026_12_module_key_occurred_at_idx rename to idx_events_2026_12_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2026_12_occurred_at_idx', 'iI'), 'alter index audit.events_2026_12_occurred_at_idx rename to idx_events_2026_12_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_01_action_occurred_at_idx rename to idx_events_2027_01_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_01_app_user_id_occurred_at_idx rename to idx_events_2027_01_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_01_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_01_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_01_module_key_occurred_at_idx rename to idx_events_2027_01_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_01_occurred_at_idx', 'iI'), 'alter index audit.events_2027_01_occurred_at_idx rename to idx_events_2027_01_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_02_action_occurred_at_idx rename to idx_events_2027_02_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_02_app_user_id_occurred_at_idx rename to idx_events_2027_02_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_02_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_02_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_02_module_key_occurred_at_idx rename to idx_events_2027_02_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_02_occurred_at_idx', 'iI'), 'alter index audit.events_2027_02_occurred_at_idx rename to idx_events_2027_02_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_03_action_occurred_at_idx rename to idx_events_2027_03_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_03_app_user_id_occurred_at_idx rename to idx_events_2027_03_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_03_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_03_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_03_module_key_occurred_at_idx rename to idx_events_2027_03_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_03_occurred_at_idx', 'iI'), 'alter index audit.events_2027_03_occurred_at_idx rename to idx_events_2027_03_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_04_action_occurred_at_idx rename to idx_events_2027_04_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_04_app_user_id_occurred_at_idx rename to idx_events_2027_04_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_04_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_04_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_04_module_key_occurred_at_idx rename to idx_events_2027_04_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_04_occurred_at_idx', 'iI'), 'alter index audit.events_2027_04_occurred_at_idx rename to idx_events_2027_04_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_05_action_occurred_at_idx rename to idx_events_2027_05_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_05_app_user_id_occurred_at_idx rename to idx_events_2027_05_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_05_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_05_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_05_module_key_occurred_at_idx rename to idx_events_2027_05_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_05_occurred_at_idx', 'iI'), 'alter index audit.events_2027_05_occurred_at_idx rename to idx_events_2027_05_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_06_action_occurred_at_idx rename to idx_events_2027_06_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_06_app_user_id_occurred_at_idx rename to idx_events_2027_06_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_06_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_06_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_06_module_key_occurred_at_idx rename to idx_events_2027_06_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_06_occurred_at_idx', 'iI'), 'alter index audit.events_2027_06_occurred_at_idx rename to idx_events_2027_06_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_07_action_occurred_at_idx rename to idx_events_2027_07_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_07_app_user_id_occurred_at_idx rename to idx_events_2027_07_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_07_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_07_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_07_module_key_occurred_at_idx rename to idx_events_2027_07_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_07_occurred_at_idx', 'iI'), 'alter index audit.events_2027_07_occurred_at_idx rename to idx_events_2027_07_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_08_action_occurred_at_idx rename to idx_events_2027_08_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_08_app_user_id_occurred_at_idx rename to idx_events_2027_08_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_08_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_08_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_08_module_key_occurred_at_idx rename to idx_events_2027_08_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_08_occurred_at_idx', 'iI'), 'alter index audit.events_2027_08_occurred_at_idx rename to idx_events_2027_08_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_09_action_occurred_at_idx rename to idx_events_2027_09_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_09_app_user_id_occurred_at_idx rename to idx_events_2027_09_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_09_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_09_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_09_module_key_occurred_at_idx rename to idx_events_2027_09_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_09_occurred_at_idx', 'iI'), 'alter index audit.events_2027_09_occurred_at_idx rename to idx_events_2027_09_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_10_action_occurred_at_idx rename to idx_events_2027_10_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_10_app_user_id_occurred_at_idx rename to idx_events_2027_10_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_10_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_10_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_10_module_key_occurred_at_idx rename to idx_events_2027_10_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_10_occurred_at_idx', 'iI'), 'alter index audit.events_2027_10_occurred_at_idx rename to idx_events_2027_10_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_11_action_occurred_at_idx rename to idx_events_2027_11_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_11_app_user_id_occurred_at_idx rename to idx_events_2027_11_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_11_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_11_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_11_module_key_occurred_at_idx rename to idx_events_2027_11_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_11_occurred_at_idx', 'iI'), 'alter index audit.events_2027_11_occurred_at_idx rename to idx_events_2027_11_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12_action_occurred_at_idx', 'iI'), 'alter index audit.events_2027_12_action_occurred_at_idx rename to idx_events_2027_12_action_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12_app_user_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_12_app_user_id_occurred_at_idx rename to idx_events_2027_12_app_user_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12_entity_table_entity_id_occurred_at_idx', 'iI'), 'alter index audit.events_2027_12_entity_table_entity_id_occurred_at_idx rename to idx_events_2027_12_entity_table_entity_id_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12_module_key_occurred_at_idx', 'iI'), 'alter index audit.events_2027_12_module_key_occurred_at_idx rename to idx_events_2027_12_module_key_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('audit.events_2027_12_occurred_at_idx', 'iI'), 'alter index audit.events_2027_12_occurred_at_idx rename to idx_events_2027_12_occurred_at');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_route_plans_customer', 'iI'), 'alter index public.ix_route_plans_customer rename to idx_route_plans_customer');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_route_plans_wh_date_status', 'iI'), 'alter index public.ix_route_plans_wh_date_status rename to idx_route_plans_wh_date_status');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_plan_trips_plan', 'iI'), 'alter index public.ix_plan_trips_plan rename to idx_plan_trips_plan');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_plan_stops_trip', 'iI'), 'alter index public.ix_plan_stops_trip rename to idx_plan_stops_trip');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_zone_groups_country_id_idx', 'iI'), 'alter index public.tarifas_zone_groups_country_id_idx rename to idx_tarifas_zone_groups_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_rules_country_id_idx', 'iI'), 'alter index public.tarifas_pricing_rules_country_id_idx rename to idx_tarifas_pricing_rules_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_rules_party_id_idx', 'iI'), 'alter index public.tarifas_pricing_rules_party_id_idx rename to idx_tarifas_pricing_rules_party_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_pricing_templates_country_id_idx', 'iI'), 'alter index public.tarifas_pricing_templates_country_id_idx rename to idx_tarifas_pricing_templates_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_party_variables_key_idx', 'iI'), 'alter index public.tarifas_party_variables_key_idx rename to idx_tarifas_party_variables_key');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_party_variables_party_id_idx', 'iI'), 'alter index public.tarifas_party_variables_party_id_idx rename to idx_tarifas_party_variables_party_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_country_date_idx', 'iI'), 'alter index public.tarifas_settlements_country_date_idx rename to idx_tarifas_settlements_country_date');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_country_number_uq', 'iI'), 'alter index public.tarifas_settlements_country_number_uq rename to uidx_tarifas_settlements_country_number_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_party_id_idx', 'iI'), 'alter index public.tarifas_settlements_party_id_idx rename to idx_tarifas_settlements_party_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_superseded_by_idx', 'iI'), 'alter index public.tarifas_settlements_superseded_by_idx rename to idx_tarifas_settlements_superseded_by');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_trip_id_idx', 'iI'), 'alter index public.tarifas_settlements_trip_id_idx rename to idx_tarifas_settlements_trip_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_trip_number_idx', 'iI'), 'alter index public.tarifas_settlements_trip_number_idx rename to idx_tarifas_settlements_trip_number');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_settlements_trip_vigente_uq', 'iI'), 'alter index public.tarifas_settlements_trip_vigente_uq rename to uidx_tarifas_settlements_trip_vigente_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structures_country_id_idx', 'iI'), 'alter index public.tarifas_cost_structures_country_id_idx rename to idx_tarifas_cost_structures_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structures_party_id_idx', 'iI'), 'alter index public.tarifas_cost_structures_party_id_idx rename to idx_tarifas_cost_structures_party_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_cost_structure_rows_structure_id_idx', 'iI'), 'alter index public.tarifas_cost_structure_rows_structure_id_idx rename to idx_tarifas_cost_structure_rows_structure_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_tables_code_idx', 'iI'), 'alter index public.tarifas_rate_tables_code_idx rename to idx_tarifas_rate_tables_code');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_tables_country_id_idx', 'iI'), 'alter index public.tarifas_rate_tables_country_id_idx rename to idx_tarifas_rate_tables_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_tables_party_id_idx', 'iI'), 'alter index public.tarifas_rate_tables_party_id_idx rename to idx_tarifas_rate_tables_party_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_rate_table_rows_table_id_idx', 'iI'), 'alter index public.tarifas_rate_table_rows_table_id_idx rename to idx_tarifas_rate_table_rows_table_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_margin_policies_country_id_idx', 'iI'), 'alter index public.tarifas_margin_policies_country_id_idx rename to idx_tarifas_margin_policies_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_audit_log_created_at_idx', 'iI'), 'alter index public.tarifas_audit_log_created_at_idx rename to idx_tarifas_audit_log_created_at');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_audit_log_entity_id_idx', 'iI'), 'alter index public.tarifas_audit_log_entity_id_idx rename to idx_tarifas_audit_log_entity_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_audit_log_entity_idx', 'iI'), 'alter index public.tarifas_audit_log_entity_idx rename to idx_tarifas_audit_log_entity');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_order_marks_country_id_idx', 'iI'), 'alter index public.tarifas_trip_order_marks_country_id_idx rename to idx_tarifas_trip_order_marks_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_order_marks_trip_id_idx', 'iI'), 'alter index public.tarifas_trip_order_marks_trip_id_idx rename to idx_tarifas_trip_order_marks_trip_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_order_marks_uq', 'iI'), 'alter index public.tarifas_trip_order_marks_uq rename to uidx_tarifas_trip_order_marks_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_positions_route_time', 'iI'), 'alter index public.ix_tracking_positions_route_time rename to idx_tracking_positions_route_time');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_positions_time', 'iI'), 'alter index public.ix_tracking_positions_time rename to idx_tracking_positions_time');
select pg_temp.exec_if(pg_temp.rel_is('public.ux_tracking_positions_client', 'iI'), 'alter index public.ux_tracking_positions_client rename to uidx_tracking_positions_client');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_last_positions_org', 'iI'), 'alter index public.ix_tracking_last_positions_org rename to idx_tracking_last_positions_org');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_evidences_guide', 'iI'), 'alter index public.ix_tracking_evidences_guide rename to idx_tracking_evidences_guide');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_evidences_route', 'iI'), 'alter index public.ix_tracking_evidences_route rename to idx_tracking_evidences_route');
select pg_temp.exec_if(pg_temp.rel_is('public.ux_tracking_evidences_client', 'iI'), 'alter index public.ux_tracking_evidences_client rename to uidx_tracking_evidences_client');
select pg_temp.exec_if(pg_temp.rel_is('public.ux_tracking_evidences_key', 'iI'), 'alter index public.ux_tracking_evidences_key rename to uidx_tracking_evidences_key');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_reviews_org', 'iI'), 'alter index public.ix_tracking_reviews_org rename to idx_tracking_reviews_org');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_exp_detalle_articulo_idx', 'iI'), 'alter index public.wms_exp_detalle_articulo_idx rename to idx_wms_expediciones_detalle_wms_exp_detalle_articulo');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_exp_detalle_expedicion_idx', 'iI'), 'alter index public.wms_exp_detalle_expedicion_idx rename to idx_wms_expediciones_detalle_wms_exp_detalle_expedicion');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_exp_detalle_natural_key', 'iI'), 'alter index public.wms_exp_detalle_natural_key rename to uidx_wms_expediciones_detalle_wms_exp_detalle_natural');
select pg_temp.exec_if(pg_temp.rel_is('public.wms_exp_detalle_prioridad_idx', 'iI'), 'alter index public.wms_exp_detalle_prioridad_idx rename to idx_wms_expediciones_detalle_wms_exp_detalle_prioridad');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_tracking_consents_org', 'iI'), 'alter index public.ix_tracking_consents_org rename to idx_tracking_consents_org');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_mobile_refresh_expires', 'iI'), 'alter index public.ix_mobile_refresh_expires rename to idx_mobile_refresh_tokens_mobile_refresh_expires');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_mobile_refresh_user', 'iI'), 'alter index public.ix_mobile_refresh_user rename to idx_mobile_refresh_tokens_mobile_refresh_user');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proformas_carrier_id_idx', 'iI'), 'alter index public.tarifas_proformas_carrier_id_idx rename to idx_tarifas_proformas_carrier_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proformas_country_id_idx', 'iI'), 'alter index public.tarifas_proformas_country_id_idx rename to idx_tarifas_proformas_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proformas_country_number_uq', 'iI'), 'alter index public.tarifas_proformas_country_number_uq rename to uidx_tarifas_proformas_country_number_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proformas_status_idx', 'iI'), 'alter index public.tarifas_proformas_status_idx rename to idx_tarifas_proformas_status');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_items_proforma_id_idx', 'iI'), 'alter index public.tarifas_proforma_items_proforma_id_idx rename to idx_tarifas_proforma_items_proforma_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_items_settlement_id_idx', 'iI'), 'alter index public.tarifas_proforma_items_settlement_id_idx rename to idx_tarifas_proforma_items_settlement_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_items_settlement_incluida_uq', 'iI'), 'alter index public.tarifas_proforma_items_settlement_incluida_uq rename to uidx_tarifas_proforma_items_settlement_incluida_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_phases_proforma_id_idx', 'iI'), 'alter index public.tarifas_proforma_phases_proforma_id_idx rename to idx_tarifas_proforma_phases_proforma_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_phases_state_idx', 'iI'), 'alter index public.tarifas_proforma_phases_state_idx rename to idx_tarifas_proforma_phases_state');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_flow_phases_country_id_idx', 'iI'), 'alter index public.tarifas_proforma_flow_phases_country_id_idx rename to idx_tarifas_proforma_flow_phases_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_email_config_country_uq', 'iI'), 'alter index public.tarifas_proforma_email_config_country_uq rename to uidx_tarifas_proforma_email_config_country_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_tender_awards_carrier_id_idx', 'iI'), 'alter index public.tarifas_trip_tender_awards_carrier_id_idx rename to idx_tarifas_trip_tender_awards_carrier_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_tender_awards_country_id_idx', 'iI'), 'alter index public.tarifas_trip_tender_awards_country_id_idx rename to idx_tarifas_trip_tender_awards_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_tender_awards_trip_id_idx', 'iI'), 'alter index public.tarifas_trip_tender_awards_trip_id_idx rename to idx_tarifas_trip_tender_awards_trip_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_trip_tender_awards_uq', 'iI'), 'alter index public.tarifas_trip_tender_awards_uq rename to uidx_tarifas_trip_tender_awards_uq');
select pg_temp.exec_if(pg_temp.rel_is('public.ix_driver_presence_org', 'iI'), 'alter index public.ix_driver_presence_org rename to idx_driver_presence_org');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_claims_country_id_idx', 'iI'), 'alter index public.tarifas_proforma_claims_country_id_idx rename to idx_tarifas_proforma_claims_country_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_claims_created_at_idx', 'iI'), 'alter index public.tarifas_proforma_claims_created_at_idx rename to idx_tarifas_proforma_claims_created_at');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_claims_proforma_id_idx', 'iI'), 'alter index public.tarifas_proforma_claims_proforma_id_idx rename to idx_tarifas_proforma_claims_proforma_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_proforma_claims_status_idx', 'iI'), 'alter index public.tarifas_proforma_claims_status_idx rename to idx_tarifas_proforma_claims_status');

-- 4) Triggers → trg_ (los clones de las particiones se renombran con el padre)
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_app_users', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_app_users rename to trg_app_users_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_carriers', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_carriers rename to trg_carriers_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_contract_documents', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_contract_documents rename to trg_contract_documents_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_contracts', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_contracts rename to trg_contracts_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_costos_fijos', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_costos_fijos rename to trg_costos_fijos_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_costos_variables', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_costos_variables rename to trg_costos_variables_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_countries', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_countries rename to trg_countries_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_customers', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_customers rename to trg_customers_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_depreciacion', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_depreciacion rename to trg_depreciacion_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_dispatch_guides', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_dispatch_guides rename to trg_dispatch_guides_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_drivers', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_drivers rename to trg_drivers_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_order_items', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_order_items rename to trg_order_items_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_orders', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_orders rename to trg_orders_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_organizations', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_organizations rename to trg_organizations_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_parametros_globales', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_parametros_globales rename to trg_parametros_globales_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_rates', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_rates rename to trg_rates_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_returns', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_returns rename to trg_returns_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_roles', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_roles rename to trg_roles_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_zones', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_zones rename to trg_zones_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_zones', 'zones_reassign_points_trg'), 'alter trigger zones_reassign_points_trg on public.tbl_zones rename to trg_zones_reassign_points');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_routes', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_routes rename to trg_routes_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_rutas_costeo', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_rutas_costeo rename to trg_rutas_costeo_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_settlements', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_settlements rename to trg_settlements_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_sku_cotizaciones', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_sku_cotizaciones rename to trg_sku_cotizaciones_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_stores', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_stores rename to trg_stores_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tipos_camion', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tipos_camion rename to trg_tipos_camion_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tracking_events', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tracking_events rename to trg_tracking_events_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_vehicle_types', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_vehicle_types rename to trg_vehicle_types_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_vehicles', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_vehicles rename to trg_vehicles_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_auth_credentials', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_auth_credentials rename to trg_auth_credentials_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_driver_license_types', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_driver_license_types rename to trg_driver_license_types_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tariff_types', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tariff_types rename to trg_tariff_types_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_warehouses', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_warehouses rename to trg_warehouses_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_addresses', 'addresses_reassign_point_trg'), 'alter trigger addresses_reassign_point_trg on public.tbl_addresses rename to trg_addresses_reassign_point');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_addresses', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_addresses rename to trg_addresses_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_final_customers', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_final_customers rename to trg_final_customers_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_delivery_points', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_delivery_points rename to trg_delivery_points_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_delivery_points', 'delivery_points_zone_source_trg'), 'alter trigger delivery_points_zone_source_trg on public.tbl_delivery_points rename to trg_delivery_points_zone_source');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_contacts', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_contacts rename to trg_contacts_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_driver_licenses', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_driver_licenses rename to trg_driver_licenses_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_user_scopes', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_user_scopes rename to trg_user_scopes_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_wms_expediciones', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_wms_expediciones rename to trg_wms_expediciones_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_app_modules', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_app_modules rename to trg_app_modules_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_role_permissions', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_role_permissions rename to trg_role_permissions_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_role_countries', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_role_countries rename to trg_role_countries_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events', 'events_append_only'), 'alter trigger events_append_only on audit.tbl_events rename to trg_events_append_only');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events rename to trg_events_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_default', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_default rename to trg_events_default_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_09', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2026_09 rename to trg_events_2026_09_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_10', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2026_10 rename to trg_events_2026_10_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_11', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2026_11 rename to trg_events_2026_11_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2026_12', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2026_12 rename to trg_events_2026_12_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_01', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_01 rename to trg_events_2027_01_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_02', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_02 rename to trg_events_2027_02_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_03', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_03 rename to trg_events_2027_03_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_04', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_04 rename to trg_events_2027_04_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_05', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_05 rename to trg_events_2027_05_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_06', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_06 rename to trg_events_2027_06_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_07', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_07 rename to trg_events_2027_07_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_08', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_08 rename to trg_events_2027_08_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_09', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_09 rename to trg_events_2027_09_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_10', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_10 rename to trg_events_2027_10_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_11', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_11 rename to trg_events_2027_11_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('audit.tbl_events_2027_12', 'events_no_truncate'), 'alter trigger events_no_truncate on audit.tbl_events_2027_12 rename to trg_events_2027_12_no_truncate');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_country_settings', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_country_settings rename to trg_tarifas_country_settings_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_zone_groups', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_zone_groups rename to trg_tarifas_zone_groups_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_settlement_parties', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_settlement_parties rename to trg_tarifas_settlement_parties_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_pricing_rules', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_pricing_rules rename to trg_tarifas_pricing_rules_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_pricing_templates', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_pricing_templates rename to trg_tarifas_pricing_templates_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_party_variables', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_party_variables rename to trg_tarifas_party_variables_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_settlements', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_settlements rename to trg_tarifas_settlements_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_cost_structures', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_cost_structures rename to trg_tarifas_cost_structures_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_cost_structure_rows', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_cost_structure_rows rename to trg_tarifas_cost_structure_rows_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_rate_tables', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_rate_tables rename to trg_tarifas_rate_tables_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_rate_table_rows', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_rate_table_rows rename to trg_tarifas_rate_table_rows_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_margin_policies', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_margin_policies rename to trg_tarifas_margin_policies_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_audit_log', 'tarifas_audit_log_append_only'), 'alter trigger tarifas_audit_log_append_only on public.tbl_tarifas_audit_log rename to trg_tarifas_audit_log_append_only');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_trip_order_marks', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_trip_order_marks rename to trg_tarifas_trip_order_marks_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_branches', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_branches rename to trg_branches_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tracking_evidences', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tracking_evidences rename to trg_tracking_evidences_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tracking_reviews', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tracking_reviews rename to trg_tracking_reviews_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proformas', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_proformas rename to trg_tarifas_proformas_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_items', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_proforma_items rename to trg_tarifas_proforma_items_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_phases', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_proforma_phases rename to trg_tarifas_proforma_phases_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_flow_phases', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_proforma_flow_phases rename to trg_tarifas_proforma_flow_phases_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_email_config', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_proforma_email_config rename to trg_tarifas_proforma_email_config_audit_row_change');
select pg_temp.exec_if(pg_temp.trg_on('public.tbl_tarifas_proforma_claims', 'audit_row_change'), 'alter trigger audit_row_change on public.tbl_tarifas_proforma_claims rename to trg_tarifas_proforma_claims_audit_row_change');

-- 5) Secuencias → seq_ (los default nextval() y las identity van por OID: siguen funcionando)
select pg_temp.exec_if(pg_temp.rel_is('audit.event_ids', 'S'), 'alter sequence audit.event_ids rename to seq_events_id');
select pg_temp.exec_if(pg_temp.rel_is('public.costos_fijos_id_seq', 'S'), 'alter sequence public.costos_fijos_id_seq rename to seq_costos_fijos_id');
select pg_temp.exec_if(pg_temp.rel_is('public.costos_variables_id_seq', 'S'), 'alter sequence public.costos_variables_id_seq rename to seq_costos_variables_id');
select pg_temp.exec_if(pg_temp.rel_is('public.tracking_positions_id_seq', 'S'), 'alter sequence public.tracking_positions_id_seq rename to seq_tracking_positions_id');

-- 6) Vistas propias → vw_
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_devoluciones', 'v') and to_regclass('public.vw_tarifas_devoluciones') is null, 'alter view public.tarifas_v_devoluciones rename to vw_tarifas_devoluciones');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_viaje_cargas', 'v') and to_regclass('public.vw_tarifas_viaje_cargas') is null, 'alter view public.tarifas_v_viaje_cargas rename to vw_tarifas_viaje_cargas');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_viaje_pedidos', 'v') and to_regclass('public.vw_tarifas_viaje_pedidos') is null, 'alter view public.tarifas_v_viaje_pedidos rename to vw_tarifas_viaje_pedidos');
select pg_temp.exec_if(pg_temp.rel_is('public.tarifas_v_viajes', 'v') and to_regclass('public.vw_tarifas_viajes') is null, 'alter view public.tarifas_v_viajes rename to vw_tarifas_viajes');
select pg_temp.exec_if(pg_temp.rel_is('public.v_costo_fijo_mensual', 'v') and to_regclass('public.vw_costo_fijo_mensual') is null, 'alter view public.v_costo_fijo_mensual rename to vw_costo_fijo_mensual');
select pg_temp.exec_if(pg_temp.rel_is('public.v_costo_variable_por_km', 'v') and to_regclass('public.vw_costo_variable_por_km') is null, 'alter view public.v_costo_variable_por_km rename to vw_costo_variable_por_km');

-- 7) Vistas de COMPATIBILIDAD con el nombre viejo (las Lambdas desplegadas usan los nombres viejos).
--    `select *` congela la lista de columnas: si una migración agrega columnas a tbl_x, recrear la vista.
--    Mismos GRANT que la tabla/vista física. No hay RLS en public/audit: sin security_invoker.
select pg_temp.exec_if(to_regclass('audit.events') is null or pg_temp.rel_is('audit.events', 'v'), 'create or replace view audit.events as select * from audit.tbl_events');
comment on view audit.events is 'compat:estandar-oltp-59: nombre viejo de audit.tbl_events; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('audit.tbl_events'::regclass, 'audit.events'::regclass);
select pg_temp.exec_if(to_regclass('audit.tracked_tables') is null or pg_temp.rel_is('audit.tracked_tables', 'v'), 'create or replace view audit.tracked_tables as select * from audit.tbl_tracked_tables');
comment on view audit.tracked_tables is 'compat:estandar-oltp-59: nombre viejo de audit.tbl_tracked_tables; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('audit.tbl_tracked_tables'::regclass, 'audit.tracked_tables'::regclass);
select pg_temp.exec_if(to_regclass('public.addresses') is null or pg_temp.rel_is('public.addresses', 'v'), 'create or replace view public.addresses as select * from public.tbl_addresses');
comment on view public.addresses is 'compat:estandar-oltp-59: nombre viejo de public.tbl_addresses; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_addresses'::regclass, 'public.addresses'::regclass);
select pg_temp.exec_if(to_regclass('public.app_modules') is null or pg_temp.rel_is('public.app_modules', 'v'), 'create or replace view public.app_modules as select * from public.tbl_app_modules');
comment on view public.app_modules is 'compat:estandar-oltp-59: nombre viejo de public.tbl_app_modules; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_app_modules'::regclass, 'public.app_modules'::regclass);
select pg_temp.exec_if(to_regclass('public.app_users') is null or pg_temp.rel_is('public.app_users', 'v'), 'create or replace view public.app_users as select * from public.tbl_app_users');
comment on view public.app_users is 'compat:estandar-oltp-59: nombre viejo de public.tbl_app_users; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_app_users'::regclass, 'public.app_users'::regclass);
select pg_temp.exec_if(to_regclass('public.auth_credentials') is null or pg_temp.rel_is('public.auth_credentials', 'v'), 'create or replace view public.auth_credentials as select * from public.tbl_auth_credentials');
comment on view public.auth_credentials is 'compat:estandar-oltp-59: nombre viejo de public.tbl_auth_credentials; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_auth_credentials'::regclass, 'public.auth_credentials'::regclass);
select pg_temp.exec_if(to_regclass('public.branches') is null or pg_temp.rel_is('public.branches', 'v'), 'create or replace view public.branches as select * from public.tbl_branches');
comment on view public.branches is 'compat:estandar-oltp-59: nombre viejo de public.tbl_branches; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_branches'::regclass, 'public.branches'::regclass);
select pg_temp.exec_if(to_regclass('public.carriers') is null or pg_temp.rel_is('public.carriers', 'v'), 'create or replace view public.carriers as select * from public.tbl_carriers');
comment on view public.carriers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_carriers; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_carriers'::regclass, 'public.carriers'::regclass);
select pg_temp.exec_if(to_regclass('public.contacts') is null or pg_temp.rel_is('public.contacts', 'v'), 'create or replace view public.contacts as select * from public.tbl_contacts');
comment on view public.contacts is 'compat:estandar-oltp-59: nombre viejo de public.tbl_contacts; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_contacts'::regclass, 'public.contacts'::regclass);
select pg_temp.exec_if(to_regclass('public.contract_documents') is null or pg_temp.rel_is('public.contract_documents', 'v'), 'create or replace view public.contract_documents as select * from public.tbl_contract_documents');
comment on view public.contract_documents is 'compat:estandar-oltp-59: nombre viejo de public.tbl_contract_documents; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_contract_documents'::regclass, 'public.contract_documents'::regclass);
select pg_temp.exec_if(to_regclass('public.contracts') is null or pg_temp.rel_is('public.contracts', 'v'), 'create or replace view public.contracts as select * from public.tbl_contracts');
comment on view public.contracts is 'compat:estandar-oltp-59: nombre viejo de public.tbl_contracts; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_contracts'::regclass, 'public.contracts'::regclass);
select pg_temp.exec_if(to_regclass('public.costos_fijos') is null or pg_temp.rel_is('public.costos_fijos', 'v'), 'create or replace view public.costos_fijos as select * from public.tbl_costos_fijos');
comment on view public.costos_fijos is 'compat:estandar-oltp-59: nombre viejo de public.tbl_costos_fijos; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_costos_fijos'::regclass, 'public.costos_fijos'::regclass);
select pg_temp.exec_if(to_regclass('public.costos_variables') is null or pg_temp.rel_is('public.costos_variables', 'v'), 'create or replace view public.costos_variables as select * from public.tbl_costos_variables');
comment on view public.costos_variables is 'compat:estandar-oltp-59: nombre viejo de public.tbl_costos_variables; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_costos_variables'::regclass, 'public.costos_variables'::regclass);
select pg_temp.exec_if(to_regclass('public.countries') is null or pg_temp.rel_is('public.countries', 'v'), 'create or replace view public.countries as select * from public.tbl_countries');
comment on view public.countries is 'compat:estandar-oltp-59: nombre viejo de public.tbl_countries; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_countries'::regclass, 'public.countries'::regclass);
select pg_temp.exec_if(to_regclass('public.customers') is null or pg_temp.rel_is('public.customers', 'v'), 'create or replace view public.customers as select * from public.tbl_customers');
comment on view public.customers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_customers; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_customers'::regclass, 'public.customers'::regclass);
select pg_temp.exec_if(to_regclass('public.delivery_points') is null or pg_temp.rel_is('public.delivery_points', 'v'), 'create or replace view public.delivery_points as select * from public.tbl_delivery_points');
comment on view public.delivery_points is 'compat:estandar-oltp-59: nombre viejo de public.tbl_delivery_points; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_delivery_points'::regclass, 'public.delivery_points'::regclass);
select pg_temp.exec_if(to_regclass('public.depreciacion') is null or pg_temp.rel_is('public.depreciacion', 'v'), 'create or replace view public.depreciacion as select * from public.tbl_depreciacion');
comment on view public.depreciacion is 'compat:estandar-oltp-59: nombre viejo de public.tbl_depreciacion; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_depreciacion'::regclass, 'public.depreciacion'::regclass);
select pg_temp.exec_if(to_regclass('public.dispatch_guides') is null or pg_temp.rel_is('public.dispatch_guides', 'v'), 'create or replace view public.dispatch_guides as select * from public.tbl_dispatch_guides');
comment on view public.dispatch_guides is 'compat:estandar-oltp-59: nombre viejo de public.tbl_dispatch_guides; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_dispatch_guides'::regclass, 'public.dispatch_guides'::regclass);
select pg_temp.exec_if(to_regclass('public.driver_license_types') is null or pg_temp.rel_is('public.driver_license_types', 'v'), 'create or replace view public.driver_license_types as select * from public.tbl_driver_license_types');
comment on view public.driver_license_types is 'compat:estandar-oltp-59: nombre viejo de public.tbl_driver_license_types; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_driver_license_types'::regclass, 'public.driver_license_types'::regclass);
select pg_temp.exec_if(to_regclass('public.driver_licenses') is null or pg_temp.rel_is('public.driver_licenses', 'v'), 'create or replace view public.driver_licenses as select * from public.tbl_driver_licenses');
comment on view public.driver_licenses is 'compat:estandar-oltp-59: nombre viejo de public.tbl_driver_licenses; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_driver_licenses'::regclass, 'public.driver_licenses'::regclass);
select pg_temp.exec_if(to_regclass('public.driver_presence') is null or pg_temp.rel_is('public.driver_presence', 'v'), 'create or replace view public.driver_presence as select * from public.tbl_driver_presence');
comment on view public.driver_presence is 'compat:estandar-oltp-59: nombre viejo de public.tbl_driver_presence; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_driver_presence'::regclass, 'public.driver_presence'::regclass);
select pg_temp.exec_if(to_regclass('public.drivers') is null or pg_temp.rel_is('public.drivers', 'v'), 'create or replace view public.drivers as select * from public.tbl_drivers');
comment on view public.drivers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_drivers; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_drivers'::regclass, 'public.drivers'::regclass);
select pg_temp.exec_if(to_regclass('public.final_customers') is null or pg_temp.rel_is('public.final_customers', 'v'), 'create or replace view public.final_customers as select * from public.tbl_final_customers');
comment on view public.final_customers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_final_customers; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_final_customers'::regclass, 'public.final_customers'::regclass);
select pg_temp.exec_if(to_regclass('public.mobile_refresh_tokens') is null or pg_temp.rel_is('public.mobile_refresh_tokens', 'v'), 'create or replace view public.mobile_refresh_tokens as select * from public.tbl_mobile_refresh_tokens');
comment on view public.mobile_refresh_tokens is 'compat:estandar-oltp-59: nombre viejo de public.tbl_mobile_refresh_tokens; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_mobile_refresh_tokens'::regclass, 'public.mobile_refresh_tokens'::regclass);
select pg_temp.exec_if(to_regclass('public.oms_logs') is null or pg_temp.rel_is('public.oms_logs', 'v'), 'create or replace view public.oms_logs as select * from public.tbl_oms_logs');
comment on view public.oms_logs is 'compat:estandar-oltp-59: nombre viejo de public.tbl_oms_logs; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_oms_logs'::regclass, 'public.oms_logs'::regclass);
select pg_temp.exec_if(to_regclass('public.oms_rule_configs') is null or pg_temp.rel_is('public.oms_rule_configs', 'v'), 'create or replace view public.oms_rule_configs as select * from public.tbl_oms_rule_configs');
comment on view public.oms_rule_configs is 'compat:estandar-oltp-59: nombre viejo de public.tbl_oms_rule_configs; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_oms_rule_configs'::regclass, 'public.oms_rule_configs'::regclass);
select pg_temp.exec_if(to_regclass('public.order_items') is null or pg_temp.rel_is('public.order_items', 'v'), 'create or replace view public.order_items as select * from public.tbl_order_items');
comment on view public.order_items is 'compat:estandar-oltp-59: nombre viejo de public.tbl_order_items; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_order_items'::regclass, 'public.order_items'::regclass);
select pg_temp.exec_if(to_regclass('public.orders') is null or pg_temp.rel_is('public.orders', 'v'), 'create or replace view public.orders as select * from public.tbl_orders');
comment on view public.orders is 'compat:estandar-oltp-59: nombre viejo de public.tbl_orders; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_orders'::regclass, 'public.orders'::regclass);
select pg_temp.exec_if(to_regclass('public.organizations') is null or pg_temp.rel_is('public.organizations', 'v'), 'create or replace view public.organizations as select * from public.tbl_organizations');
comment on view public.organizations is 'compat:estandar-oltp-59: nombre viejo de public.tbl_organizations; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_organizations'::regclass, 'public.organizations'::regclass);
select pg_temp.exec_if(to_regclass('public.parametros_globales') is null or pg_temp.rel_is('public.parametros_globales', 'v'), 'create or replace view public.parametros_globales as select * from public.tbl_parametros_globales');
comment on view public.parametros_globales is 'compat:estandar-oltp-59: nombre viejo de public.tbl_parametros_globales; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_parametros_globales'::regclass, 'public.parametros_globales'::regclass);
select pg_temp.exec_if(to_regclass('public.plan_stops') is null or pg_temp.rel_is('public.plan_stops', 'v'), 'create or replace view public.plan_stops as select * from public.tbl_plan_stops');
comment on view public.plan_stops is 'compat:estandar-oltp-59: nombre viejo de public.tbl_plan_stops; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_plan_stops'::regclass, 'public.plan_stops'::regclass);
select pg_temp.exec_if(to_regclass('public.plan_trips') is null or pg_temp.rel_is('public.plan_trips', 'v'), 'create or replace view public.plan_trips as select * from public.tbl_plan_trips');
comment on view public.plan_trips is 'compat:estandar-oltp-59: nombre viejo de public.tbl_plan_trips; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_plan_trips'::regclass, 'public.plan_trips'::regclass);
select pg_temp.exec_if(to_regclass('public.rates') is null or pg_temp.rel_is('public.rates', 'v'), 'create or replace view public.rates as select * from public.tbl_rates');
comment on view public.rates is 'compat:estandar-oltp-59: nombre viejo de public.tbl_rates; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_rates'::regclass, 'public.rates'::regclass);
select pg_temp.exec_if(to_regclass('public.returns') is null or pg_temp.rel_is('public.returns', 'v'), 'create or replace view public.returns as select * from public.tbl_returns');
comment on view public.returns is 'compat:estandar-oltp-59: nombre viejo de public.tbl_returns; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_returns'::regclass, 'public.returns'::regclass);
select pg_temp.exec_if(to_regclass('public.role_countries') is null or pg_temp.rel_is('public.role_countries', 'v'), 'create or replace view public.role_countries as select * from public.tbl_role_countries');
comment on view public.role_countries is 'compat:estandar-oltp-59: nombre viejo de public.tbl_role_countries; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_role_countries'::regclass, 'public.role_countries'::regclass);
select pg_temp.exec_if(to_regclass('public.role_permissions') is null or pg_temp.rel_is('public.role_permissions', 'v'), 'create or replace view public.role_permissions as select * from public.tbl_role_permissions');
comment on view public.role_permissions is 'compat:estandar-oltp-59: nombre viejo de public.tbl_role_permissions; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_role_permissions'::regclass, 'public.role_permissions'::regclass);
select pg_temp.exec_if(to_regclass('public.roles') is null or pg_temp.rel_is('public.roles', 'v'), 'create or replace view public.roles as select * from public.tbl_roles');
comment on view public.roles is 'compat:estandar-oltp-59: nombre viejo de public.tbl_roles; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_roles'::regclass, 'public.roles'::regclass);
select pg_temp.exec_if(to_regclass('public.route_plans') is null or pg_temp.rel_is('public.route_plans', 'v'), 'create or replace view public.route_plans as select * from public.tbl_route_plans');
comment on view public.route_plans is 'compat:estandar-oltp-59: nombre viejo de public.tbl_route_plans; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_route_plans'::regclass, 'public.route_plans'::regclass);
select pg_temp.exec_if(to_regclass('public.routes') is null or pg_temp.rel_is('public.routes', 'v'), 'create or replace view public.routes as select * from public.tbl_routes');
comment on view public.routes is 'compat:estandar-oltp-59: nombre viejo de public.tbl_routes; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_routes'::regclass, 'public.routes'::regclass);
select pg_temp.exec_if(to_regclass('public.rutas_costeo') is null or pg_temp.rel_is('public.rutas_costeo', 'v'), 'create or replace view public.rutas_costeo as select * from public.tbl_rutas_costeo');
comment on view public.rutas_costeo is 'compat:estandar-oltp-59: nombre viejo de public.tbl_rutas_costeo; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_rutas_costeo'::regclass, 'public.rutas_costeo'::regclass);
select pg_temp.exec_if(to_regclass('public.settlements') is null or pg_temp.rel_is('public.settlements', 'v'), 'create or replace view public.settlements as select * from public.tbl_settlements');
comment on view public.settlements is 'compat:estandar-oltp-59: nombre viejo de public.tbl_settlements; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_settlements'::regclass, 'public.settlements'::regclass);
select pg_temp.exec_if(to_regclass('public.sku_cotizaciones') is null or pg_temp.rel_is('public.sku_cotizaciones', 'v'), 'create or replace view public.sku_cotizaciones as select * from public.tbl_sku_cotizaciones');
comment on view public.sku_cotizaciones is 'compat:estandar-oltp-59: nombre viejo de public.tbl_sku_cotizaciones; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_sku_cotizaciones'::regclass, 'public.sku_cotizaciones'::regclass);
select pg_temp.exec_if(to_regclass('public.stores') is null or pg_temp.rel_is('public.stores', 'v'), 'create or replace view public.stores as select * from public.tbl_stores');
comment on view public.stores is 'compat:estandar-oltp-59: nombre viejo de public.tbl_stores; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_stores'::regclass, 'public.stores'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_audit_log') is null or pg_temp.rel_is('public.tarifas_audit_log', 'v'), 'create or replace view public.tarifas_audit_log as select * from public.tbl_tarifas_audit_log');
comment on view public.tarifas_audit_log is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_audit_log; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_audit_log'::regclass, 'public.tarifas_audit_log'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_cost_structure_rows') is null or pg_temp.rel_is('public.tarifas_cost_structure_rows', 'v'), 'create or replace view public.tarifas_cost_structure_rows as select * from public.tbl_tarifas_cost_structure_rows');
comment on view public.tarifas_cost_structure_rows is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_cost_structure_rows; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_cost_structure_rows'::regclass, 'public.tarifas_cost_structure_rows'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_cost_structures') is null or pg_temp.rel_is('public.tarifas_cost_structures', 'v'), 'create or replace view public.tarifas_cost_structures as select * from public.tbl_tarifas_cost_structures');
comment on view public.tarifas_cost_structures is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_cost_structures; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_cost_structures'::regclass, 'public.tarifas_cost_structures'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_country_settings') is null or pg_temp.rel_is('public.tarifas_country_settings', 'v'), 'create or replace view public.tarifas_country_settings as select * from public.tbl_tarifas_country_settings');
comment on view public.tarifas_country_settings is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_country_settings; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_country_settings'::regclass, 'public.tarifas_country_settings'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_margin_policies') is null or pg_temp.rel_is('public.tarifas_margin_policies', 'v'), 'create or replace view public.tarifas_margin_policies as select * from public.tbl_tarifas_margin_policies');
comment on view public.tarifas_margin_policies is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_margin_policies; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_margin_policies'::regclass, 'public.tarifas_margin_policies'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_party_variables') is null or pg_temp.rel_is('public.tarifas_party_variables', 'v'), 'create or replace view public.tarifas_party_variables as select * from public.tbl_tarifas_party_variables');
comment on view public.tarifas_party_variables is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_party_variables; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_party_variables'::regclass, 'public.tarifas_party_variables'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_pricing_rules') is null or pg_temp.rel_is('public.tarifas_pricing_rules', 'v'), 'create or replace view public.tarifas_pricing_rules as select * from public.tbl_tarifas_pricing_rules');
comment on view public.tarifas_pricing_rules is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_pricing_rules; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_pricing_rules'::regclass, 'public.tarifas_pricing_rules'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_pricing_templates') is null or pg_temp.rel_is('public.tarifas_pricing_templates', 'v'), 'create or replace view public.tarifas_pricing_templates as select * from public.tbl_tarifas_pricing_templates');
comment on view public.tarifas_pricing_templates is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_pricing_templates; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_pricing_templates'::regclass, 'public.tarifas_pricing_templates'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_proforma_claims') is null or pg_temp.rel_is('public.tarifas_proforma_claims', 'v'), 'create or replace view public.tarifas_proforma_claims as select * from public.tbl_tarifas_proforma_claims');
comment on view public.tarifas_proforma_claims is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_claims; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_proforma_claims'::regclass, 'public.tarifas_proforma_claims'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_proforma_email_config') is null or pg_temp.rel_is('public.tarifas_proforma_email_config', 'v'), 'create or replace view public.tarifas_proforma_email_config as select * from public.tbl_tarifas_proforma_email_config');
comment on view public.tarifas_proforma_email_config is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_email_config; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_proforma_email_config'::regclass, 'public.tarifas_proforma_email_config'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_proforma_flow_phases') is null or pg_temp.rel_is('public.tarifas_proforma_flow_phases', 'v'), 'create or replace view public.tarifas_proforma_flow_phases as select * from public.tbl_tarifas_proforma_flow_phases');
comment on view public.tarifas_proforma_flow_phases is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_flow_phases; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_proforma_flow_phases'::regclass, 'public.tarifas_proforma_flow_phases'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_proforma_items') is null or pg_temp.rel_is('public.tarifas_proforma_items', 'v'), 'create or replace view public.tarifas_proforma_items as select * from public.tbl_tarifas_proforma_items');
comment on view public.tarifas_proforma_items is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_items; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_proforma_items'::regclass, 'public.tarifas_proforma_items'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_proforma_phases') is null or pg_temp.rel_is('public.tarifas_proforma_phases', 'v'), 'create or replace view public.tarifas_proforma_phases as select * from public.tbl_tarifas_proforma_phases');
comment on view public.tarifas_proforma_phases is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_phases; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_proforma_phases'::regclass, 'public.tarifas_proforma_phases'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_proformas') is null or pg_temp.rel_is('public.tarifas_proformas', 'v'), 'create or replace view public.tarifas_proformas as select * from public.tbl_tarifas_proformas');
comment on view public.tarifas_proformas is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proformas; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_proformas'::regclass, 'public.tarifas_proformas'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_rate_table_rows') is null or pg_temp.rel_is('public.tarifas_rate_table_rows', 'v'), 'create or replace view public.tarifas_rate_table_rows as select * from public.tbl_tarifas_rate_table_rows');
comment on view public.tarifas_rate_table_rows is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_rate_table_rows; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_rate_table_rows'::regclass, 'public.tarifas_rate_table_rows'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_rate_tables') is null or pg_temp.rel_is('public.tarifas_rate_tables', 'v'), 'create or replace view public.tarifas_rate_tables as select * from public.tbl_tarifas_rate_tables');
comment on view public.tarifas_rate_tables is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_rate_tables; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_rate_tables'::regclass, 'public.tarifas_rate_tables'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_settlement_parties') is null or pg_temp.rel_is('public.tarifas_settlement_parties', 'v'), 'create or replace view public.tarifas_settlement_parties as select * from public.tbl_tarifas_settlement_parties');
comment on view public.tarifas_settlement_parties is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_settlement_parties; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_settlement_parties'::regclass, 'public.tarifas_settlement_parties'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_settlements') is null or pg_temp.rel_is('public.tarifas_settlements', 'v'), 'create or replace view public.tarifas_settlements as select * from public.tbl_tarifas_settlements');
comment on view public.tarifas_settlements is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_settlements; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_settlements'::regclass, 'public.tarifas_settlements'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_trip_order_marks') is null or pg_temp.rel_is('public.tarifas_trip_order_marks', 'v'), 'create or replace view public.tarifas_trip_order_marks as select * from public.tbl_tarifas_trip_order_marks');
comment on view public.tarifas_trip_order_marks is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_trip_order_marks; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_trip_order_marks'::regclass, 'public.tarifas_trip_order_marks'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_trip_tender_awards') is null or pg_temp.rel_is('public.tarifas_trip_tender_awards', 'v'), 'create or replace view public.tarifas_trip_tender_awards as select * from public.tbl_tarifas_trip_tender_awards');
comment on view public.tarifas_trip_tender_awards is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_trip_tender_awards; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_trip_tender_awards'::regclass, 'public.tarifas_trip_tender_awards'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_zone_groups') is null or pg_temp.rel_is('public.tarifas_zone_groups', 'v'), 'create or replace view public.tarifas_zone_groups as select * from public.tbl_tarifas_zone_groups');
comment on view public.tarifas_zone_groups is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_zone_groups; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tarifas_zone_groups'::regclass, 'public.tarifas_zone_groups'::regclass);
select pg_temp.exec_if(to_regclass('public.tariff_types') is null or pg_temp.rel_is('public.tariff_types', 'v'), 'create or replace view public.tariff_types as select * from public.tbl_tariff_types');
comment on view public.tariff_types is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tariff_types; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tariff_types'::regclass, 'public.tariff_types'::regclass);
select pg_temp.exec_if(to_regclass('public.tipos_camion') is null or pg_temp.rel_is('public.tipos_camion', 'v'), 'create or replace view public.tipos_camion as select * from public.tbl_tipos_camion');
comment on view public.tipos_camion is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tipos_camion; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tipos_camion'::regclass, 'public.tipos_camion'::regclass);
select pg_temp.exec_if(to_regclass('public.tracking_consents') is null or pg_temp.rel_is('public.tracking_consents', 'v'), 'create or replace view public.tracking_consents as select * from public.tbl_tracking_consents');
comment on view public.tracking_consents is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_consents; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tracking_consents'::regclass, 'public.tracking_consents'::regclass);
select pg_temp.exec_if(to_regclass('public.tracking_events') is null or pg_temp.rel_is('public.tracking_events', 'v'), 'create or replace view public.tracking_events as select * from public.tbl_tracking_events');
comment on view public.tracking_events is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_events; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tracking_events'::regclass, 'public.tracking_events'::regclass);
select pg_temp.exec_if(to_regclass('public.tracking_evidences') is null or pg_temp.rel_is('public.tracking_evidences', 'v'), 'create or replace view public.tracking_evidences as select * from public.tbl_tracking_evidences');
comment on view public.tracking_evidences is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_evidences; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tracking_evidences'::regclass, 'public.tracking_evidences'::regclass);
select pg_temp.exec_if(to_regclass('public.tracking_last_positions') is null or pg_temp.rel_is('public.tracking_last_positions', 'v'), 'create or replace view public.tracking_last_positions as select * from public.tbl_tracking_last_positions');
comment on view public.tracking_last_positions is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_last_positions; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tracking_last_positions'::regclass, 'public.tracking_last_positions'::regclass);
select pg_temp.exec_if(to_regclass('public.tracking_positions') is null or pg_temp.rel_is('public.tracking_positions', 'v'), 'create or replace view public.tracking_positions as select * from public.tbl_tracking_positions');
comment on view public.tracking_positions is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_positions; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tracking_positions'::regclass, 'public.tracking_positions'::regclass);
select pg_temp.exec_if(to_regclass('public.tracking_reviews') is null or pg_temp.rel_is('public.tracking_reviews', 'v'), 'create or replace view public.tracking_reviews as select * from public.tbl_tracking_reviews');
comment on view public.tracking_reviews is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_reviews; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_tracking_reviews'::regclass, 'public.tracking_reviews'::regclass);
select pg_temp.exec_if(to_regclass('public.user_scopes') is null or pg_temp.rel_is('public.user_scopes', 'v'), 'create or replace view public.user_scopes as select * from public.tbl_user_scopes');
comment on view public.user_scopes is 'compat:estandar-oltp-59: nombre viejo de public.tbl_user_scopes; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_user_scopes'::regclass, 'public.user_scopes'::regclass);
select pg_temp.exec_if(to_regclass('public.vehicle_types') is null or pg_temp.rel_is('public.vehicle_types', 'v'), 'create or replace view public.vehicle_types as select * from public.tbl_vehicle_types');
comment on view public.vehicle_types is 'compat:estandar-oltp-59: nombre viejo de public.tbl_vehicle_types; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_vehicle_types'::regclass, 'public.vehicle_types'::regclass);
select pg_temp.exec_if(to_regclass('public.vehicles') is null or pg_temp.rel_is('public.vehicles', 'v'), 'create or replace view public.vehicles as select * from public.tbl_vehicles');
comment on view public.vehicles is 'compat:estandar-oltp-59: nombre viejo de public.tbl_vehicles; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_vehicles'::regclass, 'public.vehicles'::regclass);
select pg_temp.exec_if(to_regclass('public.warehouses') is null or pg_temp.rel_is('public.warehouses', 'v'), 'create or replace view public.warehouses as select * from public.tbl_warehouses');
comment on view public.warehouses is 'compat:estandar-oltp-59: nombre viejo de public.tbl_warehouses; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_warehouses'::regclass, 'public.warehouses'::regclass);
select pg_temp.exec_if(to_regclass('public.wms_expediciones') is null or pg_temp.rel_is('public.wms_expediciones', 'v'), 'create or replace view public.wms_expediciones as select * from public.tbl_wms_expediciones');
comment on view public.wms_expediciones is 'compat:estandar-oltp-59: nombre viejo de public.tbl_wms_expediciones; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_wms_expediciones'::regclass, 'public.wms_expediciones'::regclass);
select pg_temp.exec_if(to_regclass('public.wms_expediciones_detalle') is null or pg_temp.rel_is('public.wms_expediciones_detalle', 'v'), 'create or replace view public.wms_expediciones_detalle as select * from public.tbl_wms_expediciones_detalle');
comment on view public.wms_expediciones_detalle is 'compat:estandar-oltp-59: nombre viejo de public.tbl_wms_expediciones_detalle; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_wms_expediciones_detalle'::regclass, 'public.wms_expediciones_detalle'::regclass);
select pg_temp.exec_if(to_regclass('public.zones') is null or pg_temp.rel_is('public.zones', 'v'), 'create or replace view public.zones as select * from public.tbl_zones');
comment on view public.zones is 'compat:estandar-oltp-59: nombre viejo de public.tbl_zones; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.tbl_zones'::regclass, 'public.zones'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_v_devoluciones') is null or pg_temp.rel_is('public.tarifas_v_devoluciones', 'v'), 'create or replace view public.tarifas_v_devoluciones as select * from public.vw_tarifas_devoluciones');
comment on view public.tarifas_v_devoluciones is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_devoluciones; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.vw_tarifas_devoluciones'::regclass, 'public.tarifas_v_devoluciones'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_v_viaje_cargas') is null or pg_temp.rel_is('public.tarifas_v_viaje_cargas', 'v'), 'create or replace view public.tarifas_v_viaje_cargas as select * from public.vw_tarifas_viaje_cargas');
comment on view public.tarifas_v_viaje_cargas is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_viaje_cargas; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.vw_tarifas_viaje_cargas'::regclass, 'public.tarifas_v_viaje_cargas'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_v_viaje_pedidos') is null or pg_temp.rel_is('public.tarifas_v_viaje_pedidos', 'v'), 'create or replace view public.tarifas_v_viaje_pedidos as select * from public.vw_tarifas_viaje_pedidos');
comment on view public.tarifas_v_viaje_pedidos is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_viaje_pedidos; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.vw_tarifas_viaje_pedidos'::regclass, 'public.tarifas_v_viaje_pedidos'::regclass);
select pg_temp.exec_if(to_regclass('public.tarifas_v_viajes') is null or pg_temp.rel_is('public.tarifas_v_viajes', 'v'), 'create or replace view public.tarifas_v_viajes as select * from public.vw_tarifas_viajes');
comment on view public.tarifas_v_viajes is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_viajes; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.vw_tarifas_viajes'::regclass, 'public.tarifas_v_viajes'::regclass);
select pg_temp.exec_if(to_regclass('public.v_costo_fijo_mensual') is null or pg_temp.rel_is('public.v_costo_fijo_mensual', 'v'), 'create or replace view public.v_costo_fijo_mensual as select * from public.vw_costo_fijo_mensual');
comment on view public.v_costo_fijo_mensual is 'compat:estandar-oltp-59: nombre viejo de public.vw_costo_fijo_mensual; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.vw_costo_fijo_mensual'::regclass, 'public.v_costo_fijo_mensual'::regclass);
select pg_temp.exec_if(to_regclass('public.v_costo_variable_por_km') is null or pg_temp.rel_is('public.v_costo_variable_por_km', 'v'), 'create or replace view public.v_costo_variable_por_km as select * from public.vw_costo_variable_por_km');
comment on view public.v_costo_variable_por_km is 'compat:estandar-oltp-59: nombre viejo de public.vw_costo_variable_por_km; se retira tras redesplegar todos los stacks (ADR-0014)';
select pg_temp.copiar_grants('public.vw_costo_variable_por_km'::regclass, 'public.v_costo_variable_por_km'::regclass);

-- 8) Auditoría: tracked_tables al nombre FÍSICO (si no, password_hash deja de enmascararse)
--    y funciones que nombran tablas, a los nombres físicos.
update audit.tbl_tracked_tables tt set table_name = 'tbl_' || tt.table_name
 where tt.table_name not like 'tbl\_%' and pg_temp.rel_is('public.tbl_' || tt.table_name, 'rp')
   and not exists (select 1 from audit.tbl_tracked_tables x where x.table_name = 'tbl_' || tt.table_name);

-- Auditoría (sql/16): busca la configuración por el nombre FÍSICO (tg_table_name = tbl_x) en
-- audit.tbl_tracked_tables, pero registra entity_table con el nombre LÓGICO (sin tbl_) para no
-- cortar la continuidad de la bitácora ni el filtro "tabla" de /auditoria.
create or replace function audit.capture_row_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  cfg      audit.tbl_tracked_tables;
  actor    jsonb := nullif(current_setting('tms.audit_actor', true), '')::jsonb;
  old_row  jsonb;
  new_row  jsonb;
  diff     jsonb;
  masked   text[];
  v_app_user uuid;
  v_role     text;
begin
  select * into cfg from audit.tbl_tracked_tables where table_name = tg_table_name;
  masked := coalesce(cfg.masked_columns, '{}');
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, case when k = any(masked) then '["[oculto]", "[oculto]"]'::jsonb
                                    else jsonb_build_array(old_row -> k, new_row -> k) end)
      into diff
      from jsonb_object_keys(new_row) as k
     where (old_row -> k) is distinct from (new_row -> k) and k <> 'updated_at';
    if diff is null then
      return null;
    end if;
  end if;

  if actor ->> 'auth_user_id' is not null then
    select au.id, r.name into v_app_user, v_role
      from public.tbl_app_users au left join public.tbl_roles r on r.id = au.role_id
     where au.auth_user_id = (actor ->> 'auth_user_id')::uuid;
  end if;

  insert into audit.tbl_events (actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
                                module_key, entity_table, entity_id, changes, before, after,
                                request_id, ip, user_agent)
  values (coalesce(actor ->> 'type', 'system'),
          (actor ->> 'auth_user_id')::uuid, v_app_user, actor ->> 'email', v_role,
          coalesce(actor ->> 'source', 'db:' || coalesce(nullif(current_setting('application_name', true), ''),
                                                         session_user::text)),
          case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
          cfg.module_key, regexp_replace(tg_table_name, '^tbl_', ''),
          coalesce(new_row, old_row) ->> coalesce(cfg.id_column, 'id'),
          diff,
          case when tg_op = 'DELETE' then old_row - masked end,
          case when tg_op = 'INSERT' then new_row - masked end,
          actor ->> 'request_id', actor ->> 'ip', actor ->> 'user_agent');
  return null;
end $$;


-- Particiones mensuales (sql/17) con los nombres nuevos: audit.tbl_events_YYYY_MM.
create or replace function audit.ensure_partitions(months_ahead int default 3, from_month date default null)
returns int language plpgsql as $$
declare
  first_month date := date_trunc('month', coalesce(from_month, current_date))::date;
  month_start date;
  part text;
  created int := 0;
begin
  for i in 0..months_ahead loop
    month_start := (first_month + make_interval(months => i))::date;
    part := 'tbl_events_' || to_char(month_start, 'YYYY_MM');
    if to_regclass('audit.' || part) is null then
      execute format('create table audit.%I partition of audit.tbl_events for values from (%L) to (%L)',
                     part, month_start, (month_start + interval '1 month')::date);
      execute format('create trigger %I before truncate on audit.%I '
                     'for each statement execute function audit.forbid_change()',
                     'trg_events_' || to_char(month_start, 'YYYY_MM') || '_no_truncate', part);
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;

CREATE OR REPLACE FUNCTION public.zone_for_point(p_country_id uuid, p_latitude numeric, p_longitude numeric)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select z.id
  from tbl_zones z
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
    from tbl_delivery_points dp
    join tbl_addresses a on a.id = dp.address_id
    where dp.zone_source = 'map' and a.country_id = p_country_id
      and (p_address_id is null or a.id = p_address_id)
  )
  update tbl_delivery_points dp set zone_id = t.zone_id, updated_at = now()
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
    select country_id, latitude, longitude into addr from tbl_addresses where id = new.address_id;
    new.zone_id := case when found then zone_for_point(addr.country_id, addr.latitude, addr.longitude) end;
  end if;
  return new;
end
$function$;


-- 9) Validación: todas las filas deben dar OK; si alguna falla, la transacción aborta.
drop table if exists estandar_59_validacion;
create temp table estandar_59_validacion on commit drop as
with rel as (
  select n.nspname, c.relname, c.relkind, c.oid,
         coalesce(obj_description(c.oid, 'pg_class'), '') like 'compat:estandar-oltp-59%' as compat
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'audit')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e')
), excl as (
  select oid from rel where nspname = 'public' and relname in ('mobile_migrations', 'schema_migrations', 'sim_expedicionescabecera')
)
select 'tablas con tbl_' as control, count(*) filter (where relname !~ '^tbl_[a-z0-9_]+$') as fallas
  from rel where relkind in ('r','p') and oid not in (select oid from excl)
union all
select 'vistas con vw_ (sin contar compatibilidad)', count(*) filter (where relname !~ '^vw_[a-z0-9_]+$')
  from rel where relkind = 'v' and not compat
union all
select 'secuencias con seq_', count(*) filter (where relname !~ '^seq_[a-z0-9_]+$')
  from rel s where relkind = 'S'
   and not exists (select 1 from pg_depend d where d.objid = s.oid and d.refobjid in (select oid from excl))
union all
select 'constraints pk_/fk_/uq_/ck_', count(*) filter (where conname !~ ('^' || case contype when 'p' then 'pk' when 'f' then 'fk'
                                                                          when 'u' then 'uq' else 'ck' end || '_[a-z0-9_]+$'))
  from pg_constraint where contype in ('p','f','u','c') and conrelid in (select oid from rel where relkind in ('r','p'))
   and conrelid not in (select oid from excl)
union all
select 'índices idx_/uidx_', count(*) filter (where c.relname !~ case when i.indisunique then '^(uidx|pk|uq)_[a-z0-9_]+$'
                                                                    else '^idx_[a-z0-9_]+$' end)
  from pg_index i join pg_class c on c.oid = i.indexrelid
 where i.indrelid in (select oid from rel where relkind in ('r','p')) and i.indrelid not in (select oid from excl)
union all
select 'triggers trg_', count(*) filter (where tgname !~ '^trg_[a-z0-9_]+$')
  from pg_trigger where not tgisinternal and tgrelid in (select oid from rel where relkind in ('r','p'))
   and tgrelid not in (select oid from excl)
union all
select 'columnas en minúsculas/ASCII', count(*)
  from pg_attribute a where a.attnum > 0 and not a.attisdropped and a.attname !~ '^[a-z0-9_]+$'
   and a.attrelid in (select oid from rel where relkind in ('r','p','v') and not compat) and a.attrelid not in (select oid from excl)
union all
select 'auditoría: tablas con trigger de auditoría registradas por nombre físico', count(*)
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where p.proname = 'capture_row_change' and not t.tgisinternal
   and not exists (select 1 from audit.tbl_tracked_tables tt where tt.table_name = (select relname from pg_class where oid = t.tgrelid))
union all
select 'auditoría: password_hash enmascarado en tbl_auth_credentials',
       case when exists (select 1 from audit.tbl_tracked_tables where table_name = 'tbl_auth_credentials'
                         and 'password_hash' = any(masked_columns)) then 0 else 1 end
union all
select 'compatibilidad: cada tabla/vista renombrada tiene su vista con el nombre viejo',
       count(*) filter (where to_regclass(nspname || '.' || quote_ident(substr(relname, case when relname like 'tbl\_%' then 5 else 4 end))) is null
                        and not (relname like 'vw\_%'))
  from rel where relkind in ('r','p') and relname like 'tbl\_%'
   and not exists (select 1 from pg_inherits i where i.inhrelid = rel.oid);

do $$
declare n int;
begin
  select count(*) into n from estandar_59_validacion where fallas > 0;
  if n > 0 then
    raise exception 'Validación 59 con % control(es) en FALLA: %', n,
      (select string_agg(control || '=' || fallas, '; ') from estandar_59_validacion where fallas > 0);
  end if;
end $$;

select control, case when fallas = 0 then 'OK' else 'FALLA (' || fallas || ')' end as resultado
  from estandar_59_validacion;

commit;
