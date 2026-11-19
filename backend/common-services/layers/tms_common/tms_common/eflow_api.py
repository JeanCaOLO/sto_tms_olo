"""Cliente del API REST de eFlow WMS (ePRAC) — ambiente QA.

Contrato: `docuemntacion_api_eflow/ePRAC - 158- OLO -API proyecto TMS-OMS.pdf` (v1.0.0).
Autenticación JWT Bearer (6 días); 1 lectura (ObtenerExpediciones, paginada) y 4 escrituras
por lote (GenerarAcciones, CambiarPrioridadExpedicion, AsignarNumeroViajeWMH,
AsignarNumeroBajada; máx. 100 por petición, aislamiento por expediente).

FLAG: `EFLOW_API_MODE`
  - `mock` (default): NO se llama al API. El sistema se comporta como antes (lectura de la
    cola vía SQL de EFLOW si hay credenciales, escritura simulada en sim_expedicionescabecera).
  - `qa`: lectura y escrituras van al API de QA (EFLOW_QA_HOST / _USER / _PASSWORD).
  `EFLOW_API_WRITE=off` deja el modo `qa` en SOLO LECTURA: las escrituras se registran en el
  log y no se envían (útil para mirar datos sin tocar eFlow).

Solo stdlib (urllib): corre igual en el Layer de Lambda y en el servidor local.
"""

import base64
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date

log = logging.getLogger(__name__)

TIMEOUT_S = 25
LOTE_MAX = 100          # tope por petición en los POST (LIMITE_LOTE_EXCEDIDO)
PAGINA_MAX = 500        # PageSize máximo de ObtenerExpediciones
MARGEN_TOKEN_S = 120    # se renueva el token un poco antes de que venza

_lock = threading.Lock()
_token: dict = {"valor": None, "vence": 0.0}


class EflowApiError(Exception):
    """Fallo del API (red, HTTP no-200 o credenciales). `status` = HTTP si lo hubo."""

    def __init__(self, mensaje: str, status: int | None = None, errores: list | None = None):
        super().__init__(mensaje)
        self.status = status
        self.errores = errores or []


# --- Flag ---------------------------------------------------------------------

def modo() -> str:
    """`qa` si EFLOW_API_MODE=qa; cualquier otro valor (o ausente) = `mock`."""
    return "qa" if os.environ.get("EFLOW_API_MODE", "mock").strip().lower() == "qa" else "mock"


def activo() -> bool:
    return modo() == "qa"


def escritura_habilitada() -> bool:
    return os.environ.get("EFLOW_API_WRITE", "on").strip().lower() not in ("off", "0", "false", "no")


def _config() -> tuple[str, str, str]:
    base = (os.environ.get("EFLOW_QA_HOST") or "").strip().rstrip("/")
    user, password = os.environ.get("EFLOW_QA_USER"), os.environ.get("EFLOW_QA_PASSWORD")
    if not (base and user and password):
        raise EflowApiError("Faltan EFLOW_QA_HOST / EFLOW_QA_USER / EFLOW_QA_PASSWORD para el API de eFlow QA")
    return base, user, password


# --- HTTP ---------------------------------------------------------------------

