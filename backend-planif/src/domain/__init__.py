"""Dominio puro de Planificación 2: reglas de negocio sin I/O ni SQL.

Contiene el motor de planificación (agrupar por zona + capacidad + 2-opt) y la
máquina de estados de un `route_plan`. Nada de este paquete importa adaptadores,
psycopg ni el evento de Lambda: recibe dataclasses y devuelve dataclasses.
"""
