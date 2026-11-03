"""Nombres lógicos → físicos de tms_olo (estándar OLTP, sql/59; ADR-0014).

GENERADO por scripts/estandar-bd/generar_renombrado.py. No editar a mano: regenerar.
El contrato HTTP (/api/data/<tabla>, /api/tarifas/<tabla>) y la bitácora (audit.events.entity_table)
usan el nombre LÓGICO; el SQL usa el FÍSICO. Este es el único lugar donde se traduce.
"""

PHYSICAL: dict[str, str] = {
    'addresses': 'tbl_addresses',
    'app_modules': 'tbl_app_modules',
    'app_users': 'tbl_app_users',
    'auth_credentials': 'tbl_auth_credentials',
    'branches': 'tbl_branches',
    'carriers': 'tbl_carriers',
    'contacts': 'tbl_contacts',
    'contract_documents': 'tbl_contract_documents',
    'contracts': 'tbl_contracts',
    'costos_fijos': 'tbl_costos_fijos',
    'costos_variables': 'tbl_costos_variables',
    'countries': 'tbl_countries',
    'customers': 'tbl_customers',
    'delivery_points': 'tbl_delivery_points',
    'depreciacion': 'tbl_depreciacion',
    'dispatch_guides': 'tbl_dispatch_guides',
    'driver_license_types': 'tbl_driver_license_types',
    'driver_licenses': 'tbl_driver_licenses',
    'driver_presence': 'tbl_driver_presence',
    'drivers': 'tbl_drivers',
    'final_customers': 'tbl_final_customers',
    'mobile_refresh_tokens': 'tbl_mobile_refresh_tokens',
    'oms_logs': 'tbl_oms_logs',
    'oms_rule_configs': 'tbl_oms_rule_configs',
    'order_items': 'tbl_order_items',
    'orders': 'tbl_orders',
    'organizations': 'tbl_organizations',
    'parametros_globales': 'tbl_parametros_globales',
    'plan_stops': 'tbl_plan_stops',
    'plan_trips': 'tbl_plan_trips',
    'rates': 'tbl_rates',
    'returns': 'tbl_returns',
    'role_countries': 'tbl_role_countries',
    'role_permissions': 'tbl_role_permissions',
    'roles': 'tbl_roles',
    'route_plans': 'tbl_route_plans',
    'routes': 'tbl_routes',
    'rutas_costeo': 'tbl_rutas_costeo',
    'settlements': 'tbl_settlements',
    'sku_cotizaciones': 'tbl_sku_cotizaciones',
    'stores': 'tbl_stores',
    'tarifas_audit_log': 'tbl_tarifas_audit_log',
    'tarifas_cost_structure_rows': 'tbl_tarifas_cost_structure_rows',
    'tarifas_cost_structures': 'tbl_tarifas_cost_structures',
    'tarifas_country_settings': 'tbl_tarifas_country_settings',
    'tarifas_margin_policies': 'tbl_tarifas_margin_policies',
    'tarifas_party_variables': 'tbl_tarifas_party_variables',
    'tarifas_pricing_rules': 'tbl_tarifas_pricing_rules',
    'tarifas_pricing_templates': 'tbl_tarifas_pricing_templates',
    'tarifas_proforma_claims': 'tbl_tarifas_proforma_claims',
    'tarifas_proforma_email_config': 'tbl_tarifas_proforma_email_config',
    'tarifas_proforma_flow_phases': 'tbl_tarifas_proforma_flow_phases',
    'tarifas_proforma_items': 'tbl_tarifas_proforma_items',
    'tarifas_proforma_phases': 'tbl_tarifas_proforma_phases',
    'tarifas_proformas': 'tbl_tarifas_proformas',
    'tarifas_rate_table_rows': 'tbl_tarifas_rate_table_rows',
    'tarifas_rate_tables': 'tbl_tarifas_rate_tables',
    'tarifas_settlement_parties': 'tbl_tarifas_settlement_parties',
    'tarifas_settlements': 'tbl_tarifas_settlements',
    'tarifas_trip_order_marks': 'tbl_tarifas_trip_order_marks',
    'tarifas_trip_tender_awards': 'tbl_tarifas_trip_tender_awards',
    'tarifas_v_devoluciones': 'vw_tarifas_devoluciones',
    'tarifas_v_viaje_cargas': 'vw_tarifas_viaje_cargas',
    'tarifas_v_viaje_pedidos': 'vw_tarifas_viaje_pedidos',
    'tarifas_v_viajes': 'vw_tarifas_viajes',
    'tarifas_zone_groups': 'tbl_tarifas_zone_groups',
    'tariff_types': 'tbl_tariff_types',
    'tipos_camion': 'tbl_tipos_camion',
    'tracking_consents': 'tbl_tracking_consents',
    'tracking_events': 'tbl_tracking_events',
    'tracking_evidences': 'tbl_tracking_evidences',
    'tracking_last_positions': 'tbl_tracking_last_positions',
    'tracking_positions': 'tbl_tracking_positions',
    'tracking_reviews': 'tbl_tracking_reviews',
    'user_scopes': 'tbl_user_scopes',
    'v_costo_fijo_mensual': 'vw_costo_fijo_mensual',
    'v_costo_variable_por_km': 'vw_costo_variable_por_km',
    'vehicle_types': 'tbl_vehicle_types',
    'vehicles': 'tbl_vehicles',
    'warehouses': 'tbl_warehouses',
    'wms_expediciones': 'tbl_wms_expediciones',
    'wms_expediciones_detalle': 'tbl_wms_expediciones_detalle',
    'zones': 'tbl_zones',
}
LOGICAL: dict[str, str] = {v: k for k, v in PHYSICAL.items()}


def physical(name: str) -> str:
    """Nombre físico de una tabla/vista lógica (los que no están en el mapa se devuelven igual)."""
    return PHYSICAL.get(name, name)


def logical(name: str) -> str:
    """Nombre lógico de una tabla/vista física (inverso de physical)."""
    return LOGICAL.get(name, name)
