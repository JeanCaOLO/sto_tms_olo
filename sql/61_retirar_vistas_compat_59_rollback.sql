-- ============================================================================
-- 61_retirar_vistas_compat_59_rollback.sql — recrea las vistas de compatibilidad
-- que borra la sql/61 (84 vistas), con su definición, dueño, GRANT y comentario
-- tal como estaban (generado del catálogo el 2026-11-05).
-- Uso: node --env-file=.env.local scripts/run-migration.mjs sql/61_retirar_vistas_compat_59_rollback.sql --execute
-- ============================================================================

create or replace view audit.events as
 SELECT id,
    occurred_at,
    actor_type,
    auth_user_id,
    app_user_id,
    actor_email,
    role_name,
    source,
    action,
    module_key,
    entity_table,
    entity_id,
    changes,
    before,
    after,
    request_id,
    ip,
    user_agent,
    metadata
   FROM audit.tbl_events;
alter view audit.events owner to olo_db;
revoke all on audit.events from tms_app;
comment on view audit.events is 'compat:estandar-oltp-59: nombre viejo de audit.tbl_events; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select on audit.events to tms_app;

create or replace view audit.tracked_tables as
 SELECT table_name,
    module_key,
    id_column,
    masked_columns
   FROM audit.tbl_tracked_tables;
alter view audit.tracked_tables owner to olo_db;
revoke all on audit.tracked_tables from tms_app;
comment on view audit.tracked_tables is 'compat:estandar-oltp-59: nombre viejo de audit.tbl_tracked_tables; se retira tras redesplegar todos los stacks (ADR-0005)';

create or replace view public.addresses as
 SELECT id,
    country_id,
    line1,
    line2,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    geocoding_status,
    geocoding_provider,
    geocoded_at,
    created_at,
    updated_at
   FROM tbl_addresses;
alter view public.addresses owner to olo_db;
revoke all on public.addresses from tms_app;
comment on view public.addresses is 'compat:estandar-oltp-59: nombre viejo de public.tbl_addresses; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.addresses to tms_app;

create or replace view public.app_modules as
 SELECT key,
    group_key,
    path,
    sort_order
   FROM tbl_app_modules;
alter view public.app_modules owner to olo_db;
revoke all on public.app_modules from tms_app;
comment on view public.app_modules is 'compat:estandar-oltp-59: nombre viejo de public.tbl_app_modules; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.app_modules to tms_app;

create or replace view public.app_users as
 SELECT id,
    auth_user_id,
    email,
    full_name,
    role_id,
    organization_id,
    is_active,
    created_at,
    updated_at,
    carrier_id
   FROM tbl_app_users;
alter view public.app_users owner to olo_db;
revoke all on public.app_users from tms_app;
comment on view public.app_users is 'compat:estandar-oltp-59: nombre viejo de public.tbl_app_users; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.app_users to tms_app;

create or replace view public.auth_credentials as
 SELECT auth_user_id,
    email,
    password_hash,
    created_at
   FROM tbl_auth_credentials;
alter view public.auth_credentials owner to olo_db;
revoke all on public.auth_credentials from tms_app;
comment on view public.auth_credentials is 'compat:estandar-oltp-59: nombre viejo de public.tbl_auth_credentials; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.auth_credentials to tms_app;

create or replace view public.branches as
 SELECT id,
    customer_id,
    external_code,
    name,
    short_name,
    branch_type,
    tax_id,
    erp_reference,
    country,
    province,
    city,
    address,
    email,
    phone,
    status,
    created_at,
    updated_at
   FROM tbl_branches;
alter view public.branches owner to olo_db;
revoke all on public.branches from tms_app;
comment on view public.branches is 'compat:estandar-oltp-59: nombre viejo de public.tbl_branches; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.branches to tms_app;

create or replace view public.carriers as
 SELECT id,
    organization_id,
    name,
    code,
    tax_id,
    email,
    phone,
    address,
    status,
    created_at,
    updated_at,
    contact_name,
    country_id,
    payment_account,
    softland_code,
    is_flota_propia,
    contract_expiry,
    contract_file_key,
    rate_type,
    flat_rate_amount
   FROM tbl_carriers;
alter view public.carriers owner to olo_db;
revoke all on public.carriers from tms_app;
comment on view public.carriers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_carriers; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.carriers to tms_app;

create or replace view public.contacts as
 SELECT id,
    final_customer_id,
    delivery_point_id,
    name,
    phone,
    email,
    role,
    created_at
   FROM tbl_contacts;
alter view public.contacts owner to olo_db;
revoke all on public.contacts from tms_app;
comment on view public.contacts is 'compat:estandar-oltp-59: nombre viejo de public.tbl_contacts; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.contacts to tms_app;

create or replace view public.contract_documents as
 SELECT id,
    contract_id,
    organization_id,
    name,
    document_type,
    file_url,
    file_name,
    file_size_kb,
    notes,
    uploaded_at,
    uploaded_by
   FROM tbl_contract_documents;
alter view public.contract_documents owner to olo_db;
revoke all on public.contract_documents from tms_app;
comment on view public.contract_documents is 'compat:estandar-oltp-59: nombre viejo de public.tbl_contract_documents; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.contract_documents to tms_app;

create or replace view public.contracts as
 SELECT id,
    organization_id,
    contract_number,
    title,
    contract_type,
    status,
    entity_type,
    entity_id,
    entity_name,
    start_date,
    end_date,
    value,
    currency,
    description,
    terms,
    auto_renew,
    renewal_period_months,
    alert_days_before,
    signed_by,
    signed_date,
    created_at,
    updated_at
   FROM tbl_contracts;
