"""API y entrypoint del motor de reglas del OMS (esqueleto de 1a entrega).

Portado: módulo NUEVO (C2-RESUELTO: motor propio del OMS, no comparte con el TMS,
no porta el AST de src/lib/tarifas/). Sigue el patrón de los módulos del backend
(context/planning/eflow): handler = tms_handler(ROUTES), funciones de ruta
(event: dict) -> dict, SQL/lógica fuera del handler.

Rutas (esqueleto):
- GET  /api/v1/oms/health                              → estado + modo (mock/live).
- POST /api/v1/oms/corridas                            → barrido ADR-013: lee la
                                       cola, PRIORIZA todo (deja DISP), SINCRONIZA a
                                       eFlow el número de prioridad de los priorizados
                                       que cambió (pasada 1b, Cofersa) y LIBERA a eFlow
                                       solo los que cruzan la ventana
                                       (`dispatch_date − dias_prep_picking`).
- POST /api/v1/oms/viajes/{numero_viaje}/procesar      → acción manual "Procesar a
                                       Eflow" (gated por rol): libera los pedidos de
                                       un viaje IGNORANDO la ventana (adelanta la
                                       salida cuando picking/packing está ocioso).
- POST /api/v1/oms/pedidos/liberar                    → acción manual "Liberar pedido"
                                       (gated por rol): igual que la de viaje pero por
                                       `id_expediciones` (+ `motivo` opcional al log).

ADR-013 desacopla PRIORIZAR (no escribe 'GENE', no estampa oms_processed_at) de
LIBERAR (escribe 'GENE' por la costura + oms_processed_at = now()). La liberación
es POR VIAJE "gratis": `dispatch_date` es igual para todos los pedidos de un
`numero_viaje`, se lee SOLO orders.

El barrido también es invocable por EventBridge (schedule, v1 = 5×/día; hora de
corte / por compañía = futuro) reutilizando `correr()`; el handler HTTP es el
disparador manual. El schedule se cablea en infrastructure-design (DIFERIDA).
"""

from __future__ import annotations

import os
from dataclasses import asdict
from datetime import date, datetime, timezone

from tms_common import permissions
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param
from tms_common.handler import tms_handler
from tms_common.responses import json_response

import cola_candidatos
import handoff_pedidos
import motor_reglas
import oms_log
import reglas_config
from models import PedidoCandidato, RegistroPrioridad

# Permiso del módulo OMS para la acción manual "Procesar a Eflow". Usa el vocabulario
# de acciones del RBAC (permissions.ACTIONS); "edit" cubre la mutación de liberar.
# TODO(rol): confirmar el módulo/acción exactos cuando el RBAC del OMS esté definido.
PERMISO_PROCESAR = ("oms", "edit")


def _modo() -> str:
    return os.environ.get("OMS_SOURCE", "mock")


def _ok(body: object) -> dict:
    return json_response(200, {"data": body, "error": None})


def _corrida_id(hoy: date) -> str:
    return f"oms-{hoy.isoformat()}-{datetime.now(timezone.utc).strftime('%H%M%S')}"


# Prioridad de respaldo para una compañía 'no priorizar' cuyo pedido llega sin
# prioridad de origen (no debería pasar: EPA la trae). Número alto = baja urgencia,
# para no colarlo como urgente por error.
PRIORIDAD_PREEXISTENTE_DEFECTO = 99

# Prioridad que se estampa al LIBERAR en una compañía priorizada por el OMS (Cofersa):
# 0 = "ya se va" (DECIDED 0..n, aclaración 2026-11-04). Se escribe en orders.priority y
# se manda a eFlow; nunca aparece en la cola (la cola solo lista los NO liberados).
PRIORIDAD_LIBERADO = 0


def _registro_preexistente(pedido: PedidoCandidato) -> RegistroPrioridad:
    """Registro para una compañía que NO se prioriza (EPA): conserva la prioridad
    de origen (`orders.priority`) sin pasar por el motor. Se usa solo para la costura
    de liberación (escribir la PRIORIDAD a eFlow); el barrido no toca `orders.priority`."""
    prioridad = pedido.priority if pedido.priority is not None else PRIORIDAD_PREEXISTENTE_DEFECTO
    return RegistroPrioridad(pk=pedido.pk, prioridad=prioridad, score=0.0, cliente_retira=False)


def _resolver_registros(pedidos, resolver_config, hoy: date):
    """Resuelve (pedido, config, registro) por pedido. Las compañías con
    `priorizar=true` pasan por el motor; las de `priorizar=false` conservan su
    prioridad de origen (no se recalcula)."""
    resueltos = []
    for pedido in pedidos:
        config = resolver_config(pedido)
        if config.priorizar:
            registro = motor_reglas.priorizar_uno(pedido, config, hoy)
        else:
            registro = _registro_preexistente(pedido)
        resueltos.append((pedido, config, registro))
    return resueltos


