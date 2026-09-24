"""Módulo de la matriz de permisos (sql/15) dueño de cada tabla de la API genérica.

Crear/editar/borrar en una tabla exige esa acción en su módulo. Una tabla sin
módulo solo la escribe un administrador (fail-closed).
"""

TABLE_MODULES: dict[str, str] = {
    "orders": "pedidos", "order_items": "pedidos",
    "returns": "devoluciones",
    "dispatch_guides": "guias",
    "routes": "planificacion", "wms_expediciones": "planificacion",
    "tracking_events": "tracking",
    "rates": "tarifas", "settlements": "tarifas", "tariff_types": "tarifas", "costos_fijos": "tarifas",
    "costos_variables": "tarifas", "depreciacion": "tarifas", "parametros_globales": "tarifas",
    "rutas_costeo": "tarifas", "sku_cotizaciones": "tarifas", "tipos_camion": "tarifas",
    "countries": "paises",
    "zones": "zonas",
    "carriers": "transportistas",
    "vehicles": "vehiculos", "vehicle_types": "vehiculos",
    "drivers": "conductores", "driver_licenses": "conductores",
    "driver_license_types": "licencias",
    "customers": "clientes", "final_customers": "clientes",
    "delivery_points": "puntos_entrega", "addresses": "puntos_entrega", "contacts": "puntos_entrega",
    "stores": "puntos_entrega",
    "contracts": "contratos", "contract_documents": "contratos",
    "organizations": "configuracion", "warehouses": "configuracion",
}


def module_for(table: str) -> str | None:
    return TABLE_MODULES.get(table)
