# Revisión: liberación manual de pedidos OMS

Veredicto: APPROVED. No hay bloqueantes.

## Evidencia
- Backend `app.py`: `liberar_pedidos` está registrada en `ROUTES` como `POST /api/v1/oms/pedidos/liberar`.
  - Exige `PERMISO_PROCESAR` (`oms`, `edit`).
  - Valida el body: una lista no vacía de strings en `id_expediciones` y un `motivo` opcional. Una lista inválida devuelve 400.
  - Reutiliza `cola_candidatos.candidatos()`, `_resolver_registros`, `priorizar_pedido` y `_liberar`, igual que `procesar_viaje`. No duplica lógica.
  - `_liberar` ignora la ventana. Según el registro del coder y el comentario existente de `_liberar`, Cofersa usa `prioridad_liberacion=0` y EPA usa `None`, así que conserva su prioridad. No volví a leer `_liberar` en este paso.
  - Escribe `oms_log.registrar("liberar_pedido", ..., actor="manual", detail={..., "motivo"})`, también en la rama de error.
  - No toca `barrido` ni `procesar_viaje`.
  - Solo usa la costura `EscritorSituacion`, es decir, la tabla propia y el espejo `sim_expedicionescabecera`. No escribe en EFLOW real.
- `template.yaml`: agrega `OmsLiberarPedidosRoute`, necesaria porque API Gateway lista las rutas por separado. Es coherente con la ruta de viaje.
- Tests (4 nuevos, 69 verdes según el coder; no los volví a correr):
  - Cofersa: 0 y auditoría `manual` con motivo.
  - EPA: conserva la prioridad de origen.
  - Ids no encontrados y 400 por body inválido.
  - 403 sin permiso.
- Frontend:
  - `OverrideModal.tsx` es ahora el modal "Liberar pedido — {pedido}". No tiene input numérico, el motivo es opcional y el texto explica GENE, Cofersa 0 y EPA conservando su prioridad. Muestra el error y el estado "ocupado".
  - `useColaController` cambia `applyOverride` por `liberarPedido(motivo)`. Llama a `omsApi.liberarPedidos` (método nuevo), no recalcula nada localmente y recarga la cola con `reloadKey`. El pedido liberado sale porque `released` lo excluye del filtro.
  - "Alterar prioridad" y override pasan a "Liberar pedido" en `OrderDetailModal`, `page.tsx` y Auditoría (`logLabels`, `BUSINESS_ACTIONS`, `HISTORIAL_ACTIONS`).
  - No encontré referencias huérfanas a `applyOverride`, `currentPriority` ni `onOverride`.
- AI-DLC:
  - `requirements.md`: FR4.5 actualizado y FR4.6 nuevo.
  - `stories.md`: US14 actualizada con endpoint y UX. US15 y US15b ya estaban alineadas con el DECIDED del 2026-11-04.
  - `traceability.json`: `v4_3_note` actualizado y JSON válido. No hay duplicados.
- `project.md` no fue modificado, y el DECIDED ya existía.
- `docs/work/2026-11/2026-11-09-liberar-pedido-manual-oms.md` existe y no tiene timestamps inventados. El archivo del 11-04 recibió una nota de actualización.
- `CANAL.md`: mensaje Kiro→Claude añadido. No hay fila "En curso" pendiente.
- No hay commit nuevo (HEAD = `913ce3b`) y solo existe el worktree principal.

## Observaciones menores (no bloqueantes)
- El archivo conserva el nombre `OverrideModal.tsx`, aunque el componente exportado se llama `LiberarPedidoModal`. Está documentado en el código.
- La historia UX pide foco atrapado y cierre con Esc. El modal no lo implementa, igual que el modal anterior.
- `page.tsx` y `useColaController.ts` perdieron el BOM inicial. Es un cambio cosmético.
