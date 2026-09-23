# 2026-09-23 — Planificación: reestructura a flujo automático

## What changed

El módulo `src/pages/planificacion/` pasó de un flujo **manual multi-pestaña** (elegir viaje → asignar transportista/conductor/vehículo → marcar pedidos → optimizar → generar, más pestañas de Reparto de Flota y Matriz de Rutas) a un **flujo automático de una sola pantalla**:

1. Carga los pedidos con **fecha de entrega = mañana** (los que el OMS deja alistados en la base intermedia).
2. Al pulsar "Planificar entregas": agrupa por destino (`delivery_zone`) → reparte cada destino entre la flota por capacidad (peso/volumen, flota propia primero) → ordena las paradas de cada vehículo → propone los viajes.
3. El planificador solo revisa/confirma; no arma viajes a mano.

Archivos nuevos:
- `plan-automatico.ts` (+`.test.ts`) — orquestador puro; encadena `fleet-split` + `capacity-fit` + `optimize-stops`. 6 casos de prueba.
- `use-plan-automatico.ts` — hook de estado (pedidos de mañana + correr plan).
- `fleet-slots.ts` — arma la flota disponible (vehículo + conductor).
- `plan-pedidos-api.ts` — fuente de datos con fallback mock (endpoint real pendiente de backend).
- `components/PlanAutomatico.tsx`, `components/ViajePropuestoCard.tsx` — UI del flujo.
- `page.tsx` reescrito (de ~240 líneas a ~46).

Cambio de modelo:
- `Pedido` ahora tiene `delivery_date` (fecha de entrega comprometida) — `types.ts`. Propagado en todos los constructores de Pedido del front (`fallback-pedidos.ts`, `eflow-mappers.ts`, `pedidos-alistados-api.ts`, `live-devolucion.ts` antes de borrarse, `fallback-viajes.ts`).

Borrado (flujo manual muerto): ~24 componentes (`NuevaRutaTab`, `FlotaSplitTab`, `FlotaSlotPicker`, `MatrizRutasTab`, `RutasGeneradas`, `PedidosRuta`, `RutaEnConstruccion`, etc.) y ~13 hooks/apis (`use-pedidos-ruta`, `use-generar-ruta`, `use-flota-split`, `use-generar-flota`, `use-rutas-generadas`, `use-viajes`, `viajes-api`, `fallback-viajes`, `generar-ruta-api`, `generar-ruta-mock`, `pedidos-api`, `viaje-trigger`, `live-devolucion`, `route-status` + sus tests).

Reutilizado tal cual (con sus tests): `capacity-fit.ts`, `fleet-split.ts`, `optimize-stops.ts`, `distance-matrix.ts`, `route-geometry.ts`, `osrm-config.ts`, `time-windows.ts`, `use-catalogos.ts`, `catalogos-api.ts`, `eflow-api.ts`.

## Why

Pedido del negocio (2026-09-23): Planificación solo debe trabajar los pedidos con entrega del día siguiente y armar los viajes/rutas automáticamente según destino + capacidad de vehículo. La mayoría de las pestañas del flujo manual dejaron de tener sentido bajo ese modelo. Coincide con la regla ya documentada (Andrey 2026-09-22, ver el ex-`viaje-trigger.ts`): planificar es un motor, no una pantalla de armado manual.

## Reparto de trabajo (Kiro/Claude)

Kiro = frontend. El backend (endpoint de pedidos de mañana desde la base intermedia del OMS, y la columna de fecha de entrega en `orders`) quedó pedido a Claude en `.agents/CANAL.md`. El front avanza con datos mock (`fallback-pedidos.ts::getFallbackPedidosParaPlanificar`) hasta que el endpoint exista; al conectarlo solo cambia la fuente en `plan-pedidos-api.ts`.

## Promoted knowledge

- Contrato del endpoint pendiente y decisiones de reparto Kiro/Claude: `.agents/CANAL.md`.
- El agrupamiento v1 es por `delivery_zone` (campo que ya trae el pedido). Clustering geográfico por coordenadas queda como mejora futura.

## Follow-ups

- [ ] Backend (Claude): endpoint `GET /api/v1/planificacion/pedidos?fecha_entrega=` + columna de fecha de entrega en `orders` / base intermedia del OMS.
- [ ] Confirmar de dónde sale el **peso/volumen por pedido** real (hoy `pedidos-alistados-api.ts` lo deja en 0) — es lo que permite asignar el vehículo por capacidad con precisión.
- [ ] Persistir/confirmar los viajes propuestos (hoy son solo propuesta en pantalla; falta el "confirmar" que los guarda).
- [x] Limpieza `route-systems/` + `data:build` + `public/data/route-systems/`: **hecha** (baja completa coordinada Kiro/Claude, ver `.agents/CANAL.md`). Front borrado por Kiro; script/package.json/gitignore por Claude.
- [ ] `pedidos-alistados-api.ts` (puente OMS) se conservó pero no está cableado al flujo nuevo; decidir si reemplaza al endpoint mock.

## Actualización (2026-09-23, misma jornada) — sin capacidad + endpoint real

Tras coordinar con Claude (`.agents/CANAL.md`) y un nuevo pedido del negocio:

- **Capacidad desactivada tras flag** `USAR_CAPACIDAD = false` (`plan-automatico.ts`). Motivo: los pedidos reales del OMS no traen peso/volumen (llegan `null`, `capacity_known=false`). Con el flag apagado, el motor agrupa por `delivery_zone` y asigna **un vehículo por destino** (flota propia primero), sin bin-packing. Poner el flag en `true` reactiva el reparto por capacidad (`repartirEntreFlota`) sin tocar UI ni hook — conservado para cuando EFLOW traiga los datos de línea.
- `ViajePropuestoCard` ya no muestra barras de peso/volumen; muestra el nº de paradas. `pesoTotal`/`volumenTotal` pasaron a `number | null` (null = desconocido, no 0).
- **Endpoint real conectado**: `plan-pedidos-api.ts` usa `apiFetch('/v1/planificacion/pedidos?fecha_entrega=...')` (endpoint de Claude, lee `wms_expediciones` en Aurora), toma `body.data`, normaliza `delivery_date` con `.slice(0,10)`, y cae al mock si no hay datos.
- Tests de `plan-automatico` reescritos para el flag apagado (9 casos). 69 tests del módulo verdes; 0 errores de type-check en planificación.

Follow-up nuevo: los scripts `scripts/generar-viajes-automatico.mjs` / `preview-viaje-trigger.mjs` (backend, Claude) importaban el borrado `viaje-trigger.ts`; se les pasó por el canal la firma de `planificarDia` como reemplazo. Nota: el flujo nuevo ya no tiene `motivoDisparo` (urgencia/umbral) que sí tenía `viaje-trigger`.