def _http(metodo: str, url: str, cuerpo: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    headers = {"Accept": "application/json"}
    data = None
    if cuerpo is not None:
        data = json.dumps(cuerpo).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as err:  # 4xx/5xx traen cuerpo ApiResponse útil
        status, raw = err.code, err.read()
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise EflowApiError(f"No se pudo conectar con el API de eFlow ({url}): {err}") from err
    try:
        return status, json.loads(raw.decode("utf-8")) if raw else {}
    except ValueError:
        return status, {"message": raw.decode("utf-8", "replace")[:300]}


def _vencimiento(jwt: str) -> float:
    """exp del JWT (sin verificar firma); si no se puede leer, 1 hora."""
    try:
        payload = jwt.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return float(json.loads(base64.urlsafe_b64decode(payload))["exp"])
    except Exception:  # noqa: BLE001 — token opaco: renovar pronto
        return time.time() + 3600


def _login() -> str:
    base, user, password = _config()
    status, body = _http("POST", f"{base}/Autenticacion", {"Username": user, "Password": password})
    token = (body.get("data") or {}).get("token") if isinstance(body, dict) else None
    if status != 200 or not token:
        msg = ((body.get("result") or {}).get("message")) or body.get("message") or "sin detalle"
        raise EflowApiError(f"Autenticación en eFlow falló (HTTP {status}): {msg}", status)
    _token.update(valor=token, vence=_vencimiento(token))
    return token


def _bearer(forzar: bool = False) -> str:
    with _lock:
        if forzar or not _token["valor"] or time.time() >= _token["vence"] - MARGEN_TOKEN_S:
            return _login()
        return _token["valor"]


def _autenticado(metodo: str, ruta: str, cuerpo: dict | None = None, query: dict | None = None) -> tuple[int, dict]:
    base, _, _ = _config()
    url = f"{base}{ruta}" + (f"?{urllib.parse.urlencode(query)}" if query else "")
    status, body = _http(metodo, url, cuerpo, _bearer())
    if status == 401:  # token vencido/revocado: una renovación y un reintento
        status, body = _http(metodo, url, cuerpo, _bearer(forzar=True))
    return status, body


def reiniciar_token() -> None:
    """Olvida el token cacheado (tests / cambio de credenciales)."""
    with _lock:
        _token.update(valor=None, vence=0.0)


# --- Diagnóstico --------------------------------------------------------------

def test_conexion() -> dict:
    """GET /api/TestConexion (público). Devuelve `data` ({conectado, version, baseDatos, servidor})."""
    base, _, _ = _config()
    status, body = _http("GET", f"{base}/TestConexion")
    if status != 200 or not body.get("success"):
        raise EflowApiError(f"TestConexion falló (HTTP {status}): {body.get('message')}", status, body.get("errors"))
    return body.get("data") or {}


# --- Lectura ------------------------------------------------------------------

def obtener_expediciones(fecha_inicio: date, fecha_final: date, estado: str = "DISP",
                         situacion: str = "DISP", pagina_tam: int = PAGINA_MAX, limite: int | None = None) -> list[dict]:
    """Todas las expediciones del rango/estado/situación (recorre las páginas). `limite` corta antes."""
    items: list[dict] = []
    pagina = 1
    while True:
        status, body = _autenticado("GET", "/Expediciones/ObtenerExpediciones", query={
            "FechaInicio": fecha_inicio.isoformat(), "FechaFinal": fecha_final.isoformat(),
            "Estado": estado, "Situacion": situacion, "PageNumber": pagina, "PageSize": min(pagina_tam, PAGINA_MAX)})
        if status != 200 or not body.get("success"):
            raise EflowApiError(f"ObtenerExpediciones falló (HTTP {status}): {body.get('message')}", status, body.get("errors"))
        data = body.get("data") or {}
        items.extend(data.get("items") or [])
        if (limite and len(items) >= limite) or pagina >= int(data.get("totalPages") or 0):
            return items[:limite] if limite else items
        pagina += 1


# --- Escrituras por lote ------------------------------------------------------

@dataclass
class ResultadoLote:
    ok: list[dict] = field(default_factory=list)          # data.resultados
    errores: list[dict] = field(default_factory=list)     # errors[] (por expediente)
    no_procesadas: list[dict] = field(default_factory=list)

    @property
    def exito(self) -> bool:
        return bool(self.ok) and not self.errores and not self.no_procesadas

    def error_de(self, id_expedicion: str) -> dict | None:
        return next((e for e in self.errores if str(e.get("idExpedicion")) == str(id_expedicion)), None)


def _llave(e: dict) -> dict:
    return {"idAlmacen": e["idAlmacen"], "idCompania": e["idCompania"],
            "idSucursal": e["idSucursal"], "idExpedicion": e["idExpedicion"]}


def _post_lote(ruta: str, expediciones: list[dict], campo: str | None = None) -> ResultadoLote:
    """POST por lotes de LOTE_MAX. HTTP 400/401/403/5xx → EflowApiError; 200 con success=false
    devuelve los fallos por expediente en `errores` (el llamador decide)."""
    if not escritura_habilitada():
        log.warning("EFLOW_API_WRITE=off: no se envía %s (%d expediciones)", ruta, len(expediciones))
        return ResultadoLote()
    total = ResultadoLote()
    vistos: set[tuple] = set()
    unicas = []
    for e in expediciones:  # el API rechaza todo el lote si hay llaves repetidas
        k = tuple(e[c] for c in ("idAlmacen", "idCompania", "idSucursal", "idExpedicion"))
        if k not in vistos:
            vistos.add(k)
            unicas.append(e)
    for i in range(0, len(unicas), LOTE_MAX):
        lote = unicas[i:i + LOTE_MAX]
        status, body = _autenticado("POST", ruta, {"expediciones": [
            {**_llave(e), **({campo: e[campo]} if campo else {})} for e in lote]})
        data = body.get("data") or {}
        if status != 200:
            raise EflowApiError(f"{ruta} falló (HTTP {status}): {body.get('message')}", status, body.get("errors"))
        total.ok.extend(data.get("resultados") or [])
        total.errores.extend(body.get("errors") or [])
        total.no_procesadas.extend(data.get("noProcesadas") or [])
    return total


def generar_acciones(expediciones: list[dict]) -> ResultadoLote:
    """Genera las acciones de preparación y pasa la situación a SOAC (devuelve idActividad)."""
    return _post_lote("/Expediciones/GenerarAcciones", expediciones)


def cambiar_prioridad(expediciones: list[dict]) -> ResultadoLote:
    """Cada elemento lleva `prioridad` (int)."""
    return _post_lote("/Expediciones/CambiarPrioridadExpedicion", expediciones, "prioridad")


def asignar_viaje(expediciones: list[dict]) -> ResultadoLote:
    """Cada elemento lleva `numeroViajeWmh` (int64)."""
    return _post_lote("/Expediciones/AsignarNumeroViajeWMH", expediciones, "numeroViajeWmh")


def asignar_bajada(expediciones: list[dict]) -> ResultadoLote:
    """Cada elemento lleva `bajada` (int)."""
    return _post_lote("/Expediciones/AsignarNumeroBajada", expediciones, "bajada")


def exigir_exito(resultado: ResultadoLote, etiqueta: str) -> ResultadoLote:
    """Convierte fallos por expediente en excepción (para costuras de una sola expedición)."""
    if resultado.errores or resultado.no_procesadas:
        detalle = "; ".join(f'{e.get("code")}: {e.get("message")}' for e in resultado.errores) or "no procesada"
        raise EflowApiError(f"{etiqueta}: {detalle}", errores=resultado.errores)
    return resultado
