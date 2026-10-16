# Plan y estimación — Módulo Planificación (marco AIDLC)

> Actualizado 2026-10-07. Enmarca el desarrollo del módulo en las fases AIDLC
> (Ideation → Inception → Construction → Operation) reusando los artefactos
> existentes (`docs/stories/planificacion/`, `docs/requirements/planificacion/`,
> HANDOFF §8). **No** es una corrida de la metodología; es la estimación.

**Supuesto clave:** el núcleo del módulo **ya está construido** (stories 001–006 y
requirements 001–003 = *Delivered*: motor zona→capacidad→secuencia, snapshot,
contexto operativo, generar/editar/confirmar/estado por viaje, backend hexagonal
con login real). Esta estimación cubre **lo que falta para producción en AWS**, no
un desarrollo desde cero.

## 1. Estado por fase AIDLC

| Fase AIDLC | Estado | Nota |
|---|---|---|
| Ideation | ✅ Hecho | intent `260825-route-planning-reqs` |
| Inception (requirements/stories/domain) | 🟡 Casi | faltan afinar los *Draft*: story 007, req 004–005 |
| Construction | 🟡 En curso | núcleo entregado; 5 Bolts pendientes (abajo) |
| Operation (AWS) | 🔴 Pendiente | hoy corre local; falta despliegue productivo real |

**Qué falta de Inception, en simple:** cerrar los 3 borradores antes de
programarlos — la **regla del piso 80%**, cómo se comporta la **alerta de pedidos
nuevos ya en AWS**, y el caso de **un pedido en varias guías** (split por línea).

## 2. Construcción pendiente — Bolts

Un *Bolt* = pasada completa diseño + código + tests que termina en algo que corre.

| Bolt | Trabajo | Base ya hecha | Esfuerzo (dev-días) | Dependencia externa |
|---|---|---|---|---|
| **B1** Piso 80% capacidad (req 004) | restricción mínima de ocupación + config por compañía | motor FFD existe | **2–3** | — |
| **B2** WebSocket real alerta (req 005) | API Gateway WS + conexión autenticada + swap del hook | prototipo local hecho (`ws-local.mjs`) | **4–6** | creds/infra AWS |
| **B4** Split por línea / varias guías (story 007) | `plan_stops` por línea + motor + UI | plan por pedido | **5–8** | definición EPA |
| **B5** Estatus entrega/recepción del viaje | cierre del ciclo, liga a liquidación | estado por viaje existe | **5–7** | definición **IPRAC** |
| **B6** Capacidad real de flota | cargar catálogo real, quitar sintético | catálogo sintético activo | **2–3** | datos de Ricardo (20–30 veh.) |

**Subtotal construcción: ~18–27 dev-días.**

> **Geocodificación de clientes VE (req 006) — FUERA de nuestro alcance.** Lo
> ejecuta **Jean** (coordenadas de clientes en Venezuela). Para desarrollo no es
> esfuerzo, es **dependencia externa**: la ruta de VE no se dibuja completa hasta
> que Jean entregue esas coordenadas, pero no programamos nosotros el pipeline.

## 3. Operation (AWS) — salida a producción

Repuntar frontend al API desplegado y quitar el `server/` Node · pipeline
auto-deploy (creds AWS) · provisioning QA/PROD · observabilidad + smoke
`/api/ping` · **réplica de `EFLOW_OLO` (CR)** para datos reales.

**~5–8 dev-días** + **bloqueante externo**: la réplica EFLOW la crea Alfredo (sin
ella, solo mock / transaccional directo).

## 4. Total

| Concepto | dev-días |
|---|---|
| Construcción (B1, B2, B4–B6) | 18–27 |
| Operation / AWS | 5–8 |
| QA + integración + buffer (~15–20%) | 4–7 |
| **Total** | **~27–42 dev-días** |

**Calendario:** 1 dev ≈ **6–8 semanas** · 2 devs en paralelo ≈ **3–4 semanas**
(B5 y Operation paralelizan bien; B2 y Operation comparten el trabajo de infra AWS).

## 5. Lo que mueve la estimación (riesgos / dependencias)

1. **Coordenadas VE** (externo, **Jean**): sin ellas la ruta de Venezuela no se
   dibuja completa. No es nuestro esfuerzo, pero sí bloquea la demo VE.
2. **Réplica EFLOW** (externo, Alfredo): sin ella no hay datos reales → el resto se
   valida contra mock.
3. **IPRAC** (B5): el alcance de recepción/liquidación no está cerrado.
4. **Datos de capacidad de flota** (B6): los dimensiona el negocio, no desarrollo.

> Rangos calibrados a la velocidad actual del equipo; las dependencias externas
> (no el código) son el principal driver de la cola alta.