def _liberar(trios) -> tuple[int, int, list]:
    """Pasada 2 (ADR-013): libera los trios (pedido, config, registro) dados a eFlow.

    La prioridad de LIBERACIÓN depende del scope: una compañía priorizada por el OMS
    (Cofersa) pasa a 0 al liberar ("ya se va"); una pass-through (EPA) conserva su
    prioridad de EFLOW (prioridad_liberacion=None → no se toca orders.priority).

    Devuelve (liberados, pendientes, detalle). 'liberado' = handoff completado;
    'pendiente' = escritura 1 ok pero la costura (escritura 2) falló (reconciliable).
    """
    liberados = pendientes = 0
    detalle = []
    for pedido, config, registro in trios:
        prioridad_liberacion = PRIORIDAD_LIBERADO if config.priorizar else None
        estado = handoff_pedidos.liberar_pedido(pedido, registro, prioridad_liberacion=prioridad_liberacion)
        if estado == handoff_pedidos.ESTADO_COMPLETADO:
            liberados += 1
        else:
            pendientes += 1
        prioridad_final = prioridad_liberacion if prioridad_liberacion is not None else registro.prioridad
        detalle.append({"pk": asdict(registro.pk), "prioridad": prioridad_final,
                        "cliente_retira": registro.cliente_retira, "estado_handoff": estado})
    return liberados, pendientes, detalle


def _sincronizar_prioridades(trios, corrida_id: str) -> int:
    """Pasada 1b (ADR-013, aclaración 2026-11-04): refleja en eFlow el número de
    prioridad de los pedidos priorizados-no-liberados cuya prioridad cambió (el llamador
    ya los filtró). Best-effort por pedido: si la costura de uno falla, lo registra y
    sigue; un barrido posterior reintenta cuando la prioridad vuelva a cambiar. Devuelve
    cuántos se sincronizaron."""
    sincronizados = 0
    for pedido, _config, registro in trios:
        try:
            handoff_pedidos.sincronizar_prioridad(pedido, registro)
            sincronizados += 1
        except Exception as exc:  # noqa: BLE001 — un sync fallido no aborta el barrido
            oms_log.registrar("sync_prioridad",
                              f"Sync de prioridad falló exp={pedido.id_expedicion}: {exc}",
                              level="warn", corrida_id=corrida_id,
                              detail={"pk": asdict(registro.pk), "error": str(exc)})
    return sincronizados