alter view public.contracts owner to olo_db;
revoke all on public.contracts from tms_app;
comment on view public.contracts is 'compat:estandar-oltp-59: nombre viejo de public.tbl_contracts; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.contracts to tms_app;

create or replace view public.costos_fijos as
 SELECT id,
    categoria,
    concepto,
    monto,
    orden,
    activo,
    created_at,
    updated_at
   FROM tbl_costos_fijos;
alter view public.costos_fijos owner to olo_db;
revoke all on public.costos_fijos from tms_app;
comment on view public.costos_fijos is 'compat:estandar-oltp-59: nombre viejo de public.tbl_costos_fijos; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.costos_fijos to tms_app;

create or replace view public.costos_variables as
 SELECT id,
    componente,
    frecuencia,
    cantidad,
    freq_t1,
    costo_t1,
    freq_t3,
    costo_t3,
    freq_t5,
    costo_t5,
    orden,
    activo,
    created_at,
    updated_at
   FROM tbl_costos_variables;
alter view public.costos_variables owner to olo_db;
revoke all on public.costos_variables from tms_app;
comment on view public.costos_variables is 'compat:estandar-oltp-59: nombre viejo de public.tbl_costos_variables; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.costos_variables to tms_app;

create or replace view public.countries as
 SELECT id,
    organization_id,
    name,
    code,
    currency,
    timezone,
    status,
    created_at,
    updated_at,
    iso_code,
    phone_code,
    flag_emoji,
    capital,
    language,
    notes,
    locale,
    unit_system,
    date_format
   FROM tbl_countries;
alter view public.countries owner to olo_db;
revoke all on public.countries from tms_app;
comment on view public.countries is 'compat:estandar-oltp-59: nombre viejo de public.tbl_countries; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.countries to tms_app;

create or replace view public.customers as
 SELECT id,
    organization_id,
    country_id,
    code,
    name,
    tax_id,
    email,
    phone,
    address,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    delivery_zone,
    status,
    created_at,
    updated_at,
    warehouse_id,
    source_system,
    external_code
   FROM tbl_customers;
alter view public.customers owner to olo_db;
revoke all on public.customers from tms_app;
comment on view public.customers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_customers; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.customers to tms_app;

create or replace view public.delivery_points as
 SELECT id,
    final_customer_id,
    address_id,
    external_code,
    name,
    delivery_instructions,
    delivery_window_start,
    delivery_window_end,
    is_default,
    active,
    created_at,
    updated_at,
    zone_id,
    route_code,
    wms_zone_code,
    zone_source,
    contact_phone
   FROM tbl_delivery_points;
alter view public.delivery_points owner to olo_db;
revoke all on public.delivery_points from tms_app;
comment on view public.delivery_points is 'compat:estandar-oltp-59: nombre viejo de public.tbl_delivery_points; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.delivery_points to tms_app;

create or replace view public.depreciacion as
 SELECT codigo_camion,
    valor_vehiculo,
    vida_meses,
    monto_mensual,
    updated_at
   FROM tbl_depreciacion;
alter view public.depreciacion owner to olo_db;
revoke all on public.depreciacion from tms_app;
comment on view public.depreciacion is 'compat:estandar-oltp-59: nombre viejo de public.tbl_depreciacion; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.depreciacion to tms_app;

create or replace view public.dispatch_guides as
 SELECT id,
    organization_id,
    route_id,
    order_id,
    guide_number,
    sequence_number,
    planned_arrival_time,
    actual_arrival_time,
    planned_departure_time,
    actual_departure_time,
    status,
    delivery_status,
    signature_url,
    photo_url,
    recipient_name,
    recipient_id,
    notes,
    created_at,
    updated_at,
    stop_type
   FROM tbl_dispatch_guides;
alter view public.dispatch_guides owner to olo_db;
revoke all on public.dispatch_guides from tms_app;
comment on view public.dispatch_guides is 'compat:estandar-oltp-59: nombre viejo de public.tbl_dispatch_guides; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.dispatch_guides to tms_app;

create or replace view public.driver_license_types as
 SELECT id,
    code,
    name,
    description,
    orden,
    activo,
    created_at,
    updated_at,
    country_id,
    vehicle_restrictions,
    validity_rules
   FROM tbl_driver_license_types;
alter view public.driver_license_types owner to olo_db;
revoke all on public.driver_license_types from tms_app;
comment on view public.driver_license_types is 'compat:estandar-oltp-59: nombre viejo de public.tbl_driver_license_types; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.driver_license_types to tms_app;

create or replace view public.driver_licenses as
 SELECT id,
    driver_id,
    driver_license_type_id,
    license_number,
    expiry_date,
    created_at
   FROM tbl_driver_licenses;
alter view public.driver_licenses owner to olo_db;
revoke all on public.driver_licenses from tms_app;
comment on view public.driver_licenses is 'compat:estandar-oltp-59: nombre viejo de public.tbl_driver_licenses; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.driver_licenses to tms_app;

create or replace view public.driver_presence as
 SELECT driver_id,
    organization_id,
    status,
    last_event,
    last_seen_at,
    device_id,
    battery_pct,
    updated_at
   FROM tbl_driver_presence;
alter view public.driver_presence owner to olo_db;
revoke all on public.driver_presence from tms_app;
comment on view public.driver_presence is 'compat:estandar-oltp-59: nombre viejo de public.tbl_driver_presence; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.driver_presence to tms_app;

create or replace view public.drivers as
 SELECT id,
    organization_id,
    carrier_id,
    code,
    full_name,
    license_number,
    license_expiry,
    phone,
    email,
    photo_url,
    status,
    created_at,
    updated_at,
    document,
    license_type,
    notes,
    license_type_id,
    app_user_id
   FROM tbl_drivers;
