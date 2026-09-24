"""Módulos de la matriz de permisos (sql/15) para cada tabla de la API genérica.

Escribir: crear/editar/borrar exige esa acción en el módulo DUEÑO de la tabla.
Leer: exige `view` en alguno de los módulos cuyas pantallas leen la tabla
(READ_MODULES, sacado del uso real en src/pages/**; si no figura, el dueño).
Una tabla sin módulo solo la usa un administrador (fail-closed).
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


OMS_MODULES = ("oms.panel", "oms.cola", "oms.reglas", "oms.simulador", "oms.rutas", "oms.auditoria")

# Catálogos de referencia: los lee cualquier usuario (igual se filtran por sus países).
SHARED_READ = frozenset({"countries", "zones"})

# Quien no tenga `view` en estos módulos solo lee su propia fila de app_users (la usa el login).
APP_USERS_READERS = ("conductores", "transportistas", "paises", "configuracion")

READ_MODULES: dict[str, tuple[str, ...]] = {
    "customers": ("clientes", "puntos_entrega"),
    "carriers": ("conductores", "tarifas", "transportistas", "vehiculos"),
    "drivers": ("conductores", "tarifas", "transportistas"),
    "driver_license_types": ("conductores", "licencias"),
    "vehicles": ("tarifas", "transportistas", "vehiculos"),
    "dispatch_guides": ("dashboard", "guias", "tarifas", "tracking"),
    "orders": ("dashboard", "devoluciones", "guias", "pedidos", "reportes"),
    "returns": ("dashboard", "devoluciones", "tarifas", "reportes"),
    "routes": ("dashboard", "guias", "tarifas", "reportes", "tracking"),
    "stores": ("tarifas", "paises", "puntos_entrega"),
    "wms_expediciones": (*OMS_MODULES, "planificacion"),
}


def read_modules(table: str) -> tuple[str, ...]:
    owner = module_for(table)
    return READ_MODULES.get(table) or ((owner,) if owner else ())

