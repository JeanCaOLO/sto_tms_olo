"""Dominio puro del contexto operativo: validación de puntos de entrega.

La jerarquía país→almacén→cliente→cliente final→punto de entrega y su
autorización por scope viven en `lib/tms_common/scopes.py` (infra compartida,
reusada tal cual). Aquí solo quedan las reglas de negocio puras del alta/edición
de un punto de entrega (coordenadas válidas, campos obligatorios, estado de
geocodificación), separadas del SQL (adaptador) y del transporte (inbound).
"""
