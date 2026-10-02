"""Dominio puro de autenticación: reglas de credenciales y sesión, sin I/O ni SQL.

Portado de `origin/main:backend/auth/src/app.py` separando la regla de negocio
(qué es una credencial válida, longitud mínima de contraseña) de la persistencia
(auth_credentials/app_users) y del transporte HTTP. Nada aquí importa pg, JWT ni
el evento de Lambda.
"""