alter view public.drivers owner to olo_db;
revoke all on public.drivers from tms_app;
comment on view public.drivers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_drivers; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.drivers to tms_app;

create or replace view public.final_customers as
 SELECT id,
    customer_id,
    external_code,
    name,
    region,
    status,
    created_at,
    updated_at,
    customer_type,
    short_name,
    contact,
    phone,
    mobile,
    email,
    erp_reference,
    wms_client_type,
    wms_client_class
   FROM tbl_final_customers;
alter view public.final_customers owner to olo_db;
revoke all on public.final_customers from tms_app;
comment on view public.final_customers is 'compat:estandar-oltp-59: nombre viejo de public.tbl_final_customers; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.final_customers to tms_app;

create or replace view public.mobile_refresh_tokens as
 SELECT id,
    app_user_id,
    token_hash,
    device_id,
    created_at,
    expires_at,
    revoked_at
   FROM tbl_mobile_refresh_tokens;
alter view public.mobile_refresh_tokens owner to olo_db;
revoke all on public.mobile_refresh_tokens from tms_app;
comment on view public.mobile_refresh_tokens is 'compat:estandar-oltp-59: nombre viejo de public.tbl_mobile_refresh_tokens; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.mobile_refresh_tokens to tms_app;

create or replace view public.oms_logs as
 SELECT id,
    created_at,
    level,
    action,
    corrida_id,
    message,
    detail,
    actor
   FROM tbl_oms_logs;
alter view public.oms_logs owner to olo_db;
revoke all on public.oms_logs from tms_app;
comment on view public.oms_logs is 'compat:estandar-oltp-59: nombre viejo de public.tbl_oms_logs; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.oms_logs to tms_app;

create or replace view public.oms_rule_configs as
 SELECT id,
    scope_type,
    customer_id,
    warehouse_id,
    country_id,
    priorizar,
    reglas,
    dias_prep_picking,
    activo,
    created_at,
    updated_at,
    escala_prioridad,
    estrategia,
    ancla_fecha,
    prioridad_piso
   FROM tbl_oms_rule_configs;
alter view public.oms_rule_configs owner to olo_db;
revoke all on public.oms_rule_configs from tms_app;
comment on view public.oms_rule_configs is 'compat:estandar-oltp-59: nombre viejo de public.tbl_oms_rule_configs; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.oms_rule_configs to tms_app;

create or replace view public.order_items as
 SELECT id,
    order_id,
    product_code,
    product_name,
    quantity,
    weight,
    volume,
    unit_price,
    total_price,
    created_at,
    guia_fiscal,
    line_number,
    presentation,
    lot,
    quantity_prepared,
    quantity_loaded,
    quantity_cancelled,
    expiry_date,
    wms_status,
    wms_situation,
    notes
   FROM tbl_order_items;
alter view public.order_items owner to olo_db;
revoke all on public.order_items from tms_app;
comment on view public.order_items is 'compat:estandar-oltp-59: nombre viejo de public.tbl_order_items; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.order_items to tms_app;

create or replace view public.organizations as
 SELECT id,
    name,
    slug,
    logo_url,
    status,
    created_at,
    updated_at
   FROM tbl_organizations;
alter view public.organizations owner to olo_db;
revoke all on public.organizations from tms_app;
comment on view public.organizations is 'compat:estandar-oltp-59: nombre viejo de public.tbl_organizations; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.organizations to tms_app;

create or replace view public.parametros_globales as
 SELECT clave,
    valor,
    unidad,
    descripcion,
    updated_at
   FROM tbl_parametros_globales;
alter view public.parametros_globales owner to olo_db;
revoke all on public.parametros_globales from tms_app;
comment on view public.parametros_globales is 'compat:estandar-oltp-59: nombre viejo de public.tbl_parametros_globales; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.parametros_globales to tms_app;

create or replace view public.plan_stops as
 SELECT id,
    trip_id,
    order_id,
    stop_order,
    created_at,
    order_number,
    customer_name,
    delivery_city,
    delivery_zone,
    latitude,
    longitude,
    weight,
    volume,
    es_cliente_retira,
    stop_type,
    return_id
   FROM tbl_plan_stops;
alter view public.plan_stops owner to olo_db;
revoke all on public.plan_stops from tms_app;
comment on view public.plan_stops is 'compat:estandar-oltp-59: nombre viejo de public.tbl_plan_stops; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.plan_stops to tms_app;

create or replace view public.plan_trips as
 SELECT id,
    plan_id,
    vehicle_id,
    driver_id,
    delivery_zone,
    sequence_order,
    total_weight,
    total_volume,
    created_at,
    updated_at,
    vehicle_plate,
    vehicle_capacity_weight,
    vehicle_capacity_volume,
    is_owned,
    status,
    numero_viaje,
    lead_time_days
   FROM tbl_plan_trips;
alter view public.plan_trips owner to olo_db;
revoke all on public.plan_trips from tms_app;
comment on view public.plan_trips is 'compat:estandar-oltp-59: nombre viejo de public.tbl_plan_trips; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.plan_trips to tms_app;

create or replace view public.rates as
 SELECT id,
    organization_id,
    carrier_id,
    country_id,
    rate_type,
    zone,
    base_rate,
    per_km_rate,
    per_delivery_rate,
    per_return_rate,
    min_charge,
    effective_from,
    effective_to,
    status,
    created_at,
    updated_at,
    tariff_type_id,
    occupancy_pct
   FROM tbl_rates;
alter view public.rates owner to olo_db;
revoke all on public.rates from tms_app;
comment on view public.rates is 'compat:estandar-oltp-59: nombre viejo de public.tbl_rates; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.rates to tms_app;