def correr(
    *,
    hoy: date | None = None,
    limite: int = 100,
    resolver_config=None,
) -> dict:
    """Barrido ADR-013 de punta a punta: lee la cola → PRIORIZA todo → LIBERA ventana.

    Entradas:
      - hoy: fecha de la corrida (default: hoy UTC). Inyectable para tests.
      - limite: tope de pedidos a leer de la cola.
      - resolver_config: cómo resolver la ConfiguracionReglas por scope.
    Salida: resumen dict (corrida, total, priorizados, liberados, pendientes,
      prioridades). Solo se liberan los pedidos cuyo `dispatch_date` cruza la ventana
      `now() >= dispatch_date − dias_prep_picking`; el resto queda priorizado-no-liberado
      (DISP) para que un barrido posterior lo libere cuando llegue su día.
    """
    hoy = hoy or datetime.now(timezone.utc).date()
    corrida_id = _corrida_id(hoy)
    resolver_config = resolver_config or reglas_config.cargar_resolver()

    try:
        pedidos: list[PedidoCandidato] = cola_candidatos.candidatos(limite=limite)
        resueltos = _resolver_registros(pedidos, resolver_config, hoy)

        # Pasada 1: priorizar SOLO las compañías con priorizar=true (deja DISP, sin
        # oms_processed_at). Las de priorizar=false (EPA) conservan su prioridad de
        # origen: el barrido NO toca orders.priority.
        for pedido, config, registro in resueltos:
            if config.priorizar:
                handoff_pedidos.priorizar_pedido(pedido, registro, corrida_id)

        # Pasada 2: liberar los que cruzan la ventana (apliquen o no priorización; por
        # viaje "gratis": mismo dispatch_date en un numero_viaje => cruzan juntos).
        en_ventana = [
            (pedido, config, registro)
            for pedido, config, registro in resueltos
            if handoff_pedidos.en_ventana_liberacion(
                pedido.dispatch_date, hoy, config.dias_prep_picking,
                cliente_retira=registro.cliente_retira,
                delivery_date=pedido.fecha_expedicion_planificada)
        ]
        liberados, pendientes, prioridades = _liberar(en_ventana)

        # Pasada 1b: sincronizar a eFlow el número de prioridad de los priorizados que
        # SIGUEN en cola (no se liberaron en esta corrida) y cuyo número CAMBIÓ respecto
        # al previo (orders.priority que trae el candidato; None = primera vez). Solo
        # priorizar=true (EPA conserva su prioridad de EFLOW, no se sincroniza). A los
        # que se liberan en esta misma corrida NO se les manda el número intermedio: la
        # liberación ya les escribe el 0.
        en_ventana_pks = {
            (p.id_almacen, p.id_compania, p.id_sucursal, p.id_expedicion)
            for p, _, _ in en_ventana
        }
        a_sincronizar = [
            (pedido, config, registro)
            for pedido, config, registro in resueltos
            if config.priorizar
            and (pedido.id_almacen, pedido.id_compania, pedido.id_sucursal,
                 pedido.id_expedicion) not in en_ventana_pks
            and registro.prioridad != pedido.priority
        ]
        sincronizados = _sincronizar_prioridades(a_sincronizar, corrida_id)

        # Pasada 3 (reconciliación): re-corre la costura de los 'disparo_pendiente'
        # que un barrido previo dejó a medias (escritura 1 ok, escritura 2 falló).
        reconciliados = handoff_pedidos.reconciliar_pendientes(limite=limite)
    except Exception as exc:  # noqa: BLE001 — registra el fallo y re-lanza
        # Best-effort: si la BD está caída, este log también falla (solo CloudWatch).
        oms_log.registrar("barrido", f"Barrido FALLÓ: {exc}", level="error",
                          corrida_id=corrida_id, detail={"error": str(exc)})
        raise

    priorizados = sum(1 for _, config, _ in resueltos if config.priorizar)
    resumen = {
        "total": len(pedidos),
        "priorizados": priorizados,
        "liberados": liberados,
        "pendientes": pendientes,
        "sincronizados": sincronizados,
        "reconciliados": reconciliados,
    }
    oms_log.registrar(
        "barrido",
        f"Barrido: {priorizados} priorizados, {liberados} liberados, "
        f"{sincronizados} sincronizados, {pendientes} pendientes, {reconciliados} reconciliados",
        level="warn" if pendientes else "info",
        corrida_id=corrida_id,
        detail=resumen,
    )

    return {
        "corrida": corrida_id,
        "modo": _modo(),
        **resumen,
        "prioridades": prioridades,
    }


def procesar_viaje(event: dict) -> dict:
    """Acción manual "Procesar a Eflow": libera los pedidos de un viaje (gated por rol).

    Reusa la pasada de liberación de ADR-013 filtrada por `numero_viaje`, IGNORANDO
    la ventana temporal (adelanta la salida cuando picking/packing está ocioso). Body
    opcional `{"id_expediciones": [...]}` restringe a un subconjunto de pedidos del
    viaje. Prioriza esos pedidos primero (por si aún no se priorizaron) y los libera.
    """
    permissions.for_event(event).require(*PERMISO_PROCESAR)
    numero_viaje = path_param(event, "numero_viaje")
    cuerpo = json_body(event) or {}
    subconjunto = cuerpo.get("id_expediciones")
    subconjunto = set(subconjunto) if subconjunto else None

    hoy = datetime.now(timezone.utc).date()
    corrida_id = _corrida_id(hoy)

    resolver_config = reglas_config.cargar_resolver()
    try:
        pedidos = [
            p for p in cola_candidatos.candidatos()
            if p.numero_viaje == numero_viaje
            and (subconjunto is None or p.id_expedicion in subconjunto)
        ]
        resueltos = _resolver_registros(pedidos, resolver_config, hoy)
        # Prioriza (si aplica) y libera; "Procesar a Eflow" ignora la ventana.
        for pedido, config, registro in resueltos:
            if config.priorizar:
                handoff_pedidos.priorizar_pedido(pedido, registro, corrida_id)
        liberados, pendientes, prioridades = _liberar(resueltos)
    except Exception as exc:  # noqa: BLE001 — registra el fallo y re-lanza
        oms_log.registrar("procesar_viaje", f"Procesar viaje {numero_viaje} FALLÓ: {exc}",
                          level="error", corrida_id=corrida_id, actor="manual",
                          detail={"numero_viaje": numero_viaje, "error": str(exc)})
        raise

    oms_log.registrar(
        "procesar_viaje",
        f'"Procesar a Eflow" viaje {numero_viaje}: {len(pedidos)} pedidos, {liberados} liberados, {pendientes} pendientes',
        level="warn" if pendientes else "info",
        corrida_id=corrida_id,
        actor="manual",
        detail={"numero_viaje": numero_viaje, "total": len(pedidos), "liberados": liberados,
                "pendientes": pendientes, "subconjunto": sorted(subconjunto) if subconjunto else None},
    )

    return _ok({
        "corrida": corrida_id,
        "modo": _modo(),
        "numero_viaje": numero_viaje,
        "total": len(pedidos),
        "priorizados": len(pedidos),
        "liberados": liberados,
        "pendientes": pendientes,
        "prioridades": prioridades,
    })


