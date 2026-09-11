# Architecture — Módulo de Planificación de Rutas

## Patrón Arquitectónico

**SPA (Single Page Application)** con arquitectura en capas dentro del módulo. El módulo vive como una página dentro de una aplicación React más amplia (TMS), montada en la ruta `/planificacion`.

## Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRESENTACIÓN                                  │
│  React Components (18) — Tailwind CSS — Leaflet Maps                │
│  PlanificacionTabs → NuevaRutaTab / FlotaSplitTab / RutasGeneradas  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ props + callbacks
┌────────────────────────────────▼────────────────────────────────────┐
│                     ESTADO / ORQUESTACIÓN                            │
│  Custom Hooks (8): use-pedidos-ruta, use-flota-split,               │
│  use-generar-ruta, use-catalogos, use-viajes, etc.                  │
│  Máximo 80 líneas por hook — coordinan estado y delegan a capas     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ llamadas a funciones puras
┌────────────────────────────────▼────────────────────────────────────┐
│                        ALGORITMOS                                    │
│  Funciones puras sin dependencia de React:                          │
│  capacity-fit.ts │ optimize-stops.ts │ fleet-split.ts               │
│  distance-matrix.ts │ route-geometry.ts                             │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ fetch / query
┌────────────────────────────────▼────────────────────────────────────┐
│                    ACCESO A DATOS (Repository)                       │
│  catalogos-api.ts │ pedidos-api.ts │ viajes-api.ts                  │
│  generar-ruta-api.ts │ generar-ruta-mock.ts                         │
│  Patrón: fetchXxx → Supabase query → fallback si 0 filas           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                      MOCK LAYER                                      │
│  mock-auth.ts (sesión falsa, bypass RLS)                            │
│  mock-store.ts (CRUD localStorage con prefijo sto_mock_)            │
│  fallback-pedidos.ts / fallback-rutas.ts / fallback-viajes.ts       │
│  Activación: VITE_MOCK_AUTH=true → MOCK_AUTH_ENABLED                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    INFRAESTRUCTURA EXTERNA                            │
│  Supabase (Postgres + Auth + RLS) │ OSRM (Docker, auto-hospedado)  │
│  Leaflet + OpenStreetMap tiles    │ localStorage (modo mock)        │
└─────────────────────────────────────────────────────────────────────┘
```

## Flujo de Datos — Nueva Ruta

```
Usuario selecciona viaje
       │
       ▼
[use-viajes] ──fetch──► [viajes-api] ──► Supabase / fallback-viajes
       │
       ▼
[use-pedidos-ruta] ──fetch──► [pedidos-api] ──► Supabase / fallback-pedidos
       │
       │ usuario incluye/excluye pedidos, ancla prioritarios
       ▼
[use-pedidos-ruta] ──llama──► [capacity-fit] (bin-packing 2D)
       │                              │
       │                    valida peso ≤85%, vol ≤95%
       │                              │
       ▼                              ▼
[use-pedidos-ruta] ──llama──► [distance-matrix] ──HTTP──► OSRM /table
       │                              │                        │
       │                    fallback haversine × 1.35    (si falla)
       ▼
[use-pedidos-ruta] ──llama──► [optimize-stops] (nearest-neighbor TSP)
       │
       ▼
[RutaEnConstruccion] ──llama──► [route-geometry] ──HTTP──► OSRM /route
       │                                                       │
       │                                         fallback línea recta
       ▼
[RutaMapaPreview] ── renderiza mapa Leaflet con polyline + marcadores
       │
       ▼
Usuario confirma → [use-generar-ruta] ──► generar-ruta-api (Supabase)
                                     └──► generar-ruta-mock (localStorage)
```

## Flujo de Datos — Reparto de Flota

```
Usuario selecciona viaje + configura N slots de vehículo
       │
       ▼
[use-flota-split] ── pool de pedidos del viaje
       │
       ▼
[fleet-split] ── greedy largest-first por vehículo
       │              │
       │    reutiliza [capacity-fit] por cada vehículo
       │              │
       ▼              ▼
Resultado: N grupos de pedidos, cada uno dentro de capacidad
       │
       ▼
[use-generar-flota] ── genera N rutas en batch (mock o real)
```

## Patrones Arquitectónicos Aplicados

### 1. Repository Pattern (acceso a datos)
Los archivos `*-api.ts` encapsulan toda interacción con Supabase. Los hooks nunca hacen queries directos — siempre pasan por la capa de repositorio.

### 2. Graceful Degradation (fallback en cascada)
Cada punto de integración tiene un fallback:
- OSRM falla → haversine × factor de corrección 1.35
- Supabase devuelve 0 filas → datos mock sintéticos
- Auth real no disponible → mock-auth con sesión falsa

### 3. Pure Algorithm Extraction
Los algoritmos de negocio (`capacity-fit`, `optimize-stops`, `fleet-split`) son funciones puras:
- Sin dependencia de React, DOM, o estado global
- Reciben datos tipados, retornan resultado tipado
- Testeables en aislamiento (el prototipo tiene self-check como prueba de concepto)

### 4. Feature Flag via Environment Variable
`VITE_MOCK_AUTH` controla el fork mock/real. No hay feature flag service — es una variable de entorno de build time procesada por Vite.

### 5. Conditional Activation Pattern
Los fallbacks de datos NO se activan por feature flag, sino por condición real: si Supabase devuelve 0 filas para una query, se activa el fallback. Esto significa que la transición a datos reales es automática cuando la DB tenga datos.

## Módulo Prototipo No Integrado

`src/lib/routePlanning/` es un motor standalone más avanzado que coexiste como referencia:

| Característica | Módulo Activo | Prototipo |
|---------------|---------------|-----------|
| Optimización | Nearest-neighbor simple | Nearest-neighbor + ventanas horarias |
| Fuente de distancias | OSRM | Google Maps Distance Matrix API |
| Fallback de distancias | Haversine × 1.35 | Haversine pura |
| Ventanas horarias | No | Sí (8am–7pm, flaggea violations) |
| Duración de viaje | No modela | Sí (velocidad urbana 30 km/h) |
| Conectado a UI | Sí | No |
| Tests | No | Self-check assert-based |

La fusión está planificada como ítem #2 y #5 del backlog.

## Decisiones Arquitectónicas (ADR-0001)

| Decisión | Justificación |
|----------|---------------|
| Márgenes de seguridad 85%/95% | Legislación CR de transporte de carga + best practices de fleet management |
| Nearest-neighbor como primer optimizador | O(n²) suficiente para ≤50 paradas; upgrade path documentado a VRPTW |
| OSRM auto-hospedado | Demo público tiene rate limits; despliegue propio en Dokploy eliminó dependencia externa |
| Algoritmos propios (no librería VRP) | Control total sobre lógica de negocio; librerías VRP son opacas para debugging en contexto logístico |

## Boundaries del Módulo

El módulo de planificación es **self-contained** dentro de la SPA:
- **Entrada**: datos de Supabase (catálogos, pedidos) + servicios OSRM
- **Salida**: rutas generadas escritas a Supabase (tablas `routes`, `dispatch_guides`, update `orders`)
- **Sin dependencias horizontales**: no importa de otros módulos de la SPA excepto componentes base compartidos (`src/components/base/`) y hooks de infraestructura (`useAuth`, `useToast`)
