"""Adaptadores Aurora (PostgreSQL vía tms_common.pg) que implementan los ports.

Contra el modelo del contrato §1 (`route_plans`, `plan_trips`, `plan_stops`) y
las fuentes §0/§3 (`orders` + `order_items`, `vehicles`, `zones`). Donde el
schema aún no exista (lo entrega WT-1), el adaptador cae a un mock explícito
(`TABLA_FALTANTE`) en vez de romper: el brief permite mocks en los adaptadores.
"""
