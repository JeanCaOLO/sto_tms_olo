# 2026-09-02 — Pedidos reales de EFLOW QA por viaje (HANDOFF task #4)

Rama: `jesus-planificacion`. Merge: `fbdda58` (merge no-ff de `c054b24`). Pusheado.

## Qué se hizo

Cerrada la última tarea del `HANDOFF-KIRO-2026-09-01.md` (#4): conectar líneas de
pedido reales de QA en `/planificacion` en vez del `MOCK_STOPS` sintético.

Delegado a un worktree Orca (`pedidos-reales-qa`) con `kiro-cli chat` + modelo
`claude-sonnet-5`, autónomo (`--trust-all-tools`). El agente hizo recon read-only
de la BD, documentó, cableó, verificó y commiteó en su rama. Revisado el diff aquí
(tests 60/60, tsc 0 errores en `planificacion`, build OK) y mergeado.

**Coste:** ~40 créditos Kiro / 15 min. Se decide **no seguir usando kiro-cli**
para esto — gasta demasiado del presupuesto mensual. Flujo a futuro: Claude
redacta el prompt, el humano lo pasa a otro agente/canal.

## Hallazgo de la recon (documentado en `docs/guides/eflow-qa-schema-planificacion.md` §8)

| Candidato | Resultado |
|---|---|
| `EFLOW_WMH.dbo.journey_orders` | `journey_id` liga a `VIAJE`, pero sin cliente/dirección/lat-lng/peso. No basta. |
| `VIEW_INS_OLO_PLANNING_AB`, `VIEW_OBT_DATOS_VIAJES_DET_AB` | Rotas en QA (referencian `EFLOW_OLO` offline). |
| `ext_tms_*_mt` (staging) | Las 13 tablas existen, **0 filas** en QA. |
| **`VIEW_DATOS_VIAJE_AUDITORIA_PED_AB` + `CLIENTES`** | **Única fuente usable.** viaje→pedido→factura→artículo→cliente. Resuelve en QA. |

**Cobertura parcial:** solo **27 de 959** viajes tienen líneas reales (481
pedidos/factura). Sin peso/volumen por línea (QA = 0, mismo gap que capacidad de
vehículos). Sin señal de entrega/devolución → **FR16 sigue mock-only**. Lat/lng
nulos en ~71% de clientes.

## Cambio de código

- `server/queries.mjs`: `listPedidosPorViaje` (SELECT-only, param `@viajeId`).
- `server/index.mjs`: `GET /api/viajes/:id/pedidos` (valida id entero).
- `eflow-api.ts`: `PedidoRow`, `mapPedido`, `fetchPedidosPorViaje`. `fetchViajes`
  enriquece cada viaje tras el `mapViaje` síncrono. Fallback independiente a
  `getFallbackPedidos` (mock) si 0 filas reales o `/api` caído — mismo patrón que
  `fetchRutas`/`fetchConductores`.
- `MOCK_STOPS` / `getFallbackPedidos` **intactos**, siguen siendo la fuente
  primaria para ~97% de los viajes QA y para el modo mock puro (sin `pnpm server`).

## Seguimientos (no bloquean)

1. `fetchViajes` hace N+1: 1 fetch de pedidos por viaje (hasta 100) al cargar la
   vista con el server QA arriba. Aceptable para prototipo dev-only; si molesta,
   pasar a fetch perezoso al abrir el viaje.
2. `mapPedido` pone `total_weight/volume: 0` en líneas reales → la `CapacityBar`
   de esos 27 viajes se ve vacía. Es gap de datos de QA, no bug. Documentado.
3. `PEDIDOS_ASIGNADOS_MOVIL_AB` (21.915 filas, nivel pedido sin artículo) quedó
   anotada como alternativa más liviana si algún día se necesita más cobertura.

## Limpieza

- Worktrees Orca `backend-eflow`, `db-recon-eflow`, `flota-mapa-estados`,
  `planif-devoluciones`, `pedidos-reales-qa`: **eliminados** (git + disco), ramas
  `JesusAraujoDEV/*` borradas. Todos estaban 100% mergeados en `jesus-planificacion`.
- `HANDOFF-KIRO-2026-09-01.md` / `HANDOFF-CLAUDE-2026-09-02.md` / `BRIEF.md`:
  scratch, eliminados — su contenido queda en este worklog.

## Anexo — prompt usado (para reutilizar con otro agente)

Ver `git show c054b24` para el diff completo. El brief que ejecutó el worktree:
recon read-only de las 3 fuentes candidatas → documentar en la guía §8 → si hay
fuente real, añadir endpoint read-only + fetcher con fallback al mock → verificar
`pnpm test` / `tsc` / `build` → commit en la rama del worktree. Reglas: no escribir
en la BD, credenciales solo en `.env.local`, enmascarar PII, no tocar `aidlc/`, no
borrar el mock.
