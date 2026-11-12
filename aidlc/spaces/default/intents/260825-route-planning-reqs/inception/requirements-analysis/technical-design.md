# Diseño Técnico — Módulo de Planificación de Rutas

## Stack

**Frontend / prototipo:** React 19 + TypeScript + Vite 7 + Tailwind CSS 3 + Supabase (Postgres/Auth/RLS) + OSRM auto-hospedado + Leaflet/OSM.

**Backend real (producción, estándar Intelix):** el planificador que corre contra datos reales vive en `backend/planning/` (Python + AWS Lambda/SAM), lee pedidos de **Aurora PostgreSQL** (`orders`, ingestados desde el WMS/eFlow) y persiste el plan en `route_plans`→`plan_trips`→`plan_stops`, estampando el pedido para el OMS (ver "Handoff a OMS"). El camino Supabase descrito abajo es del prototipo React; la lógica de negocio vigente (tope 16, dispatch_date, handoff, limpieza) está en ese backend. El algoritmo (FFD + nearest-neighbor) es el mismo en ambos.

## Arquitectura en Capas

```
┌────────────────────────────────────────────────────────────────┐
│  PRESENTACIÓN — 21 componentes React + Leaflet maps            │
│  PlanificacionTabs → NuevaRuta / FlotaSplit / RutasGeneradas   │
├────────────────────────────────────────────────────────────────┤
│  ESTADO — 8 custom hooks (≤80 líneas c/u)                      │
│  Coordinan UI ↔ algoritmos, manejan loading/error              │
├────────────────────────────────────────────────────────────────┤
│  ALGORITMOS — funciones puras, sin React                       │
│  capacity-fit │ optimize-stops │ fleet-split                   │
│  distance-matrix │ route-geometry                              │
├────────────────────────────────────────────────────────────────┤
│  ACCESO A DATOS — *-api.ts (Supabase queries + fallbacks)      │
├────────────────────────────────────────────────────────────────┤
│  MOCK LAYER — activación condicional por env/datos vacíos      │
│  mock-auth │ mock-store (localStorage) │ fallback-*.ts         │
├────────────────────────────────────────────────────────────────┤
│  INFRA EXTERNA — Supabase │ OSRM (Dokploy) │ OSM tiles        │
└────────────────────────────────────────────────────────────────┘
```

## Decisiones Clave

| Decisión | Qué | Por qué |
|----------|-----|---------|
| Viaje como agrupador | Los pedidos llegan pre-agrupados del WMS Iflow; el TMS NO reasigna ruta↔pedido | Decisión de negocio (Jean Carlo). El TMS solo optimiza secuencia dentro de cada grupo. |
| Matriz OSRM N×N | Una sola llamada HTTP a `/table/v1/driving` precalcula todas las distancias | Evita N² llamadas individuales. Timeout 5s + fallback haversine×1.35. |
| Bin-packing greedy (FFD) | First-Fit-Decreasing sobre peso+volumen con márgenes 85%/95% **y tope de 16 pedidos/viaje** | Legislación CR (peso) + best practices (volumen) + tope operativo (reunión 2026-10-13 Ana/Eduardo: ~16 pedidos y ~80% capacidad → nuevo viaje). Greedy suficiente a esta escala. |
| Nearest-neighbor TSP | O(n²) sobre la matriz precalculada | Suficiente para escala actual. Techo: ~25% más largo que óptimo. Upgrade path → VRPTW. |
| Fleet-split largest-first | Llena vehículos de mayor a menor capacidad, reutiliza bin-packing por slot | Simplificación deliberada; no optimiza asignación global entre vehículos. |
| Graceful degradation | Cada integración externa tiene fallback automático sin intervención del usuario | OSRM→haversine, Supabase 0 filas→mock sintéticos, geometría→línea recta. |
| OSRM auto-hospedado | Dominio propio (`osrm.jesusaraujo.lat`) en Dokploy | Demo público tiene rate-limits; independencia operativa. |
| Algoritmos propios | No se usa librería VRP externa | Control total para debugging en contexto logístico real. |

## Flujo de Datos — Nueva Ruta

```
Viaje (WMS) ──► pedidos-api ──► Supabase/fallback
                                      │
                    ┌─────────────────┘
                    ▼
         [capacity-fit] ── bin-packing 2D (peso≤85%, vol≤95%)
                    │
                    ▼
         [distance-matrix] ──HTTP──► OSRM /table (o haversine)
                    │
                    ▼
         [optimize-stops] ── nearest-neighbor sobre matriz N×N
                    │
                    ▼
         [route-geometry] ──HTTP──► OSRM /route (o línea recta)
                    │
                    ▼
         Mapa Leaflet + persistencia (Supabase o localStorage mock)
```