create or replace view public.returns as
 SELECT id,
    organization_id,
    dispatch_guide_id,
    order_id,
    return_number,
    return_type,
    return_date,
    reason,
    product_code,
    product_name,
    quantity,
    photo_url,
    signature_url,
    notes,
    status,
    created_at,
    updated_at,
    received_at,
    received_by,
    received_quantity,
    received_condition,
    pickup_date
   FROM tbl_returns;
alter view public.returns owner to olo_db;
revoke all on public.returns from tms_app;
comment on view public.returns is 'compat:estandar-oltp-59: nombre viejo de public.tbl_returns; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.returns to tms_app;

create or replace view public.role_countries as
 SELECT role_id,
    country_id
   FROM tbl_role_countries;
alter view public.role_countries owner to olo_db;
revoke all on public.role_countries from tms_app;
comment on view public.role_countries is 'compat:estandar-oltp-59: nombre viejo de public.tbl_role_countries; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.role_countries to tms_app;

create or replace view public.role_permissions as
 SELECT role_id,
    module_key,
    action
   FROM tbl_role_permissions;
alter view public.role_permissions owner to olo_db;
revoke all on public.role_permissions from tms_app;
comment on view public.role_permissions is 'compat:estandar-oltp-59: nombre viejo de public.tbl_role_permissions; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.role_permissions to tms_app;

create or replace view public.roles as
 SELECT id,
    name,
    description,
    created_at,
    all_countries
   FROM tbl_roles;
alter view public.roles owner to olo_db;
revoke all on public.roles from tms_app;
comment on view public.roles is 'compat:estandar-oltp-59: nombre viejo de public.tbl_roles; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.roles to tms_app;

create or replace view public.route_plans as
 SELECT id,
    organization_id,
    country_id,
    warehouse_id,
    plan_date,
    status,
    created_by,
    notes,
    created_at,
    updated_at,
    customer_id
   FROM tbl_route_plans;
alter view public.route_plans owner to olo_db;
revoke all on public.route_plans from tms_app;
comment on view public.route_plans is 'compat:estandar-oltp-59: nombre viejo de public.tbl_route_plans; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.route_plans to tms_app;

create or replace view public.routes as
 SELECT id,
    organization_id,
    store_id,
    driver_id,
    vehicle_id,
    carrier_id,
    route_number,
    route_date,
    planned_start_time,
    actual_start_time,
    planned_end_time,
    actual_end_time,
    total_distance,
    total_stops,
    completed_stops,
    total_weight,
    total_volume,
    status,
    notes,
    created_at,
    updated_at,
    route_type_id,
    capacity_percentage,
    plan_trip_id,
    departed_at
   FROM tbl_routes;
alter view public.routes owner to olo_db;
revoke all on public.routes from tms_app;
comment on view public.routes is 'compat:estandar-oltp-59: nombre viejo de public.tbl_routes; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.routes to tms_app;

create or replace view public.rutas_costeo as
 SELECT id,
    user_id,
    nombre,
    codigo_camion,
    kilometros,
    dias,
    horas,
    con_ayudante,
    precio_diesel,
    tipo_cambio,
    dias_operativos,
    factor_ocupacion,
    factor_volumetrico,
    carga_peso_kg,
    carga_vol_m3,
    costo_fijo,
    costo_combustible,
    costo_mantenimiento,
    costo_horas_extra,
    costo_total,
    notas,
    created_at,
    updated_at
   FROM tbl_rutas_costeo;
alter view public.rutas_costeo owner to olo_db;
revoke all on public.rutas_costeo from tms_app;
comment on view public.rutas_costeo is 'compat:estandar-oltp-59: nombre viejo de public.tbl_rutas_costeo; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.rutas_costeo to tms_app;

create or replace view public.settlements as
 SELECT id,
    organization_id,
    route_id,
    carrier_id,
    driver_id,
    settlement_number,
    settlement_date,
    total_distance,
    total_deliveries,
    total_returns,
    base_amount,
    distance_amount,
    delivery_amount,
    return_amount,
    bonus_amount,
    penalty_amount,
    total_amount,
    status,
    notes,
    created_at,
    updated_at
   FROM tbl_settlements;
alter view public.settlements owner to olo_db;
revoke all on public.settlements from tms_app;
comment on view public.settlements is 'compat:estandar-oltp-59: nombre viejo de public.tbl_settlements; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.settlements to tms_app;

create or replace view public.sku_cotizaciones as
 SELECT id,
    ruta_id,
    user_id,
    referencia,
    peso_kg,
    volumen_m3,
    cantidad,
    peso_volumetrico,
    peso_facturable,
    costo_unitario,
    costo_total,
    max_uds_peso,
    max_uds_volumen,
    max_uds_efectivo,
    created_at
   FROM tbl_sku_cotizaciones;
alter view public.sku_cotizaciones owner to olo_db;
revoke all on public.sku_cotizaciones from tms_app;
comment on view public.sku_cotizaciones is 'compat:estandar-oltp-59: nombre viejo de public.tbl_sku_cotizaciones; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.sku_cotizaciones to tms_app;

create or replace view public.stores as
 SELECT id,
    organization_id,
    country_id,
    name,
    code,
    address,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    phone,
    email,
    status,
    created_at,
    updated_at,
    store_type,
    manager_name,
    opening_hours,
    capacity,
    area_m2,
    notes,
    contact_name,
    contact_phone,
    contact_email,
    delivery_zone,
    is_origin,
    warehouse_id
   FROM tbl_stores;
