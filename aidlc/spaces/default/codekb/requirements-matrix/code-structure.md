# Code Structure — Módulo de Planificación de Rutas

## Árbol de Archivos con Responsabilidades

```
src/
├── pages/
│   └── planificacion/
│       ├── page.tsx                    # Orquestador principal (3 tabs, 153 líneas)
│       ├── types.ts                    # Interfaces compartidas del dominio
│       │
│       ├── ── ALGORITMOS ──────────────
│       ├── capacity-fit.ts             # Bin-packing greedy (peso ≤85%, vol ≤95%)
│       ├── optimize-stops.ts           # TSP nearest-neighbor + distancias precalculadas
│       ├── fleet-split.ts              # Reparto multi-vehículo (greedy largest-first)
│       ├── distance-matrix.ts          # Matriz N×N: OSRM /table + fallback haversine
│       ├── route-geometry.ts           # Polyline por calles: OSRM /route + fallback
│       │
│       ├── ── CONFIGURACIÓN ───────────
│       ├── osrm-config.ts              # Base URL de OSRM (env var VITE_OSRM_URL)
│       │
│       ├── ── UTILIDADES ──────────────
│       ├── route-status.ts             # Derivación de estado visual por fecha
│       │
│       ├── ── ACCESO A DATOS ──────────
│       ├── catalogos-api.ts            # Fetch catálogos (rutas, vehículos, etc.)
│       ├── pedidos-api.ts              # Fetch pedidos por ruta tipo + org
│       ├── viajes-api.ts               # Fetch viajes despachados (100% mock)
│       ├── generar-ruta-api.ts         # Escritura real a Supabase
│       ├── generar-ruta-mock.ts        # Escritura mock a localStorage
│       │
│       ├── ── DATOS MOCK ─────────────
│       ├── fallback-pedidos.ts         # 20 paradas sintéticas (coords reales GAM)
│       ├── fallback-rutas.ts           # 5 tipos de ruta (2 reales + 3 sintéticos)
│       ├── fallback-viajes.ts          # 4 viajes sintéticos por zona geográfica
│       │
│       ├── ── HOOKS ──────────────────
│       ├── use-catalogos.ts            # Carga catálogos una vez, expone estado
│       ├── use-viajes.ts               # Carga viajes despachados
│       ├── use-pedidos-ruta.ts         # Estado central: selección, toggle, optimización
│       ├── use-pedidos-anclados.ts     # Set de pins con validación de capacidad
│       ├── use-generar-ruta.ts         # Genera 1 ruta (decide mock vs real)
│       ├── use-generar-flota.ts        # Genera N rutas en batch
│       ├── use-flota-split.ts          # Estado del reparto de flota
│       ├── use-rutas-generadas.ts      # CRUD rutas generadas (localStorage)
│       │
│       └── components/
│           ├── ── LAYOUT / TABS ──────
│           ├── PlanificacionTabs.tsx    # Tabs "Nueva Ruta" / "Flota" / "Generadas"
│           ├── NuevaRutaTab.tsx         # Layout flujo 1 vehículo
│           ├── FlotaSplitTab.tsx        # Flujo reparto multi-vehículo
│           │
│           ├── ── CONFIGURACIÓN ──────
│           ├── ConfiguracionRuta.tsx    # Panel de configuración
│           ├── RouteConfigForm.tsx      # Formulario de selects/inputs
│           │
│           ├── ── CAPACIDAD ──────────
│           ├── CapacityBar.tsx          # Barra visual peso/volumen
│           │
│           ├── ── PEDIDOS ────────────
│           ├── PedidosRuta.tsx          # Lista con filtros + toggle
│           ├── PedidoCard.tsx           # Card individual (badge, ancla, peso/vol)
│           ├── PedidosDisponibles.tsx   # ⚠️ CÓDIGO MUERTO — sin imports
│           │
│           ├── ── RUTA EN CONSTRUCCIÓN ─
│           ├── RutaEnConstruccion.tsx   # Timeline drag-and-drop + mapa live
│           ├── ParadaCard.tsx           # Card draggable con secuencia
│           ├── RutaMapaPreview.tsx      # Mapa Leaflet + polyline OSRM
│           ├── ParadaDetalleModal.tsx   # Modal detalle al click marcador
│           ├── StopBadge.tsx            # Badge numérico
│           │
│           ├── ── FLOTA ──────────────
│           ├── FlotaSlotPicker.tsx      # Selector vehículos + conductores
│           ├── FlotaResultadoPreview.tsx # Preview resultado reparto
│           │
│           ├── ── RUTAS GENERADAS ────
│           ├── RutasGeneradas.tsx       # Listado de rutas generadas
│           ├── RutaGeneradaCard.tsx     # Card con mapa, estado, acciones
│           ├── StopMiniPreview.tsx      # Preview compacto de paradas
│           ├── SecuenciaRutaModal.tsx   # Modal mapa grande + lista completa
│           └── EditarRutaModal.tsx      # Modal edición (asignaciones, quitar paradas)
│
├── lib/
│   ├── routePlanning/                  # ⚠️ PROTOTIPO NO INTEGRADO
│   │   ├── types.ts                    # Interfaces: Stop, PlanStop, VehicleCapacity
│   │   ├── plan-route.ts              # Motor: nearest-neighbor + ventanas horarias
│   │   ├── haversine.ts              # Haversine + duración (30 km/h urbano)
│   │   ├── google-distance-matrix.ts # Cliente Google Maps (batching 10×10)
│   │   ├── build-matrices.ts         # Builder: Google Maps real o fallback
│   │   └── plan-route.selfcheck.ts   # Self-check assert-based
│   │
│   ├── mock-auth.ts                   # Sesión falsa Supabase (opt-in env var)
│   ├── mock-store.ts                  # CRUD localStorage (prefijo sto_mock_)
│   └── supabase.ts                    # Cliente Supabase singleton
│
├── infra/
│   └── osrm/
│       ├── docker-compose.yml         # OSRM auto-hospedado (fetch + backend)
│       └── README.md                  # Documentación despliegue (Dokploy)
│
├── docs/
│   ├── decisions/
│   │   └── 0001-route-planning-safety-margin-and-optimization.md
│   └── work/
│       └── 2026-08/                   # 6 bitácoras de trabajo
│
├── HANDOFF.md                         # Timeline, decisiones, backlog priorizado
└── MOCKING.md                         # Estrategia mock, checklist de remoción
```

