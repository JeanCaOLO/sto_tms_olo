// Mapa estático de foreign keys del esquema tms_olo (schema public), usado para
// resolver los "embeds" del select-string (sintaxis `alias:tabla(cols)` o
// `tabla(cols)`) sin tener que introspeccionar el catálogo en cada request.
// Regenerar si cambia el esquema (ver server/README.md).
export const FOREIGN_KEYS = [
  { child: "app_users", column: "organization_id", parent: "organizations" },
  { child: "app_users", column: "role_id", parent: "roles" },
  { child: "carriers", column: "country_id", parent: "countries" },
  { child: "carriers", column: "organization_id", parent: "organizations" },
  { child: "contract_documents", column: "contract_id", parent: "contracts" },
  { child: "contract_documents", column: "organization_id", parent: "organizations" },
  { child: "contracts", column: "organization_id", parent: "organizations" },
  { child: "countries", column: "organization_id", parent: "organizations" },
  { child: "customers", column: "country_id", parent: "countries" },
  { child: "customers", column: "organization_id", parent: "organizations" },
  { child: "depreciacion", column: "codigo_camion", parent: "tipos_camion" },
  { child: "dispatch_guides", column: "order_id", parent: "orders" },
  { child: "dispatch_guides", column: "organization_id", parent: "organizations" },
  { child: "dispatch_guides", column: "route_id", parent: "routes" },
  { child: "drivers", column: "carrier_id", parent: "carriers" },
  { child: "drivers", column: "organization_id", parent: "organizations" },
  { child: "order_items", column: "order_id", parent: "orders" },
  { child: "orders", column: "customer_id", parent: "customers" },
  { child: "orders", column: "organization_id", parent: "organizations" },
  { child: "orders", column: "route_type_id", parent: "route_types" },
  { child: "orders", column: "store_id", parent: "stores" },
  { child: "rates", column: "carrier_id", parent: "carriers" },
  { child: "rates", column: "country_id", parent: "countries" },
  { child: "rates", column: "organization_id", parent: "organizations" },
  { child: "returns", column: "dispatch_guide_id", parent: "dispatch_guides" },
  { child: "returns", column: "order_id", parent: "orders" },
  { child: "returns", column: "organization_id", parent: "organizations" },
  { child: "route_types", column: "organization_id", parent: "organizations" },
  { child: "routes", column: "carrier_id", parent: "carriers" },
  { child: "routes", column: "driver_id", parent: "drivers" },
  { child: "routes", column: "organization_id", parent: "organizations" },
  { child: "routes", column: "route_type_id", parent: "route_types" },
  { child: "routes", column: "store_id", parent: "stores" },
  { child: "routes", column: "vehicle_id", parent: "vehicles" },
  { child: "rutas_costeo", column: "codigo_camion", parent: "tipos_camion" },
  { child: "settlements", column: "carrier_id", parent: "carriers" },
  { child: "settlements", column: "driver_id", parent: "drivers" },
  { child: "settlements", column: "organization_id", parent: "organizations" },
  { child: "settlements", column: "route_id", parent: "routes" },
  { child: "sku_cotizaciones", column: "ruta_id", parent: "rutas_costeo" },
  { child: "stores", column: "country_id", parent: "countries" },
  { child: "stores", column: "organization_id", parent: "organizations" },
  { child: "tracking_events", column: "dispatch_guide_id", parent: "dispatch_guides" },
  { child: "tracking_events", column: "organization_id", parent: "organizations" },
  { child: "tracking_events", column: "route_id", parent: "routes" },
  { child: "vehicle_types", column: "organization_id", parent: "organizations" },
  { child: "vehicles", column: "carrier_id", parent: "carriers" },
  { child: "vehicles", column: "organization_id", parent: "organizations" },
  { child: "drivers", column: "license_type_id", parent: "driver_license_types" },
  { child: "rates", column: "tariff_type_id", parent: "tariff_types" },

  // Fase 1 — Multi-country Foundation (docs/arquitectura-tms-oms/05-roadmap.md,
  // aplicada en Aurora vía sql/06_fase1_multicountry_foundation.sql).
  // license_types fue RENOMBRADA a driver_license_types (mismas filas/IDs).
  { child: "warehouses", column: "organization_id", parent: "organizations" },
  { child: "warehouses", column: "country_id", parent: "countries" },
  { child: "customers", column: "warehouse_id", parent: "warehouses" },
  { child: "stores", column: "warehouse_id", parent: "warehouses" },
  { child: "final_customers", column: "customer_id", parent: "customers" },
  { child: "delivery_points", column: "final_customer_id", parent: "final_customers" },
  { child: "delivery_points", column: "address_id", parent: "addresses" },
  { child: "addresses", column: "country_id", parent: "countries" },
  { child: "contacts", column: "final_customer_id", parent: "final_customers" },
  { child: "contacts", column: "delivery_point_id", parent: "delivery_points" },
  { child: "driver_license_types", column: "country_id", parent: "countries" },
  { child: "driver_licenses", column: "driver_id", parent: "drivers" },
  { child: "driver_licenses", column: "driver_license_type_id", parent: "driver_license_types" },
  { child: "user_scopes", column: "app_user_id", parent: "app_users" },
  { child: "user_scopes", column: "role_id", parent: "roles" },
  { child: "user_scopes", column: "country_id", parent: "countries" },
  { child: "user_scopes", column: "warehouse_id", parent: "warehouses" },
  { child: "user_scopes", column: "customer_id", parent: "customers" },

  // Staging del WMS real (docs/arquitectura-tms-oms/05-roadmap.md Fase 5),
  // aplicada vía sql/07_wms_expediciones_staging.sql.
  { child: "wms_expediciones", column: "organization_id", parent: "organizations" },
  { child: "wms_expediciones", column: "warehouse_id", parent: "warehouses" },
  { child: "wms_expediciones", column: "final_customer_id", parent: "final_customers" },
];

const TABLES = new Set([
  "app_users", "carriers", "contract_documents", "contracts", "costos_fijos",
  "costos_variables", "countries", "customers", "depreciacion", "dispatch_guides",
  "drivers", "order_items", "orders", "organizations", "parametros_globales",
  "rates", "returns", "roles", "route_types", "routes", "rutas_costeo", "tariff_types",
  "settlements", "sku_cotizaciones", "stores", "tipos_camion", "tracking_events",
  "vehicle_types", "vehicles", "v_costo_fijo_mensual", "v_costo_variable_por_km",
  // Fase 1 — Multi-country Foundation (nuevas tablas de sql/06_fase1_multicountry_foundation.sql).
  "warehouses", "final_customers", "delivery_points", "addresses", "contacts",
  "driver_license_types", "driver_licenses", "user_scopes",
  // Fase 5 — staging del WMS real (sql/07_wms_expediciones_staging.sql).
  "wms_expediciones",
]);

export function isKnownTable(name) {
  return TABLES.has(name);
}

// Todas las relaciones de este proyecto son "belongs-to" (columna *_id en la
// tabla hija). Dado tabla hija + tabla padre buscada en el select, devuelve la
// columna FK a usar en el JOIN.
export function findForeignKey(childTable, parentTable) {
  const matches = FOREIGN_KEYS.filter((fk) => fk.child === childTable && fk.parent === parentTable);
  if (matches.length === 0) {
    throw new Error(`No hay foreign key de "${childTable}" hacia "${parentTable}"`);
  }
  if (matches.length > 1) {
    throw new Error(`FK ambigua de "${childTable}" hacia "${parentTable}" (usa alias explícito)`);
  }
  return matches[0].column;
}