alter view public.stores owner to olo_db;
revoke all on public.stores from tms_app;
comment on view public.stores is 'compat:estandar-oltp-59: nombre viejo de public.tbl_stores; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.stores to tms_app;

create or replace view public.tarifas_audit_log as
 SELECT id,
    entity,
    entity_id,
    action,
    user_name,
    role,
    before,
    after,
    reason,
    created_at
   FROM tbl_tarifas_audit_log;
alter view public.tarifas_audit_log owner to olo_db;
revoke all on public.tarifas_audit_log from tms_app;
comment on view public.tarifas_audit_log is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_audit_log; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select on public.tarifas_audit_log to tms_app;

create or replace view public.tarifas_cost_structure_rows as
 SELECT id,
    structure_id,
    code,
    label,
    driver,
    amount,
    sign,
    applies_when,
    unit,
    row_order,
    active,
    cost_group,
    frequency,
    frequency_qty,
    unit_qty,
    cost_per_km,
    truck_type
   FROM tbl_tarifas_cost_structure_rows;
alter view public.tarifas_cost_structure_rows owner to olo_db;
revoke all on public.tarifas_cost_structure_rows from tms_app;
comment on view public.tarifas_cost_structure_rows is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_cost_structure_rows; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_cost_structure_rows to tms_app;

create or replace view public.tarifas_cost_structures as
 SELECT id,
    party_id,
    country_id,
    name,
    operating_days_per_month,
    effective_from,
    active,
    notes,
    params
   FROM tbl_tarifas_cost_structures;
alter view public.tarifas_cost_structures owner to olo_db;
revoke all on public.tarifas_cost_structures from tms_app;
comment on view public.tarifas_cost_structures is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_cost_structures; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_cost_structures to tms_app;

create or replace view public.tarifas_country_settings as
 SELECT id,
    country_id,
    rounding_decimals,
    rounding_mode,
    overnight_threshold_hours
   FROM tbl_tarifas_country_settings;
alter view public.tarifas_country_settings owner to olo_db;
revoke all on public.tarifas_country_settings from tms_app;
comment on view public.tarifas_country_settings is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_country_settings; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_country_settings to tms_app;

create or replace view public.tarifas_margin_policies as
 SELECT id,
    country_id,
    warn_below,
    critical_below,
    require_reason_below,
    block_on_loss
   FROM tbl_tarifas_margin_policies;
alter view public.tarifas_margin_policies owner to olo_db;
revoke all on public.tarifas_margin_policies from tms_app;
comment on view public.tarifas_margin_policies is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_margin_policies; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_margin_policies to tms_app;

create or replace view public.tarifas_party_variables as
 SELECT id,
    party_id,
    key,
    label,
    kind,
    origin,
    default_value,
    unit,
    active
   FROM tbl_tarifas_party_variables;
alter view public.tarifas_party_variables owner to olo_db;
revoke all on public.tarifas_party_variables from tms_app;
comment on view public.tarifas_party_variables is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_party_variables; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_party_variables to tms_app;

create or replace view public.tarifas_pricing_rules as
 SELECT id,
    country_id,
    scope,
    party_id,
    code,
    name,
    stage,
    priority,
    stacking,
    exclusion_group,
    conditions,
    expression,
    description,
    reason,
    effect,
    builder,
    condition_builder,
    is_adhoc,
    active,
    effective_from,
    effective_to,
    version,
    base_method,
    applies_to_base,
    category
   FROM tbl_tarifas_pricing_rules;
alter view public.tarifas_pricing_rules owner to olo_db;
revoke all on public.tarifas_pricing_rules from tms_app;
comment on view public.tarifas_pricing_rules is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_pricing_rules; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_pricing_rules to tms_app;

create or replace view public.tarifas_pricing_templates as
 SELECT id,
    country_id,
    name,
    trip
   FROM tbl_tarifas_pricing_templates;
alter view public.tarifas_pricing_templates owner to olo_db;
revoke all on public.tarifas_pricing_templates from tms_app;
comment on view public.tarifas_pricing_templates is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_pricing_templates; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_pricing_templates to tms_app;

create or replace view public.tarifas_proforma_claims as
 SELECT id,
    country_id,
    proforma_id,
    phase_id,
    phase_name,
    raised_by,
    raised_role,
    reason,
    status,
    appeal_reason,
    appealed_by,
    appealed_at,
    resolved_by,
    resolved_at,
    created_at
   FROM tbl_tarifas_proforma_claims;
alter view public.tarifas_proforma_claims owner to olo_db;
revoke all on public.tarifas_proforma_claims from tms_app;
comment on view public.tarifas_proforma_claims is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_claims; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_proforma_claims to tms_app;

create or replace view public.tarifas_proforma_email_config as
 SELECT id,
    country_id,
    recipients,
    include_carrier_email,
    subject_template,
    body_template,
    mode
   FROM tbl_tarifas_proforma_email_config;
alter view public.tarifas_proforma_email_config owner to olo_db;
revoke all on public.tarifas_proforma_email_config from tms_app;
comment on view public.tarifas_proforma_email_config is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_email_config; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_proforma_email_config to tms_app;

create or replace view public.tarifas_proforma_flow_phases as
 SELECT id,
    country_id,
    "position",
    name,
    approver_type,
    role_name,
    user_id,
    approver_label,
    active
   FROM tbl_tarifas_proforma_flow_phases;
alter view public.tarifas_proforma_flow_phases owner to olo_db;
revoke all on public.tarifas_proforma_flow_phases from tms_app;
comment on view public.tarifas_proforma_flow_phases is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_flow_phases; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_proforma_flow_phases to tms_app;