def liberar_pedidos(event: dict) -> dict:
    """Acción manual "Liberar pedido" (gated por rol): libera pedidos puntuales de la cola.

    Análogo por PEDIDO de `procesar_viaje` (DECIDED 2026-11-04: la única interacción
    manual del Responsable OMS es liberar). Body: `{"id_expediciones": [...], "motivo": "opcional"}`.
    Cofersa (priorizar=true): prioridad 0 + GENE + eFlow. EPA (pass-through): conserva su
    prioridad de origen. Ignora la ventana temporal. Reusa `_resolver_registros` y `_liberar`.
    """
    permissions.for_event(event).require(*PERMISO_PROCESAR)
    cuerpo = json_body(event) or {}
    ids = cuerpo.get("id_expediciones")
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) and i for i in ids):
        raise HttpError(400, "id_expediciones debe ser una lista no vacía de textos")
    motivo = (cuerpo.get("motivo") or "").strip() or None
    solicitados = set(ids)

    hoy = datetime.now(timezone.utc).date()
    corrida_id = _corrida_id(hoy)
    resolver_config = reglas_config.cargar_resolver()
    try:
        pedidos = [p for p in cola_candidatos.candidatos() if p.id_expedicion in solicitados]
        resueltos = _resolver_registros(pedidos, resolver_config, hoy)
        for pedido, config, registro in resueltos:
            if config.priorizar:
                handoff_pedidos.priorizar_pedido(pedido, registro, corrida_id)
        liberados, pendientes, prioridades = _liberar(resueltos)
    except Exception as exc:  # noqa: BLE001 — registra el fallo y re-lanza
        oms_log.registrar("liberar_pedido", f"Liberar pedidos FALLÓ: {exc}",
                          level="error", corrida_id=corrida_id, actor="manual",
                          detail={"id_expediciones": sorted(solicitados), "motivo": motivo,
                                  "error": str(exc)})
        raise

    encontrados = {p.id_expedicion for p in pedidos}
    no_encontrados = sorted(solicitados - encontrados)
    oms_log.registrar(
        "liberar_pedido",
        f'"Liberar pedido": {len(pedidos)} pedidos, {liberados} liberados, {pendientes} pendientes',
        level="warn" if pendientes else "info",
        corrida_id=corrida_id,
        actor="manual",
        detail={"id_expediciones": sorted(solicitados), "motivo": motivo, "total": len(pedidos),
                "liberados": liberados, "pendientes": pendientes, "no_encontrados": no_encontrados},
    )

    return _ok({
        "corrida": corrida_id,
        "modo": _modo(),
        "total": len(pedidos),
        "liberados": liberados,
        "pendientes": pendientes,
        "no_encontrados": no_encontrados,
        "prioridades": prioridades,
    })


def health(_event: dict) -> dict:
    return _ok({"ok": True, "modo": _modo(), "motor": "oms-reglas"})


def ejecutar_corrida(_event: dict) -> dict:
    return _ok(correr())


ROUTES = {
    "GET /api/v1/oms/health": health,
    "POST /api/v1/oms/corridas": ejecutar_corrida,
    "POST /api/v1/oms/viajes/{numero_viaje}/procesar": procesar_viaje,
    "POST /api/v1/oms/pedidos/liberar": liberar_pedidos,
}

_http_handler = tms_handler(ROUTES)


def _es_evento_programado(event: object) -> bool:
    """True si el evento viene de EventBridge Scheduler (W1), no de API Gateway."""
    return isinstance(event, dict) and (
        event.get("detail-type") == "Scheduled Event" or event.get("source") == "aws.events"
    )


def handler(event: dict, context: object) -> dict:
    """Entrypoint Lambda. Dos disparadores sobre la misma función:
    - EventBridge Scheduler (W1, 5×/día): corre el barrido ADR-013 (`correr()`).
    - API Gateway HTTP: despacha las rutas (health, corrida manual, procesar viaje).
    """
    if _es_evento_programado(event):
        return correr()
    return _http_handler(event, context)