## Clasificación de Archivos

### Por Tipo

| Clasificación | Archivos | Líneas típicas |
|--------------|----------|----------------|
| Controller/Page | 1 (`page.tsx`) | ≤200 |
| Algorithm | 5 (capacity-fit, optimize-stops, fleet-split, distance-matrix, route-geometry) | ≤200 |
| Repository/API | 5 (catalogos-api, pedidos-api, viajes-api, generar-ruta-api, generar-ruta-mock) | ≤200 |
| Hook/State | 6 (use-catalogos, use-viajes, use-pedidos-ruta, use-pedidos-anclados, use-flota-split, use-rutas-generadas) | ≤80 |
| Hook/Action | 2 (use-generar-ruta, use-generar-flota) | ≤80 |
| Component | 20 (en `components/`) | ≤150 |
| Model/Types | 1 (`types.ts`) | variable |
| Configuration | 1 (`osrm-config.ts`) | <20 |
| Utility | 1 (`route-status.ts`) | <50 |
| Mock/Data | 3 (fallback-pedidos, fallback-rutas, fallback-viajes) | variable |

### Límites de Líneas (enforced por hooks automáticos)

| Tipo | Máximo |
|------|--------|
| Páginas | 200 líneas |
| Hooks | 80 líneas |
| Componentes | 150 líneas |
| Módulos de lógica | 200 líneas |

## Convenciones de Naming

| Categoría | Patrón | Idioma | Ejemplo |
|-----------|--------|--------|---------|
| Hooks | `use-<nombre>.ts` (kebab-case) | Español en negocio | `use-pedidos-ruta.ts` |
| Componentes | `PascalCase.tsx` | Español en negocio | `PedidoCard.tsx` |
| Algoritmos | `kebab-case.ts` | Inglés | `capacity-fit.ts` |
| APIs | `<entidad>-api.ts` | Español entidad | `catalogos-api.ts` |
| Fallbacks | `fallback-<entidad>.ts` | Español | `fallback-pedidos.ts` |
| Tipos | `types.ts` (uno por módulo) | Español en interfaces | `Pedido`, `Viaje` |

## Dependencias entre Archivos

```
page.tsx
  ├── imports → use-catalogos, use-viajes, use-pedidos-ruta,
  │              use-pedidos-anclados, use-generar-ruta,
  │              use-generar-flota, use-flota-split, use-rutas-generadas
  └── renders → PlanificacionTabs

use-pedidos-ruta
  ├── imports → capacity-fit, optimize-stops, distance-matrix
  └── imports → pedidos-api

use-generar-ruta
  ├── imports → generar-ruta-api (real path)
  └── imports → generar-ruta-mock (mock path)

use-flota-split
  └── imports → fleet-split

distance-matrix
  ├── imports → osrm-config
  └── HTTP call → OSRM /table

route-geometry
  ├── imports → osrm-config
  └── HTTP call → OSRM /route

catalogos-api / pedidos-api
  └── imports → src/lib/supabase

generar-ruta-api
  └── imports → src/lib/supabase

generar-ruta-mock
  └── imports → src/lib/mock-store
```

## Código Muerto Identificado

| Archivo | Razón |
|---------|-------|
| `components/PedidosDisponibles.tsx` | No importado desde ningún archivo. Tiene interfaces locales duplicadas. Vestigio de versión anterior del flujo. |
