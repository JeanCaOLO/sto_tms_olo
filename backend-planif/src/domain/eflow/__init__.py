"""Dominio EFLOW: builders de SELECT puros (sin I/O) contra el SQL Server on-prem.

Portado de `origin/main:backend/eflow/src/eflow_queries.py`. Los inputs de
usuario van SIEMPRE como parámetros bound (%(nombre)s); solo los nombres de BD
(wmh, sap), que salen de la config del país, se interpolan en el texto.
"""