create or replace view public.tarifas_proforma_items as
 SELECT id,
    proforma_id,
    settlement_id,
    state,
    exclusion_reason,
    amount
   FROM tbl_tarifas_proforma_items;
alter view public.tarifas_proforma_items owner to olo_db;
revoke all on public.tarifas_proforma_items from tms_app;
comment on view public.tarifas_proforma_items is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_items; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_proforma_items to tms_app;

create or replace view public.tarifas_proforma_phases as
 SELECT id,
    proforma_id,
    "position",
    name,
    approver_type,
    role_name,
    user_id,
    approver_label,
    state,
    decided_by,
    decided_at,
    comment,
    removed_by
   FROM tbl_tarifas_proforma_phases;
alter view public.tarifas_proforma_phases owner to olo_db;
revoke all on public.tarifas_proforma_phases from tms_app;
comment on view public.tarifas_proforma_phases is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proforma_phases; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_proforma_phases to tms_app;

create or replace view public.tarifas_proformas as
 SELECT id,
    country_id,
    number,
    carrier_id,
    carrier_name,
    status,
    currency,
    total_amount,
    created_by,
    email_sent_at,
    notes,
    created_at,
    updated_at
   FROM tbl_tarifas_proformas;
alter view public.tarifas_proformas owner to olo_db;
revoke all on public.tarifas_proformas from tms_app;
comment on view public.tarifas_proformas is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_proformas; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_proformas to tms_app;

create or replace view public.tarifas_rate_table_rows as
 SELECT id,
    table_id,
    key,
    amount,
    row_order,
    active,
    extra_values
   FROM tbl_tarifas_rate_table_rows;
alter view public.tarifas_rate_table_rows owner to olo_db;
revoke all on public.tarifas_rate_table_rows from tms_app;
comment on view public.tarifas_rate_table_rows is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_rate_table_rows; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_rate_table_rows to tms_app;

create or replace view public.tarifas_rate_tables as
 SELECT id,
    country_id,
    party_id,
    code,
    name,
    key_columns,
    active,
    value_columns
   FROM tbl_tarifas_rate_tables;
alter view public.tarifas_rate_tables owner to olo_db;
revoke all on public.tarifas_rate_tables from tms_app;
comment on view public.tarifas_rate_tables is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_rate_tables; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_rate_tables to tms_app;

create or replace view public.tarifas_settlement_parties as
 SELECT id,
    carrier_id,
    status,
    notes
   FROM tbl_tarifas_settlement_parties;
alter view public.tarifas_settlement_parties owner to olo_db;
revoke all on public.tarifas_settlement_parties from tms_app;
comment on view public.tarifas_settlement_parties is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_settlement_parties; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_settlement_parties to tms_app;

create or replace view public.tarifas_settlements as
 SELECT id,
    country_id,
    trip_id,
    party_id,
    number,
    trip_number,
    settlement_date,
    status,
    currency,
    total_amount,
    notes,
    margin_reason,
    margin_status,
    margin_amount,
    margin_pct,
    cost_total,
    cost_model_id,
    trip_info,
    trip_edits,
    trip,
    trace,
    discarded,
    stage_subtotals,
    warnings,
    overrides,
    adhoc_rules,
    excluded_seqs,
    returns,
    superseded_by,
    created_at,
    updated_at,
    rules_used,
    cargo_value,
    allocation,
    orders,
    base_change,
    void_kind,
    void_reason,
    claim_id,
    from_claim_id
   FROM tbl_tarifas_settlements;
alter view public.tarifas_settlements owner to olo_db;
revoke all on public.tarifas_settlements from tms_app;
comment on view public.tarifas_settlements is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_settlements; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_settlements to tms_app;

create or replace view public.tarifas_trip_order_marks as
 SELECT id,
    country_id,
    trip_id,
    order_id,
    mark,
    reason,
    actor
   FROM tbl_tarifas_trip_order_marks;
alter view public.tarifas_trip_order_marks owner to olo_db;
revoke all on public.tarifas_trip_order_marks from tms_app;
comment on view public.tarifas_trip_order_marks is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_trip_order_marks; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_trip_order_marks to tms_app;

create or replace view public.tarifas_trip_tender_awards as
 SELECT id,
    country_id,
    trip_id,
    carrier_id,
    amount,
    awarded_at,
    actor,
    notes
   FROM tbl_tarifas_trip_tender_awards;
alter view public.tarifas_trip_tender_awards owner to olo_db;
revoke all on public.tarifas_trip_tender_awards from tms_app;
comment on view public.tarifas_trip_tender_awards is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_trip_tender_awards; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_trip_tender_awards to tms_app;

create or replace view public.tarifas_v_devoluciones as
 SELECT id,
    route_id,
    dispatch_guide_id,
    return_number,
    return_type,
    reason,
    product_code,
    product_name,
    quantity,
    status
   FROM vw_tarifas_devoluciones;
alter view public.tarifas_v_devoluciones owner to olo_db;
revoke all on public.tarifas_v_devoluciones from tms_app;
comment on view public.tarifas_v_devoluciones is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_devoluciones; se retira tras redesplegar todos los stacks (ADR-0005)';
grant select on public.tarifas_v_devoluciones to tms_app;

create or replace view public.tarifas_v_viaje_cargas as
 SELECT id,
    route_id,
    customer_id,
    customer_code,
    customer_name,
    value,
    weight_kg,
    volume_m3,
    items,
    orders
   FROM vw_tarifas_viaje_cargas;
alter view public.tarifas_v_viaje_cargas owner to olo_db;
revoke all on public.tarifas_v_viaje_cargas from tms_app;
comment on view public.tarifas_v_viaje_cargas is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_viaje_cargas; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_v_viaje_cargas to tms_app;

