"""Dominio de administración: reglas puras de validación de payloads.

Portado de la parte NO-SQL de `origin/main:backend/admin` (admin_payload.py):
validación de usuario (nombre, correo, contraseña, estado) y de alcances
(scopes). Sin I/O ni SQL; las excepciones las traduce el adaptador inbound a
HttpError.
"""
