"""Casos de uso de administración: usuarios, roles, matriz de permisos y bitácora.

Orquesta el dominio (validación de payloads) con el port de persistencia y la
infra de permisos/passwords/audit (`lib/tms_common`). No conoce HTTP ni SQL:
recibe el `event` solo donde la auditoría/permisos lo exigen y datos ya
parseados, y devuelve resultados que el adaptador inbound mapea a la respuesta.

Reemplaza las escrituras directas a app_users/roles/user_scopes de la API
genérica: aquí la creación es atómica y solo la puede hacer un administrador.
"""

from __future__ import annotations

from domain.admin import auditoria, permisos
from domain.admin.payload import ScopeInput
from domain.admin import payload
from ports.admin_repo import Admin, AdminRepo, NewUser
from lib.tms_common import audit
from lib.tms_common import permissions as perms
from lib.tms_common.errors import HttpError
from lib.tms_common.event import auth_user
from lib.tms_common.passwords import hash_password


class AdminService:
    def __init__(self, repo: AdminRepo) -> None:
        self._repo = repo

    # --- Acceso de administrador --------------------------------------------
    def require_admin(self, event: dict) -> Admin:
        auth_user_id = auth_user(event)["id"]
        admin = self._repo.caller_admin(auth_user_id)
        if admin is not None:
            return admin
        exists, _is_admin = self._repo.caller_is_admin(auth_user_id)
        if not exists:
            raise HttpError(401, "No existe app_user para este usuario autenticado.")
        raise HttpError(403, "Solo un administrador puede gestionar usuarios y roles.")

    def _owned_user(self, admin: Admin, user_id: str) -> dict:
        user = self._repo.owned_user(user_id, admin.organization_id)
        if user is None:
            raise HttpError(404, "Usuario no encontrado")
        return user

    def _role_id(self, body: dict) -> str:
        role_id = payload.required_text(body, "role_id", "El rol")
        if not self._repo.role_exists(role_id):
            raise HttpError(400, "El rol no existe")
        return role_id

    # --- Usuarios ------------------------------------------------------------
    def list_users(self, event: dict) -> list[dict]:
        admin = self.require_admin(event)
        return self._repo.list_users(admin.organization_id)

    def create_user(self, event: dict, body: dict) -> dict:
        admin = self.require_admin(event)
        user = NewUser(
            full_name=payload.required_text(body, "full_name", "El nombre"),
            email=payload.email(body),
            password_hash=hash_password(payload.password(body)),
            role_id=self._role_id(body),
            is_active=payload.status(body) == "active",
            scopes=payload.scopes(body),
        )
        user_id = self._repo.create_user(admin.organization_id, user)
        return self._repo.list_users(admin.organization_id, user_id)[0]

    def update_user(self, event: dict, user_id_raw: str, body: dict) -> dict:
        admin = self.require_admin(event)
        user_id = str(self._owned_user(admin, user_id_raw)["id"])
        if user_id == admin.app_user_id and body.get("status") == "inactive":
            raise HttpError(400, "No puedes desactivar tu propio usuario.")
        fields, role_id = self._update_fields(body)
        scopes: list[ScopeInput] | None = None
        role_for_scopes = role_id
        if "scopes" in body:
            current_role = role_id or self._repo.list_users(admin.organization_id, user_id)[0]["role_id"]
            role_for_scopes = str(current_role)
            scopes = payload.scopes(body)
        self._repo.update_user(user_id, fields, role_for_scopes, scopes)
        return self._repo.list_users(admin.organization_id, user_id)[0]

    def _update_fields(self, body: dict) -> tuple[dict, str | None]:
        fields: dict[str, object] = {}
        if "full_name" in body:
            fields["full_name"] = payload.required_text(body, "full_name", "El nombre")
        if "status" in body:
            fields["is_active"] = payload.status(body) == "active"
        role_id: str | None = None
        if "role_id" in body:
            role_id = self._role_id(body)
            fields["role_id"] = role_id
        return fields, role_id

    def reset_password(self, event: dict, user_id_raw: str, body: dict) -> dict:
        admin = self.require_admin(event)
        user = self._owned_user(admin, user_id_raw)
        self._repo.reset_password(user["auth_user_id"], hash_password(payload.password(body)))
        return {"id": str(user["id"])}

    def delete_user(self, event: dict, user_id_raw: str) -> dict:
        admin = self.require_admin(event)
        user = self._owned_user(admin, user_id_raw)
        if str(user["id"]) == admin.app_user_id:
            raise HttpError(400, "No puedes eliminar tu propio usuario.")
        self._repo.delete_user(str(user["id"]), user["auth_user_id"])
        return {"id": str(user["id"])}

    # --- Roles ---------------------------------------------------------------
    def list_roles(self, event: dict) -> list[dict]:
        self.require_admin(event)
        return self._repo.list_roles()

    def _role_fields(self, body: dict, role_id: str = "") -> tuple[str, str]:
        name = payload.required_text(body, "name", "El nombre del rol")
        if self._repo.role_name_taken(name, role_id):
            raise HttpError(409, f'Ya existe un rol llamado "{name}".')
        return name, str(body.get("description") or "").strip()

    def create_role(self, event: dict, body: dict) -> dict:
        self.require_admin(event)
        name, description = self._role_fields(body)
        return self._repo.create_role(name, description)

    def update_role(self, event: dict, role_id: str, body: dict) -> dict:
        self.require_admin(event)
        name, description = self._role_fields(body, role_id)
        role = self._repo.update_role(role_id, name, description)
        if role is None:
            raise HttpError(404, "Rol no encontrado")
        return role

    def delete_role(self, event: dict, role_id: str) -> dict:
        self.require_admin(event)
        if self._repo.role_in_use(role_id):
            raise HttpError(409, "El rol está asignado a usuarios; reasígnalos antes de eliminarlo.")
        if not self._repo.delete_role(role_id):
            raise HttpError(404, "Rol no encontrado")
        return {"id": role_id}

    # --- Matriz de permisos --------------------------------------------------
    def _existing_role(self, role_id: str) -> dict:
        role = self._repo.role(role_id)
        if role is None:
            raise HttpError(404, "Rol no encontrado")
        return role

    def _matrix(self, role_id: str) -> dict:
        role = self._existing_role(role_id)
        modules = {key: [a for a in perms.ACTIONS if a in actions]
                   for key, actions in self._repo.role_modules(role_id).items()}
        countries = [] if role["all_countries"] else self._repo.role_country_ids(role_id)
        return {"modules": modules, "all_countries": bool(role["all_countries"]),
                "country_ids": countries, "is_admin": role["name"] in perms.ADMIN_ROLES}

    def catalog(self, event: dict) -> dict:
        self.require_admin(event)
        return {"modules": self._repo.module_catalog(), "actions": list(perms.ACTIONS)}

    def get_role_permissions(self, event: dict, role_id: str) -> dict:
        self.require_admin(event)
        return self._matrix(role_id)

    def put_role_permissions(self, event: dict, role_id: str, body: dict) -> dict:
        self.require_admin(event)
        if self._existing_role(role_id)["name"] in perms.ADMIN_ROLES:
            raise HttpError(409, "Un rol administrador tiene todos los permisos; no se edita su matriz.")
        pairs = permisos.valid_modules(body.get("modules", {}), self._repo.known_module_keys())
        all_countries, country_ids = permisos.requested_countries(body)
        if not all_countries:
            found = self._repo.existing_country_ids(country_ids)
            missing = [i for i in country_ids if i not in found]
            if missing:
                raise HttpError(400, f"País desconocido: {missing[0]}")
        self._repo.put_role_permissions(role_id, pairs, all_countries, country_ids)
        return self._matrix(role_id)

    def my_permissions(self, event: dict) -> dict:
        return perms.for_event(event).to_json()

    # --- Bitácora ------------------------------------------------------------
    def list_events(self, event: dict, params: dict) -> tuple[list[dict], object]:
        perms.for_event(event).require(auditoria.MODULE, "view")
        where, args = auditoria.build_where(params)
        limit = auditoria.limit(params)
        rows = self._repo.list_events(where, args, limit + 1)
        page = rows[:limit]
        next_cursor = page[-1]["id"] if len(rows) > limit else None
        return page, next_cursor

    def get_event(self, event: dict, event_id_raw: str) -> dict:
        perms.for_event(event).require(auditoria.MODULE, "view")
        row = self._repo.event(int(event_id_raw)) if event_id_raw.isdigit() else None
        if row is None:
            raise HttpError(404, "Evento no encontrado")
        return row

    def record_client_event(self, event: dict, body: dict) -> dict:
        action = auditoria.valid_client_action(body.get("action"))
        module_key = body.get("module_key")
        if not module_key or not self._repo.module_exists(module_key):
            raise HttpError(400, f'Módulo desconocido: "{module_key}"')
        auditoria.valid_metadata(body.get("metadata"))
        audit.record(event, action, module_key=module_key, metadata=body.get("metadata"))
        return {"recorded": True}
