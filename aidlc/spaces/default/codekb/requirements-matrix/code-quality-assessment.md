# Code Quality Assessment — Módulo de Planificación de Rutas

## Evaluación General

**Calificación**: Sólido para un prototipo — estructura madura, deuda técnica documentada, sin sorpresas ocultas.

El módulo demuestra disciplina arquitectónica inusual para un prototipo: separación de concerns limpia, fallbacks explícitos en cada integración, límites de tamaño enforced, y toda simplificación deliberada documentada con su ruta de upgrade.

---

## Patrones Positivos

### 1. Comentarios `ponytail:` — Simplificación Deliberada Documentada

Todos los algoritmos incluyen un comentario `ponytail:` que documenta:
- Qué simplificación se hizo
- Cuál es el techo de rendimiento/calidad de la simplificación
- Cuál es la ruta de upgrade cuando el techo se alcance

**Ejemplos**:
| Archivo | Simplificación | Techo | Upgrade path |
|---------|---------------|-------|--------------|
| `capacity-fit.ts` | Greedy first-fit-decreasing | No garantiza óptimo en 2D (peso+vol) | 2D knapsack o branch-and-bound |
| `optimize-stops.ts` | Nearest-neighbor TSP | Puede dar tours ~25% más largos que óptimo | VRPTW solver (OR-Tools, custom) |
| `fleet-split.ts` | Sequential fill (greedy largest-first) | No optimiza asignación global entre vehículos | Multi-bin optimization |
| `haversine.ts` | Distancia línea recta | Subestima en terreno montañoso, sobreestima en zonas con puentes directos | Road API (ya existe con OSRM) |

### 2. Límites de Tamaño Enforced

Hooks automáticos del proyecto imponen:
| Tipo de archivo | Máximo | Efecto |
|----------------|--------|--------|
| Páginas (`page.tsx`) | 200 líneas | Fuerza extracción a hooks y componentes |
| Hooks (`use-*.ts`) | 80 líneas | Fuerza single-responsibility |
| Componentes (`.tsx`) | 150 líneas | Fuerza composición sobre componentes monolíticos |
| Módulos de lógica (`.ts`) | 200 líneas | Fuerza separación de algoritmos |

**Resultado**: los archivos más grandes del módulo tienen ~153 líneas (`page.tsx`). No hay god-files.

### 3. Separación de Concerns Limpia

```
Algoritmos (funciones puras)     ← sin React, sin IO, sin estado
     ↑
Hooks (estado + orquestación)    ← sin JSX, sin DOM
     ↑
Componentes (presentación)       ← sin lógica de negocio, sin fetch directo
```

Esta separación permite:
- Testear algoritmos sin React rendering
- Reutilizar algoritmos en contextos diferentes (server-side, CLI)
- Cambiar la UI sin tocar la lógica de negocio

### 4. Graceful Degradation Sistémico

Cada punto de fallo externo tiene un fallback explícito:

| Punto de fallo | Condición | Fallback | Calidad del fallback |
|----------------|-----------|----------|---------------------|
| OSRM `/table` | HTTP error o response inválida | Haversine × 1.35 | Aceptable (~35% error típico urbano) |
| OSRM `/route` | HTTP error o response inválida | Línea recta GeoJSON | Visual — no afecta optimización |
| Supabase queries | 0 filas retornadas | Datos sintéticos `fallback-*.ts` | Funcional para demo/desarrollo |
| Supabase writes | RLS bloquea | localStorage vía mock-store | Funcional pero no persiste servidor |
| Auth | RLS circular | mock-auth con sesión falsa | Bypass total — solo desarrollo |

### 5. ADR Bien Fundamentado

ADR-0001 (márgenes de seguridad y optimización) incluye:
- Fuentes legislativas reales (regulación CR de transporte de carga)
- Referencias de la industria (fleet management best practices)
- Justificación numérica de cada constante (85% peso, 95% volumen)
- Análisis de alternativas rechazadas

### 6. Documentación Operacional Exhaustiva

- **HANDOFF.md**: timeline completo, decisiones tomadas, backlog priorizado
- **MOCKING.md**: estrategia mock, checklist de remoción punto por punto
- **Work logs** (`docs/work/2026-08/`): formato qué/por qué/cómo/promoted knowledge/follow-ups
- Comentarios inline en español en código de negocio

---

## Issues Conocidas

### Severidad Alta

| # | Issue | Impacto | Mitigación actual |
|---|-------|---------|-------------------|
| 1 | **Sin tests unitarios formales** | No hay red de seguridad contra regresiones en los algoritmos | Solo self-check en el prototipo (no cubre módulo activo). Hooks de líneas imponen estructura pero no correctness. |
| 2 | **RLS circular bloquea auth y escritura real** | El módulo no puede operar con datos reales de Supabase | Mock layer completo (auth falso + localStorage) |
| 3 | **Tabla `trips`/`trip_orders` no existe** | El concepto "viaje" solo vive en frontend mock | `viajes-api.ts` es 100% fallback data |

