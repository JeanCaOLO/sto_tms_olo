# 2026-11-09 — Liberación manual por pedido del OMS ("Liberar pedido")

Implementa el pendiente de `2026-11-04-sync-prioridad-eflow-y-liberacion-manual.md`
(DECIDED 2026-11-04: la única interacción manual del Responsable OMS es LIBERAR el pedido,
ya no alterar una prioridad arbitraria). Rama `oms`, sin commit (lo hace el usuario).

## Qué se hizo

**Backend** (`backend/oms/src/app.py`, `backend/tests/test_oms.py`)
- Ruta nueva `POST /api/v1/oms/pedidos/liberar` → `app.liberar_pedidos`, gated `("oms","edit")`.
  Body `{"id_expediciones": [...], "motivo": "opcional"}` (uno o varios; lista vacía o
  inválida → 400).
- Análogo por pedido de `procesar_viaje`: filtra `cola_candidatos.candidatos()` por
  `id_expedicion`, reusa `_resolver_registros`, `priorizar_pedido` y `_liberar`
  (→ `handoff_pedidos.liberar_pedido`). Sin duplicar lógica; ignora la ventana temporal.
- Cofersa (`priorizar=true`): prioridad 0 + `GENE` + costura. EPA (pass-through): conserva
  la prioridad de origen. Escribe solo a la tabla propia y al espejo
  `sim_expedicionescabecera`; nunca al EFLOW real.
- Auditoría: `oms_log.registrar("liberar_pedido", ..., actor="manual", detail={..., "motivo": ...})`.
  La respuesta incluye `no_encontrados` (ids que ya no están en la cola).
- No se tocó el barrido automático ni la liberación por viaje.
- Tests nuevos (4): Cofersa 0+GENE+auditoría manual con motivo, EPA conserva prioridad,
  no encontrados + validación 400, 403 sin permiso.

**Frontend** (`src/pages/oms/`)
- `cola/OverrideModal.tsx` → modal "Liberar pedido — {pedido}" (sin input numérico, motivo
  opcional, botón "Liberar pedido"; el componente exportado es `LiberarPedidoModal`, el
  archivo conserva el nombre por historial de git).
- `cola/useColaController.ts`: `applyOverride(priority, reason)` → `liberarPedido(motivo)`;
  llama `omsApi.liberarPedidos`, sin recálculo local de score/orden; recarga la cola.
- `api/omsApi.ts`: método `liberarPedidos`; `override_manual` → `liberar_pedido` en el
  historial. `auditoria/logLabels.ts` y `auditoria/page.tsx` renombrados igual.
- `cola/OrderDetailModal.tsx` y `cola/page.tsx`: "Alterar prioridad" → "Liberar pedido".

**AI-DLC** (`aidlc/spaces/default/intents/260826-modulo-oms/inception/`): FR4 (estado, FR4.5,
FR4.6 nuevo), US14 y `traceability.json` (`v4_3_note`) sincronizados con lo implementado.

## Verificación
Ver reporte final del cambio (pytest `backend/tests/test_oms.py`, tsc, eslint, vitest OMS).

## Pendientes
- Deploy por Intelix para que la ruta exista en el sandbox.
- Learning: el DECIDED 2026-11-04 ya está en `project.md` (learned 2026-11-04); no se duplica.
- No existe `INDICE-PROGRESO.md` en el repo: no se registró avance de tarea ni estimación.
