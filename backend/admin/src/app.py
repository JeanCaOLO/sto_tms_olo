"""Administración de usuarios y roles: /api/v1/admin/* (JWT + rol administrador).

Reemplaza las escrituras directas a app_users/roles/user_scopes que hacía
Configuración por la API genérica: aquí la creación es atómica (credencial +
usuario + alcances) y solo la puede hacer un administrador.
"""

from tms_common.handler import tms_handler

import admin_roles as roles
import admin_users as users

ROUTES = {
    "GET /api/v1/admin/users": users.list_users,
    "POST /api/v1/admin/users": users.create_user,
    "PATCH /api/v1/admin/users/{id}": users.update_user,
    "DELETE /api/v1/admin/users/{id}": users.delete_user,
    "POST /api/v1/admin/users/{id}/password": users.reset_password,
    "GET /api/v1/admin/roles": roles.list_roles,
    "POST /api/v1/admin/roles": roles.create_role,
    "PATCH /api/v1/admin/roles/{id}": roles.update_role,
    "DELETE /api/v1/admin/roles/{id}": roles.delete_role,
}

handler = tms_handler(ROUTES)