### Severidad Media

| # | Issue | Impacto | Mitigación actual |
|---|-------|---------|-------------------|
| 4 | **Prototipo `src/lib/routePlanning/` sin fusionar** | Duplicación de lógica (2 motores de optimización), ventanas horarias no disponibles en UI | Backlog ítem #2 — fusión planificada |
| 5 | **Fleet split usa pool por ruta, no por viaje** | Inconsistente con el flujo "Nueva Ruta" que ya opera por viaje | Simplificación conocida, documentada |
| 6 | **Fleet split no requiere transportista por vehículo** | Podría generar asignaciones inválidas operativamente | Simplificación conocida, validación UI pendiente |
| 7 | **Solo Costa Rica en OSRM** | Venezuela cae a fallback haversine (menos preciso) | Backlog ítem — despliegue OSRM Venezuela pendiente |

### Severidad Baja

| # | Issue | Impacto | Mitigación actual |
|---|-------|---------|-------------------|
| 8 | **Código muerto: `PedidosDisponibles.tsx`** | Confusión para desarrolladores nuevos, peso muerto en bundle | Sin impacto funcional — puede eliminarse |
| 9 | **No hay error boundary React en el módulo** | Un error en un componente podría crashear toda la página | Los fallbacks previenen la mayoría de errores de datos |

---

## Estado Mock vs Real

### Mapa de Activación

```
VITE_MOCK_AUTH=true
       │
       ▼
┌─── MOCK_AUTH_ENABLED ───┐
│                          │
│  mock-auth.ts: sesión    │     Auth real (Supabase Auth)
│  falsa con org_id        │     ⚠️ Bloqueada por RLS circular
│  hardcoded               │
│                          │
└──────────────────────────┘

Supabase query retorna 0 filas
       │
       ▼
┌─── CONDITIONAL FALLBACK ─┐
│                           │
│  fallback-pedidos.ts      │     Datos reales de Supabase
│  fallback-rutas.ts        │     (cuando existan)
│  fallback-viajes.ts       │
│                           │
└───────────────────────────┘

MOCK_AUTH_ENABLED (para escritura)
       │
       ▼
┌─── WRITE PATH ───────────┐
│                           │
│  generar-ruta-mock.ts     │     generar-ruta-api.ts
│  (localStorage)           │     (Supabase INSERT/UPDATE)
│                           │     ⚠️ Bloqueada por RLS
└───────────────────────────┘
```

### Checklist de Remoción de Mocks (de MOCKING.md)

1. ☐ Resolver RLS circular en Supabase (auth funcional)
2. ☐ Poblar datos reales en tablas existentes (orders, vehicles, etc.)
3. ☐ Crear tablas `trips` / `trip_orders` con schema real
4. ☐ Setear `VITE_MOCK_AUTH=false`
5. ☐ Los fallbacks de datos se desactivan solos (condición: >0 filas reales)
6. ☐ Verificar que `generar-ruta-api.ts` puede escribir (RLS permite INSERT)
7. ☐ Opcionalmente eliminar archivos `fallback-*.ts` y `generar-ruta-mock.ts`

---

## Métricas de Estructura

| Métrica | Valor | Evaluación |
|---------|-------|-----------|
| Archivos totales en módulo | ~47 | Bien factorizado |
| Líneas máximas por archivo | ~153 (page.tsx) | Bajo el límite de 200 |
| Hooks por archivo hook | 1 | Single responsibility ✓ |
| Dependencias circulares | 0 detectadas | Grafo acíclico ✓ |
| Archivos >150 líneas | 1 (page.tsx) | Excelente factorización |
| Componentes sin uso | 1 (PedidosDisponibles) | Código muerto mínimo |
| Algoritmos como funciones puras | 5/5 | Separación total ✓ |
| APIs con fallback | 5/5 | Degradación completa ✓ |

---

## Recomendaciones Priorizadas

### Inmediatas (antes de producción)
1. **Tests unitarios para algoritmos** — `capacity-fit`, `optimize-stops`, `fleet-split` son funciones puras perfectas para testing. Migrar el patrón self-check del prototipo.
2. **Resolver RLS** — sin esto, el módulo no puede operar con datos reales.
3. **Eliminar `PedidosDisponibles.tsx`** — código muerto que confunde.

### Corto plazo (próximo sprint)
4. **Fusionar motor de ventanas horarias** del prototipo al módulo activo.
5. **Crear tablas `trips`/`trip_orders`** en Supabase para eliminar el mock de viajes.
6. **Error boundary React** alrededor del módulo para contener crashes.

### Mediano plazo
7. **Desplegar OSRM Venezuela** — actualmente cae a haversine.
8. **Consistencia fleet-split** — alinear pool por viaje (no por ruta).
9. **Validación de transportista** en fleet-split antes de generar.
