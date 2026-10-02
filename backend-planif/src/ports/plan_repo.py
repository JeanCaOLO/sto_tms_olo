"""Port: persistencia de planes (route_plans + plan_trips + plan_stops)."""

from __future__ import annotations

from typing import Protocol

from domain.models import Plan


class PlanRepo(Protocol):
    """Escribe y lee planes completos (cabecera + viajes + paradas) de forma
    atómica. El adaptador Aurora usa una transacción por operación de escritura.
    """

    def guardar(self, plan: Plan) -> Plan:
        """Inserta un plan nuevo con sus viajes y paradas. Devuelve el plan con
        su `id` asignado."""
        ...

    def obtener(self, plan_id: str) -> Plan | None:
        """Un plan con sus trips+stops, o None si no existe."""
        ...

    def listar(
        self,
        organization_id: str,
        warehouse_id: str | None,
        status: str | None = None,
        plan_date: str | None = None,
        customer_id: str | None = None,
    ) -> list[Plan]:
        """Cabeceras de planes del contexto, filtrables por estado, fecha y compañía."""
        ...

    def reemplazar_viajes(self, plan_id: str, plan: Plan) -> Plan:
        """Sustituye trips+stops de un plan (edición del draft). Devuelve el
        plan actualizado. El caso de uso ya validó que está en `draft`."""
        ...

    def actualizar_estado(self, plan_id: str, status: str) -> Plan:
        """Persiste una transición de estado ya validada por el dominio."""
        ...

    def actualizar_estado_viaje(self, trip_id: str, status: str) -> Plan | None:
        """Transiciona un viaje (plan_trip) y devuelve el plan que lo contiene,
        o None si el viaje no existe o no estaba en un estado transicionable."""
        ...
