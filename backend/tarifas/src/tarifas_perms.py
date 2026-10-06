"""Permisos del que llama, con caché corta por contenedor (solo para el tarifador).

`permissions.for_event` cuesta 3-4 queries y cada request HTTP la pagaba: calcular un viaje son ~20
requests. Acá se guarda el resultado `TMS_PERMS_TTL_SECONDS` segundos (0 = apagado, que es el valor por
defecto en código y en los tests; el template del tarifador lo enciende). Un cambio de rol o de permisos
llega como mucho en ese tiempo. Solo se guardan resultados exitosos: un 401/403 se reevalúa siempre.
La capa común `tms_common` no se toca: los demás módulos siguen consultando en cada request.
"""

import os
import time

from tms_common import permissions
from tms_common.event import auth_user

MAX_ENTRIES = 500  # un contenedor largo no acumula usuarios sin límite
_cache: dict[str, tuple[float, permissions.Permissions]] = {}


def ttl_seconds() -> float:
    try:
        return float(os.environ.get("TMS_PERMS_TTL_SECONDS", "0"))
    except ValueError:
        return 0.0


def clear_cache() -> None:
    _cache.clear()


def for_event(event: dict) -> permissions.Permissions:
    ttl = ttl_seconds()
    if ttl <= 0:
        return permissions.for_event(event)
    user_id = auth_user(event)["id"]
    now = time.monotonic()
    hit = _cache.get(user_id)
    if hit and now - hit[0] < ttl:
        return hit[1]
    perms = permissions.for_event(event)
    if len(_cache) >= MAX_ENTRIES:
        _cache.clear()
    _cache[user_id] = (now, perms)
    return perms
