# Roles y Responsabilidades — Módulo de Planificación de Rutas

## Equipo

### Jesús Araujo — Owner Técnico del Módulo

| Campo | Detalle |
|-------|---------|
| **Rol** | Diseñador e implementador de toda la lógica de planificación |
| **Responsabilidades** | Bin-packing, integración OSRM, reparto de flota, optimización de paradas, decisiones de arquitectura interna del módulo |
| **Rama** | `jesus-planificacion` |
| **Repositorio** | `JesusAraujoDEV/requirements-matrix` |
| **Decisiones tomadas** | Márgenes de seguridad 85%/95% (ADR-0001), nearest-neighbor como primer optimizador, OSRM auto-hospedado, patrón de fallbacks en cascada, sistema de mocking con activación condicional |

---

### Jean Carlo — Líder del Proyecto TMS OLO

| Campo | Detalle |
|-------|---------|
| **Rol** | Decision-maker de alcance y prioridad cross-módulo (Intelix) |
| **Responsabilidades** | Define dirección del producto, prioriza features entre módulos, resuelve dudas de negocio, coordina con el cliente |
| **Decisiones tomadas** | El TMS NO reasigna ruta↔pedido (los pedidos llegan ya agrupados del WMS); validó el alcance del prototipo de planificación |

---

### Eduardo — Owner del Módulo OMS / Guía de Despacho

| Campo | Detalle |
|-------|---------|
| **Rol** | Desarrollador del módulo que genera los insumos que Planificación consume |
| **Responsabilidades** | Módulo OMS (gestión de pedidos, guías de despacho). Su módulo genera los viajes y pedidos que Planificación recibe como entrada |
| **Interfaz** | OMS → Planificación vía tabla `orders` (Supabase) + concepto de "Viaje" (agrupación de pedidos despachados por el WMS Iflow) |

---

### Dylan — Owner del Módulo de Liquidación / Tarifas

| Campo | Detalle |
|-------|---------|
| **Rol** | Desarrollador del módulo downstream de Planificación |
| **Responsabilidades** | Cálculo de tarifas y costos de transporte. Potencial consumidor de datos de rutas completadas (distancia recorrida, paradas servidas, tiempo) para liquidación de fletes |
| **Interfaz** | Planificación → Liquidación (por definir): datos de rutas completadas como insumo para cálculo de costos |

---

### Andrey — Owner del Módulo SRO

| Campo | Detalle |
|-------|---------|
| **Rol** | Desarrollador de módulo paralelo |
| **Responsabilidades** | Módulo SRO (Sistema de Recolección de Órdenes — interfaz por definir) |
| **Interfaz** | Paralelo a Planificación; sin dependencia directa identificada actualmente |

---

## Mapa de Dependencias Inter-Módulo

```
┌──────────────────────────────────────────────────────────────────────┐
│                        WMS Iflow (externo)                            │
│         Agrupa pedidos en "viajes" y los despacha al TMS             │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ viajes + pedidos agrupados
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OMS / Guía de Despacho (Eduardo)                    │
│          Gestión de pedidos, tabla `orders` en Supabase              │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ tabla `orders` + concepto Viaje
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│               PLANIFICACIÓN DE RUTAS (Jesús Araujo)                  │
│    Bin-packing → Optimización → Generación de rutas asignadas        │
└──────────────┬──────────────────────────────────┬────────────────────┘
               │ rutas completadas (futuro)       │ (sin interfaz)
               ▼                                  ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│   Liquidación/Tarifas (Dylan) │    │       SRO (Andrey)            │
│   Cálculo de costos de flete  │    │   Módulo paralelo            │
└──────────────────────────────┘    └──────────────────────────────┘
```

### Detalle de Interfaces

| Origen | Destino | Mecanismo | Estado |
|--------|---------|-----------|--------|
| WMS Iflow → OMS | Viajes + pedidos agrupados | Externo (no controlado por el equipo TMS) | Activo |
| OMS → Planificación | Tabla `orders` (Supabase) + concepto "Viaje" | Query directa a Supabase con filtro por `route_type_id` | Implementado (con fallback mock) |
| Planificación → Liquidación | Datos de rutas completadas (distancia, paradas, tiempo) | Por definir | No implementado |
| Planificación → SRO | Sin dependencia identificada | N/A | N/A |

---

## Flujo de Coordinación

| Aspecto | Detalle |
|---------|---------|
| **Cadencia de reuniones** | Ad-hoc, sin cadencia fija. Reuniones documentadas según necesidad |
| **Documentación** | Notion workspace Intelix, bajo la página "TMS OLO — Documentación del Proyecto" |
| **Reuniones documentadas relevantes** | Kickoff 2026-06-25, Arquitectura DB 2026-07-20, Planificación de Rutas 2026-08-10, Organización del equipo 2026-08-11 |
| **Decisiones de negocio** | Escaladas a Jean Carlo; respuestas documentadas en Notion ("Dudas para iniciar el prototipo de Planificación de Rutas") |
| **Estrategia de ramas** | Cada developer en su propia rama por módulo (`jesus-planificacion`, etc.) |

---

## Canales de Comunicación

| Canal | Uso |
|-------|-----|
| **Notion** (workspace Intelix) | Documentación de reuniones, decisiones, dudas resueltas, estándares de arquitectura |
| **Rama Git propia** | Cada módulo en rama independiente; merge a `main` cuando el módulo esté listo |
| **Base de datos Supabase compartida** | Entorno de desarrollo compartido por todo el equipo (problema de RLS/auth documentado en `HANDOFF.md`) |
| **Reuniones presenciales/virtuales** | Coordinación puntual de interfaces entre módulos |

---

## Puntos de Coordinación Abiertos

1. **Interfaz Planificación → Liquidación**: no definida. Dylan necesitará datos de rutas completadas (km recorridos, cantidad de paradas, tiempos) para calcular tarifas. Requiere definir schema y trigger.
2. **RLS / Auth circular**: bloquea el flujo real de login. Requiere que un Admin existente dé de alta usuarios nuevos — nadie tiene acceso Admin actualmente.
3. **Datos reales de pedidos pendientes**: la tabla `orders` tiene 0 pedidos `pending` en el entorno compartido. El módulo funciona con mock hasta que OMS (Eduardo) genere pedidos reales.
4. **Coordenadas de Venezuela (IPRAC)**: pendiente de confirmación por parte de "Toño" para geocodificación de direcciones en San Diego/Micheleana.
5. **Catálogo real de capacidades de vehículos**: columnas `capacity_weight`/`capacity_volume` existen en la BD pero requieren validación con datos operativos reales.