create or replace view public.tarifas_v_viaje_pedidos as
 SELECT id,
    route_id,
    guide_number,
    sequence_number,
    delivery_status,
    order_id,
    order_number,
    customer_id,
    customer_code,
    customer_name,
    value,
    weight_kg,
    volume_m3,
    items,
    mark,
    mark_reason
   FROM vw_tarifas_viaje_pedidos;
alter view public.tarifas_v_viaje_pedidos owner to olo_db;
revoke all on public.tarifas_v_viaje_pedidos from tms_app;
comment on view public.tarifas_v_viaje_pedidos is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_viaje_pedidos; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_v_viaje_pedidos to tms_app;

create or replace view public.tarifas_v_viajes as
 SELECT id,
    country_id,
    route_number,
    route_date,
    status,
    carrier_id,
    carrier_name,
    is_flota_propia,
    driver_id,
    driver_name,
    driver_document,
    vehicle_id,
    vehicle_plate,
    vehicle_type,
    capacity_weight,
    capacity_volume,
    dest_zone_id,
    dest_zone_code,
    dest_zone_name,
    total_distance,
    total_stops,
    completed_stops,
    total_weight,
    total_volume,
    actual_start_time,
    actual_end_time,
    duration_hours,
    guide_count,
    return_count,
    settlement_id,
    delivered_guides,
    novedad_count,
    pickup_count
   FROM vw_tarifas_viajes;
alter view public.tarifas_v_viajes owner to olo_db;
revoke all on public.tarifas_v_viajes from tms_app;
comment on view public.tarifas_v_viajes is 'compat:estandar-oltp-59: nombre viejo de public.vw_tarifas_viajes; se retira tras redesplegar todos los stacks (ADR-0005)';
grant select on public.tarifas_v_viajes to tms_app;

create or replace view public.tarifas_zone_groups as
 SELECT id,
    country_id,
    code,
    name,
    zone_codes,
    status
   FROM tbl_tarifas_zone_groups;
alter view public.tarifas_zone_groups owner to olo_db;
revoke all on public.tarifas_zone_groups from tms_app;
comment on view public.tarifas_zone_groups is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tarifas_zone_groups; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tarifas_zone_groups to tms_app;

create or replace view public.tariff_types as
 SELECT id,
    code,
    name,
    description,
    orden,
    activo,
    created_at,
    updated_at
   FROM tbl_tariff_types;
alter view public.tariff_types owner to olo_db;
revoke all on public.tariff_types from tms_app;
comment on view public.tariff_types is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tariff_types; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tariff_types to tms_app;

create or replace view public.tipos_camion as
 SELECT codigo,
    etiqueta,
    descripcion,
    capacidad_kg,
    capacidad_m3,
    km_por_litro,
    orden,
    created_at
   FROM tbl_tipos_camion;
alter view public.tipos_camion owner to olo_db;
revoke all on public.tipos_camion from tms_app;
comment on view public.tipos_camion is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tipos_camion; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tipos_camion to tms_app;

create or replace view public.tracking_consents as
 SELECT id,
    organization_id,
    app_user_id,
    version,
    consented_at,
    device_id
   FROM tbl_tracking_consents;
alter view public.tracking_consents owner to olo_db;
revoke all on public.tracking_consents from tms_app;
comment on view public.tracking_consents is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_consents; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tracking_consents to tms_app;

create or replace view public.tracking_events as
 SELECT id,
    organization_id,
    route_id,
    dispatch_guide_id,
    event_type,
    event_status,
    event_time,
    latitude,
    longitude,
    notes,
    created_by,
    created_at,
    distance_m,
    client_id
   FROM tbl_tracking_events;
alter view public.tracking_events owner to olo_db;
revoke all on public.tracking_events from tms_app;
comment on view public.tracking_events is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_events; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tracking_events to tms_app;

create or replace view public.tracking_evidences as
 SELECT id,
    organization_id,
    route_id,
    dispatch_guide_id,
    kind,
    storage_key,
    mime_type,
    size_bytes,
    captured_at,
    latitude,
    longitude,
    client_id,
    created_by,
    created_at,
    order_id,
    order_number,
    storage_bucket
   FROM tbl_tracking_evidences;
alter view public.tracking_evidences owner to olo_db;
revoke all on public.tracking_evidences from tms_app;
comment on view public.tracking_evidences is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_evidences; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tracking_evidences to tms_app;

create or replace view public.tracking_last_positions as
 SELECT route_id,
    organization_id,
    latitude,
    longitude,
    speed_mps,
    heading_deg,
    battery_pct,
    recorded_at,
    updated_at
   FROM tbl_tracking_last_positions;
alter view public.tracking_last_positions owner to olo_db;
revoke all on public.tracking_last_positions from tms_app;
comment on view public.tracking_last_positions is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_last_positions; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tracking_last_positions to tms_app;

create or replace view public.tracking_positions as
 SELECT id,
    organization_id,
    route_id,
    vehicle_id,
    driver_id,
    device_id,
    client_id,
    latitude,
    longitude,
    accuracy_m,
    speed_mps,
    heading_deg,
    battery_pct,
    is_mock,
    recorded_at,
    received_at
   FROM tbl_tracking_positions;
alter view public.tracking_positions owner to olo_db;
revoke all on public.tracking_positions from tms_app;
comment on view public.tracking_positions is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_positions; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tracking_positions to tms_app;

create or replace view public.tracking_reviews as
 SELECT route_id,
    organization_id,
    reviewed_by,
    reviewed_at,
    note
   FROM tbl_tracking_reviews;
