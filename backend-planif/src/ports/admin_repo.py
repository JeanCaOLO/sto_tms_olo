"""Ports de administración (Aurora): usuarios, roles, matriz de permisos y bitácora.

Las escrituras de usuario y de la matriz de permisos son atómicas (varias
tablas), por eso viven detrás de un método por operación. La autorización de
administrador y la validación de payload las aplica el caso de uso ANTES de
llamar al repo. Portado de las queries de `origin/main:backend/admin`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from domain.admin.payload import ScopeInput


@dataclass(frozen=True)
class Admin:
    """Administrador que llama (resuelto por el repo a partir del token)."""

    app_user_id: str
    organization_id: str


@dataclass(frozen=True)
class NewUser:
    full_name: str
    email: str
    password_hash: str
    role_id: str
    is_active: bool
    scopes: list[ScopeInput]


class AdminRepo(Protocol):
    # --- Acceso de administrador --------------------------------------------
    def caller_admin(self, auth_user_id: str) -> Admin | None:
        """Admin activo dueño del token, o None si no existe / no es admin activo.

        Devuelve None cuando no hay app_user; el caso de uso decide 401 vs 403.
        """
        ...

    def caller_is_admin(self, auth_user_id: str) -> tuple[bool, bool]:
        """(existe_app_user, es_admin_activo) — para distinguir 401 de 403."""
        ...

    # --- Usuarios ------------------------------------------------------------
    def list_users(self, organization_id: str, user_id: str | None = None) -> list[dict]:
        ...

    def owned_user(self, user_id: str, organization_id: str) -> dict | None:
        """Fila {id, auth_user_id} si el usuario pertenece a la organización."""
        ...

    def role_exists(self, role_id: str) -> bool:
        ...

    def create_user(self, organization_id: str, user: NewUser) -> str:
        """Crea credencial + app_user + scopes en una transacción. Devuelve el id.
        Lanza HttpError(409) si el correo ya existe."""
        ...

    def update_user(self, user_id: str, fields: dict, role_id_for_scopes: str | None,
                    scopes: list[ScopeInput] | None) -> None:
        """Actualiza campos del app_user y, si vienen, sincroniza scopes (atómico)."""
        ...

    def reset_password(self, auth_user_id: str, password_hash: str) -> None:
        ...

    def delete_user(self, user_id: str, auth_user_id: str) -> None:
        """Borra scopes + app_user + credencial (atómico)."""
        ...

    # --- Roles ---------------------------------------------------------------
    def list_roles(self) -> list[dict]:
        ...

    def role_name_taken(self, name: str, exclude_role_id: str) -> bool:
        ...

    def create_role(self, name: str, description: str) -> dict:
        ...

    def update_role(self, role_id: str, name: str, description: str) -> dict | None:
        ...

    def role_in_use(self, role_id: str) -> bool:
        ...

    def delete_role(self, role_id: str) -> bool:
        """True si borró; False si no existía."""
        ...

    # --- Matriz de permisos --------------------------------------------------
    def role(self, role_id: str) -> dict | None:
        """{id, name, all_countries} o None."""
        ...

    def module_catalog(self) -> list[dict]:
        """Módulos con {key, group, path} para el catálogo del frontend."""
        ...

    def known_module_keys(self) -> set[str]:
        ...

    def role_modules(self, role_id: str) -> dict[str, frozenset[str]]:
        """Acciones concedidas por módulo al rol (matriz efectiva)."""
        ...

    def role_country_ids(self, role_id: str) -> list[str]:
        ...

    def existing_country_ids(self, ids: list[str]) -> set[str]:
        ...

    def put_role_permissions(self, role_id: str, pairs: list[tuple[str, str]],
                             all_countries: bool, country_ids: list[str]) -> None:
        """Reemplaza permisos y países del rol en una transacción."""
        ...

    # --- Bitácora ------------------------------------------------------------
    def list_events(self, where: str, args: list, limit: int) -> list[dict]:
        ...

    def event(self, event_id: int) -> dict | None:
        ...

    def module_exists(self, module_key: str) -> bool:
        ...
