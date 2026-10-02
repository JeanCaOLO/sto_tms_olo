"""API y entrypoint del motor de reglas del OMS (esqueleto de 1a entrega).

Portado: módulo NUEVO (C2-RESUELTO: motor propio del OMS, no comparte con el TMS,
no porta el AST de src/lib/tarifas/). Sigue el patrón de los módulos del backend
(context/planning/eflow): handler = tms_handler(ROUTES), funciones de ruta
(event: dict) -> dict, SQL/lógica fuera del handler.

Rutas (esqueleto):
- GET  /api/v1/oms/health           → estado + modo (mock/live).
- POST /api/v1/oms/corridas         → ejecuta una corrida de priorización: lee la
                                       cola, prioriza, hace el handoff. Devuelve el
                                       resumen (cuántos priorizados, pendientes).

La corrida también es invocable por EventBridge (schedule, NFR1) reutilizando
`correr()`; el handler HTTP es el disparador manual. El schedule se cablea en
infrastructure-design (DIFERIDA, gate de reactivación).
"""

from __future__ import annotations

import os
from dataclasses import asdict
from datetime import date, datetime, timezone

from tms_common.handler import tms_handler
from tms_common.responses import json_response

import cola_candidatos
import handoff_pedidos
import motor_reglas
from models import ConfiguracionReglas, PedidoCandidato


def _modo() -> str:
    return os.environ.get("OMS_SOURCE", "mock")


def _ok(body: object) -> dict:
    return json_response(200, {"data": body, "error": None})


def correr(
    *,
    hoy: date | None = None,
    limite: int = 100,
    resolver_config=motor_reglas.config_por_defecto,
) -> dict:
    """Ejecuta una corrida de priorización de punta a punta (lectura → reglas → handoff).

    Entradas:
      - hoy: fecha de la corrida (default: hoy UTC). Inyectable para tests.
      - limite: tope de pedidos a leer de la cola.
      - resolver_config: cómo resolver la ConfiguracionReglas por scope.
    Salida: resumen dict (corrida, total, completados, pendientes, prioridades).
    """
    hoy = hoy or datetime.now(timezone.utc).date()
    corrida_id = f"oms-{hoy.isoformat()}-{datetime.now(timezone.utc).strftime('%H%M%S')}"

    pedidos: list[PedidoCandidato] = cola_candidatos.candidatos(limite=limite)
    registros = motor_reglas.priorizar(pedidos, resolver_config, hoy=hoy)

    completados = pendientes = 0
    prioridades = []
    for pedido, registro in zip(pedidos, registros):
        config = resolver_config(pedido)
        estado = handoff_pedidos.ejecutar(pedido, registro, config, corrida_id)
        if estado == handoff_pedidos.ESTADO_COMPLETADO:
            completados += 1
        else:
            pendientes += 1
        prioridades.append({"pk": asdict(registro.pk), "prioridad": registro.prioridad,
                            "cliente_retira": registro.cliente_retira, "estado_handoff": estado})

    return {
        "corrida": corrida_id,
        "modo": _modo(),
        "total": len(pedidos),
        "completados": completados,
        "pendientes": pendientes,
        "prioridades": prioridades,
    }


def health(_event: dict) -> dict:
    return _ok({"ok": True, "modo": _modo(), "motor": "oms-reglas"})


def ejecutar_corrida(_event: dict) -> dict:
    return _ok(correr())


ROUTES = {
    "GET /api/v1/oms/health": health,
    "POST /api/v1/oms/corridas": ejecutar_corrida,
}

handler = tms_handler(ROUTES)