alter view public.tracking_reviews owner to olo_db;
revoke all on public.tracking_reviews from tms_app;
comment on view public.tracking_reviews is 'compat:estandar-oltp-59: nombre viejo de public.tbl_tracking_reviews; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.tracking_reviews to tms_app;

create or replace view public.user_scopes as
 SELECT id,
    app_user_id,
    role_id,
    country_id,
    warehouse_id,
    customer_id,
    created_at
   FROM tbl_user_scopes;
alter view public.user_scopes owner to olo_db;
revoke all on public.user_scopes from tms_app;
comment on view public.user_scopes is 'compat:estandar-oltp-59: nombre viejo de public.tbl_user_scopes; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.user_scopes to tms_app;

create or replace view public.v_costo_fijo_mensual as
 SELECT codigo_camion,
    etiqueta,
    total_conductor,
    total_ayudante,
    total_otros,
    depreciacion_mensual,
    fijo_sin_ayudante,
    fijo_con_ayudante
   FROM vw_costo_fijo_mensual;
alter view public.v_costo_fijo_mensual owner to olo_db;
revoke all on public.v_costo_fijo_mensual from tms_app;
comment on view public.v_costo_fijo_mensual is 'compat:estandar-oltp-59: nombre viejo de public.vw_costo_fijo_mensual; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.v_costo_fijo_mensual to tms_app;

create or replace view public.v_costo_variable_por_km as
 SELECT id,
    componente,
    frecuencia,
    cantidad,
    codigo_camion,
    frecuencia_valor,
    costo_valor,
    costo_por_km
   FROM vw_costo_variable_por_km;
alter view public.v_costo_variable_por_km owner to olo_db;
revoke all on public.v_costo_variable_por_km from tms_app;
comment on view public.v_costo_variable_por_km is 'compat:estandar-oltp-59: nombre viejo de public.vw_costo_variable_por_km; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.v_costo_variable_por_km to tms_app;

create or replace view public.vehicle_types as
 SELECT id,
    organization_id,
    name,
    description,
    icon,
    status,
    created_at,
    updated_at
   FROM tbl_vehicle_types;
alter view public.vehicle_types owner to olo_db;
revoke all on public.vehicle_types from tms_app;
comment on view public.vehicle_types is 'compat:estandar-oltp-59: nombre viejo de public.tbl_vehicle_types; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.vehicle_types to tms_app;

create or replace view public.vehicles as
 SELECT id,
    organization_id,
    carrier_id,
    plate,
    brand,
    model,
    year,
    vehicle_type,
    capacity_weight,
    capacity_volume,
    fuel_type,
    status,
    created_at,
    updated_at,
    pallets,
    image_url,
    notes,
    container_width,
    container_height,
    container_length,
    container_unit
   FROM tbl_vehicles;
alter view public.vehicles owner to olo_db;
revoke all on public.vehicles from tms_app;
comment on view public.vehicles is 'compat:estandar-oltp-59: nombre viejo de public.tbl_vehicles; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.vehicles to tms_app;

create or replace view public.warehouses as
 SELECT id,
    organization_id,
    country_id,
    code,
    name,
    timezone,
    currency_id,
    address,
    latitude,
    longitude,
    active,
    created_at,
    updated_at,
    source_system,
    external_code
   FROM tbl_warehouses;
alter view public.warehouses owner to olo_db;
revoke all on public.warehouses from tms_app;
comment on view public.warehouses is 'compat:estandar-oltp-59: nombre viejo de public.tbl_warehouses; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.warehouses to tms_app;

create or replace view public.wms_expediciones as
 SELECT id,
    organization_id,
    warehouse_id,
    id_compania,
    id_sucursal,
    expedicion,
    tipo_expedicion,
    estado,
    situacion,
    avance_pct,
    ruta,
    cliente_code,
    nombre_cliente,
    final_customer_id,
    cant_lineas,
    muelle_asignado,
    fecha_expedicion,
    fecha_planificada,
    prioridad,
    numero_viaje_wmh,
    observaciones,
    created_at,
    updated_at,
    viaje_asignado_at,
    viaje_asignado_por
   FROM tbl_wms_expediciones;
alter view public.wms_expediciones owner to olo_db;
revoke all on public.wms_expediciones from tms_app;
comment on view public.wms_expediciones is 'compat:estandar-oltp-59: nombre viejo de public.tbl_wms_expediciones; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.wms_expediciones to tms_app;

create or replace view public.wms_expediciones_detalle as
 SELECT id,
    expedicion_id,
    id_linea,
    id_articulo,
    descripcion,
    cantidad,
    peso,
    volumen,
    guia_fiscal,
    prioridad,
    estado,
    situacion,
    created_at,
    updated_at
   FROM tbl_wms_expediciones_detalle;
alter view public.wms_expediciones_detalle owner to olo_db;
revoke all on public.wms_expediciones_detalle from tms_app;
comment on view public.wms_expediciones_detalle is 'compat:estandar-oltp-59: nombre viejo de public.tbl_wms_expediciones_detalle; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.wms_expediciones_detalle to tms_app;

create or replace view public.zones as
 SELECT id,
    name,
    status,
    organization_id,
    created_at,
    updated_at,
    country_id,
    code,
    geofence,
    color
   FROM tbl_zones;
alter view public.zones owner to olo_db;
revoke all on public.zones from tms_app;
comment on view public.zones is 'compat:estandar-oltp-59: nombre viejo de public.tbl_zones; se retira tras redesplegar todos los stacks (ADR-0005)';
grant insert, select, update, delete on public.zones to tms_app;

-- Validación (debe dar el número de vistas de arriba)
select count(*) as vistas_compat from pg_class where relkind = 'v' and obj_description(oid, 'pg_class') like 'compat:estandar-oltp-59%';