## Flujo de Datos — Reparto de Flota

```
Viaje + N slots configurados
         │
         ▼
  [fleet-split] ── ordena vehículos por capacidad desc
         │            └── por cada vehículo: [capacity-fit]
         ▼
  N grupos de pedidos ── cada uno dentro de capacidad
         │
         ▼
  [use-generar-flota] ── genera N rutas en batch
```

## Handoff a OMS, fechas de despacho y re-planificación (backend real)

Al persistir un plan, el planificador de backend estampa cada pedido que quedó en él
(tabla `orders` de Aurora) con las columnas que el OMS consume — es la superficie de
comunicación entre Planificación y OMS, un contrato de columnas, no acoplamiento de código:

```
Planificación ESCRIBE en orders:   numero_viaje, lead_time_days, dispatch_date,
                                    planning_run_id, delivery_zone
OMS ESCRIBE (Planificación NO toca): priority, oms_score, wms_status/situation,
                                    oms_processed_at, prioritization_run_id
Cola del OMS:                       planning_run_id IS NOT NULL AND oms_processed_at IS NULL
```

- `dispatch_date = delivery_date − lead_time_days` (misma para todo el viaje, en SQL con
  `make_interval`; NULL si no hay lead). Es el insumo de la regla T-1 del OMS, no una fecha
  de alisto que Planificación fije.
- `lead_time_days = 1 + floor(km_max / 70)` por haversine de la parada más lejana al
  depósito CR (9.9281, −84.0907).
- `planning_run_id`: uuid por corrida (cliente-día), cambia en cada re-planificación.
- **Re-planificación**: los pedidos que se caen del plan del día quedan con
  `planning_run_id`/`numero_viaje`/`dispatch_date` en NULL, para que la cola del OMS los
  excluya sola; los que siguen se re-estampan.
- `numero_viaje` también se escribe de vuelta al WMS/eFlow de forma **simulada** (tabla
  espejo en Aurora); el eFlow real es de solo lectura.

Fuente: `backend/planning/src/plan_builder.py`; contrato en `sql/37`+`sql/42` (TMS-Frontend)
y `sql/008`+`sql/009` (planificador hexagonal de TMS-Backend).

## Entidades del Dominio

```
Viaje (1) ──────► (N) Pedido
                        │   └── handoff al OMS: numero_viaje, lead_time_days,
                        │       dispatch_date, planning_run_id, delivery_zone
                        ▼
              Ruta Generada (1) ──► (N) Parada (secuencia)
                   │
                   ├── Vehículo (capacity_weight, capacity_volume)
                   ├── Conductor
                   └── Transportista
```

## Componentes Principales (resumen)

| Capa | Cantidad | Ejemplos |
|------|----------|----------|
| Componentes UI | 20 activos | `NuevaRutaTab`, `FlotaSplitTab`, `RutaMapaPreview`, `CapacityBar` |
| Hooks de estado | 6 | `usePedidosRuta`, `useFlotaSplit`, `useCatalogos`, `useViajes` |
| Hooks de acción | 2 | `useGenerarRuta`, `useGenerarFlota` |
| Algoritmos puros | 5 | `capacity-fit`, `optimize-stops`, `fleet-split`, `distance-matrix`, `route-geometry` |
| APIs/repositorio | 5 | `catalogos-api`, `pedidos-api`, `viajes-api`, `generar-ruta-api`, `generar-ruta-mock` |

## Escala Operativa

- 12–36 rutas/día; **tope de 16 pedidos por viaje** (reunión 2026-10-13), antes se suponía ≤50
- Cobertura activa: GAM Costa Rica (almacenes Cliro)
- Pendiente: Venezuela (San Diego/Micheleana) — requiere despliegue OSRM regional

## Prototipo No Integrado

`src/lib/routePlanning/` contiene un motor standalone con ventanas horarias (8am–7pm) y Google Maps como fuente de distancias. No está conectado a la UI activa. Su fusión es backlog ítems #2 y #5.

## Restricciones y Límites Técnicos

- Archivos: componentes ≤150 líneas, hooks ≤80, páginas ≤200 (enforced por hooks automáticos)
- UI 100% en español; variables de dominio en camelCase español
- Modo mock se desactiva solo cuando hay datos reales (conditional activation, no feature flag manual)
- Sin tests unitarios formales aún (solo self-checks assert-based en el prototipo)
