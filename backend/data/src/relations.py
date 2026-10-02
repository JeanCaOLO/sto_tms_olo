"""Mapa estático de foreign keys y lista blanca de tablas de tms_olo (schema public).

Portado 1:1 de server/tms-relations.mjs. Regenerar si cambia el esquema.
Las relaciones son todas "belongs-to" (columna *_id en la tabla hija).
"""

from tms_common.errors import HttpError

# (tabla hija, columna FK, tabla padre)
FOREIGN_KEYS: tuple[tuple[str, str, str], ...] = (
    ("app_users", "organization_id", "organizations"),
    ("app_users", "role_id", "roles"),
    ("carriers", "country_id", "countries"),
    ("carriers", "organization_id", "organizations"),
    ("contract_documents", "contract_id", "contracts"),
    ("contract_documents", "organization_id", "organizations"),
    ("contracts", "organization_id", "organizations"),
    ("countries", "organization_id", "organizations"),
    ("customers", "country_id", "countries"),
    ("customers", "organization_id", "organizations"),
    ("depreciacion", "codigo_camion", "tipos_camion"),
    ("dispatch_guides", "order_id", "orders"),
    ("dispatch_guides", "organization_id", "organizations"),
    ("dispatch_guides", "route_id", "routes"),
    ("drivers", "carrier_id", "carriers"),
    ("drivers", "organization_id", "organizations"),
    ("order_items", "order_id", "orders"),
    ("orders", "customer_id", "customers"),
    ("orders", "organization_id", "organizations"),
    ("orders", "store_id", "stores"),
    ("rates", "carrier_id", "carriers"),
    ("rates", "country_id", "countries"),
    ("rates", "organization_id", "organizations"),
    ("returns", "dispatch_guide_id", "dispatch_guides"),
    ("returns", "order_id", "orders"),
    ("returns", "organization_id", "organizations"),
    ("routes", "carrier_id", "carriers"),
    ("routes", "driver_id", "drivers"),
    ("routes", "organization_id", "organizations"),
    ("routes", "store_id", "stores"),
    ("routes", "vehicle_id", "vehicles"),
    ("rutas_costeo", "codigo_camion", "tipos_camion"),
    ("settlements", "carrier_id", "carriers"),
    ("settlements", "driver_id", "drivers"),
    ("settlements", "organization_id", "organizations"),
    ("settlements", "route_id", "routes"),
    ("sku_cotizaciones", "ruta_id", "rutas_costeo"),
    ("stores", "country_id", "countries"),
    ("stores", "organization_id", "organizations"),
    ("tracking_events", "dispatch_guide_id", "dispatch_guides"),
    ("tracking_events", "organization_id", "organizations"),
    ("tracking_events", "route_id", "routes"),
    ("vehicle_types", "organization_id", "organizations"),
    ("vehicles", "carrier_id", "carriers"),
    ("vehicles", "organization_id", "organizations"),
    ("drivers", "license_type_id", "driver_license_types"),
    ("rates", "tariff_type_id", "tariff_types"),
    # Fase 1 — Multi-country Foundation (sql/06_fase1_multicountry_foundation.sql).
    ("warehouses", "organization_id", "organizations"),
    ("warehouses", "country_id", "countries"),
    ("customers", "warehouse_id", "warehouses"),
    ("stores", "warehouse_id", "warehouses"),
    ("final_customers", "customer_id", "customers"),
    ("delivery_points", "final_customer_id", "final_customers"),
    ("delivery_points", "address_id", "addresses"),
    ("addresses", "country_id", "countries"),
    ("contacts", "final_customer_id", "final_customers"),
    ("contacts", "delivery_point_id", "delivery_points"),
    ("driver_license_types", "country_id", "countries"),
    ("driver_licenses", "driver_id", "drivers"),
    ("driver_licenses", "driver_license_type_id", "driver_license_types"),
    ("user_scopes", "app_user_id", "app_users"),
    ("user_scopes", "role_id", "roles"),
    ("user_scopes", "country_id", "countries"),
    ("user_scopes", "warehouse_id", "warehouses"),
    ("user_scopes", "customer_id", "customers"),
    # Fase 5 — staging del WMS real (sql/07_wms_expediciones_staging.sql).
    ("wms_expediciones", "organization_id", "organizations"),
    ("wms_expediciones", "warehouse_id", "warehouses"),
    ("wms_expediciones", "final_customer_id", "final_customers"),
    # Zonas (sql/09): route_types se renombró a zones (la vista de compatibilidad se retiró en sql/11).
    ("zones", "organization_id", "organizations"),
    ("zones", "country_id", "countries"),
    ("orders", "route_type_id", "zones"),
    ("routes", "route_type_id", "zones"),
    ("delivery_points", "zone_id", "zones"),  # sql/12
)

TABLES = frozenset({
    "app_users", "carriers", "contract_documents", "contracts", "costos_fijos",
    "costos_variables", "countries", "customers", "depreciacion", "dispatch_guides",
    "drivers", "order_items", "orders", "organizations", "parametros_globales",
    "rates", "returns", "roles", "routes", "rutas_costeo", "tariff_types",
    "settlements", "sku_cotizaciones", "stores", "tipos_camion", "tracking_events",
    "vehicle_types", "vehicles", "v_costo_fijo_mensual", "v_costo_variable_por_km",
    "warehouses", "final_customers", "delivery_points", "addresses", "contacts",
    "driver_license_types", "driver_licenses", "user_scopes",
    "wms_expediciones",
    "zones",  # ex route_types (sql/09)
})


def is_known_table(name: str) -> bool:
    return name in TABLES


def find_foreign_key(child: str, parent: str) -> str:
    matches = [column for c, column, p in FOREIGN_KEYS if c == child and p == parent]
    if not matches:
        raise HttpError(400, f'No hay foreign key de "{child}" hacia "{parent}"')
    if len(matches) > 1:
        raise HttpError(400, f'FK ambigua de "{child}" hacia "{parent}" (usa alias explícito)')
    return matches[0]
