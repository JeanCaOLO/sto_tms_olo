"""CatalogoReglas — resuelve la ConfiguracionReglas por scope desde la tabla
`oms_rule_configs` (sql/52). Reemplaza al stub `motor_reglas.config_por_defecto`.

Las reglas (su LÓGICA) viven en código (DECIDED: el Motor de Reglas NO es un
constructor dinámico); esta tabla solo aporta los PARÁMETROS editables por compañía:
qué reglas aplican, su peso, sus parámetros, y si la compañía se prioriza o no.

Forma de la columna `reglas` (jsonb), POR REGLA (no solo pesos):
    {
      "fecha_t1":       {"aplica": true, "peso": 1.0},
      "observaciones":  {"aplica": true, "peso": 1.0},
      "cliente_retira": {"aplica": true, "peso": 0.0, "prioridad": 1}
    }
Cada regla trae `aplica` (on/off), `peso` y los parámetros que necesite (p. ej.
`prioridad` de cliente-retira). `priorizar` y `dias_prep_picking` NO son reglas:
son comportamiento del barrido y van como columnas.

Precedencia de scope: CUSTOMER → WAREHOUSE → COUNTRY → GLOBAL. Se devuelve la
config de la fila más específica que matchee el pedido; si ninguna, cae al default
del esqueleto (`motor_reglas.config_por_defecto`).
"""

from __future__ import annotations

import json
import os

import motor_reglas
from models import ConfiguracionReglas, PedidoCandidato
from motor_reglas import ResolverConfig

SELECT_ACTIVAS = """
SELECT scope_type, customer_id, warehouse_id, country_id, priorizar, reglas, dias_prep_picking, escala_prioridad
FROM oms_rule_configs
WHERE activo = true
"""


def _modo_live() -> bool:
    return os.environ.get("OMS_SOURCE", "mock") == "live"


def config_desde_fila(fila: dict) -> ConfiguracionReglas:
    """Construye la ConfiguracionReglas a partir de una fila de oms_rule_configs.

    PURA (sin DB): el `reglas` jsonb puede llegar como dict (pg8000) o como str.
    Solo entran al score las reglas con `aplica=true`; una regla sin `peso` pesa 0.
    """
    reglas = fila.get("reglas") or {}
    if isinstance(reglas, str):
        reglas = json.loads(reglas)
    pesos = {
        nombre: float(cfg.get("peso", 0.0))
        for nombre, cfg in reglas.items()
        if isinstance(cfg, dict) and cfg.get("aplica", True)
    }
    cliente_retira = reglas.get("cliente_retira") or {}
    return ConfiguracionReglas(
        pesos=pesos,
        prioridad_cliente_retira=int(cliente_retira.get("prioridad", 1)),
        dias_prep_picking=int(fila.get("dias_prep_picking", 1)),
        priorizar=bool(fila.get("priorizar", True)),
        escala_prioridad=int(fila.get("escala_prioridad", 100)),
    )


def cargar_resolver() -> ResolverConfig:
    """Carga las configs activas UNA vez y devuelve un resolver puro (sin más I/O).

    En mock (sin DB) devuelve el stub `config_por_defecto`. En live indexa las filas
    por scope y resuelve por precedencia CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL.
    """
    if not _modo_live():
        return motor_reglas.config_por_defecto

    from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests

    por_customer: dict[str, dict] = {}
    por_warehouse: dict[str, dict] = {}
    por_country: dict[str, dict] = {}
    global_fila: dict | None = None
    for fila in pg.query(SELECT_ACTIVAS):
        scope = fila["scope_type"]
        if scope == "customer" and fila["customer_id"] is not None:
            por_customer[str(fila["customer_id"])] = fila
        elif scope == "warehouse" and fila["warehouse_id"] is not None:
            por_warehouse[str(fila["warehouse_id"])] = fila
        elif scope == "country" and fila["country_id"] is not None:
            por_country[str(fila["country_id"])] = fila
        elif scope == "global":
            global_fila = fila

    def resolver(pedido: PedidoCandidato) -> ConfiguracionReglas:
        for clave, tabla in (
            (pedido.customer_id, por_customer),
            (pedido.warehouse_id, por_warehouse),
            (pedido.country_id, por_country),
        ):
            if clave is not None and str(clave) in tabla:
                return config_desde_fila(tabla[str(clave)])
        if global_fila is not None:
            return config_desde_fila(global_fila)
        return motor_reglas.config_por_defecto(pedido)

    return resolver
