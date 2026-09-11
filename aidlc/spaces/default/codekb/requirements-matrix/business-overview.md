# Business Overview — Módulo de Planificación de Rutas

## Dominio de Negocio

Este módulo forma parte del TMS (Transportation Management System) de STO (Servicios de Transporte y Operaciones), operando como herramienta de planificación de rutas para **logística de última milla** en dos mercados:

- **Costa Rica** — Almacenes Cliro, Gran Área Metropolitana (GAM)
- **Venezuela** — San Diego / Micheleana

El sistema recibe pedidos ya agrupados por el WMS (Warehouse Management System) Iflow en "viajes" y los transforma en rutas de entrega optimizadas asignadas a vehículos y conductores específicos.

## Problema que Resuelve

La operación logística necesita:
1. **Asignar pedidos a vehículos** respetando restricciones físicas (peso/volumen) con márgenes de seguridad regulatorios
2. **Optimizar la secuencia de paradas** para minimizar distancia total recorrida
3. **Gestionar flota mixta** (motos hasta camiones) distribuyendo carga entre múltiples vehículos
4. **Visualizar rutas geográficamente** sobre mapas reales con geometría de calles

## Escala Operativa

| Métrica | Valor |
|---------|-------|
| Rutas por día | 12–36 |
| Paradas máximas por viaje | ~50 |
| Tipos de vehículo | Flota mixta (moto → camión) |
| Cobertura geográfica activa | Costa Rica (GAM) |
| Cobertura pendiente | Venezuela (San Diego/Micheleana) |

## Flujos de Usuario

### Flujo 1: Nueva Ruta (vehículo único)

```
1. Seleccionar viaje despachado (grupo de pedidos desde WMS)
2. Configurar: transportista, conductor, vehículo, fecha de entrega
3. Revisar pedidos del viaje — incluir/excluir individualmente
4. "Anclar" pedidos prioritarios (deben ir sí o sí, validados contra capacidad)
5. El sistema ejecuta bin-packing (peso ≤85%, volumen ≤95% de capacidad del vehículo)
6. Optimizar secuencia de paradas (nearest-neighbor sobre distancias OSRM reales)
7. Visualizar ruta en mapa con polyline de calles reales
8. Ajustar manualmente si necesario (drag-and-drop de paradas)
9. Generar ruta → persiste en base de datos
```

### Flujo 2: Reparto de Flota (multi-vehículo)

```
1. Seleccionar viaje con muchos pedidos
2. Configurar N slots de vehículo (cada uno con transportista + conductor + vehículo)
3. El sistema distribuye pedidos entre vehículos (greedy largest-first)
4. Cada vehículo respeta sus propios límites de capacidad
5. Preview del resultado (qué pedidos van a qué vehículo)
6. Generar todas las rutas en batch
```

### Flujo 3: Gestión de Rutas Generadas

```
1. Ver listado de rutas generadas (con estado: hoy/programada/completada)
2. Ver detalle: mapa con secuencia completa, paradas numeradas
3. Editar ruta: cambiar asignaciones, quitar paradas
4. Eliminar ruta
```

## Decisiones de Negocio Clave

| Decisión | Detalle | Fuente |
|----------|---------|--------|
| TMS NO reasigna ruta↔pedido | Los pedidos llegan ya agrupados del WMS Iflow; el TMS solo optimiza la secuencia dentro de cada grupo | Reunión 2026-08-18 |
| Márgenes de seguridad: 85% peso / 95% volumen | Basado en legislación CR de transporte de carga y mejores prácticas de fleet management | ADR-0001 |
| Nearest-neighbor como optimizador | Suficiente para ≤50 paradas; techo documentado con ruta de upgrade a VRPTW | ADR-0001, comentarios `ponytail:` |
| Datos mock hasta integración WMS real | El prototipo opera con datos sintéticos que se desactivan automáticamente cuando hay datos reales | HANDOFF.md |

## Entidades del Dominio

| Entidad | Descripción |
|---------|-------------|
| **Pedido** | Orden de entrega con dirección, coordenadas, peso, volumen, cliente |
| **Viaje** | Grupo de pedidos despachados juntos desde el WMS (pre-agrupados por ruta) |
| **Ruta Tipo** | Clasificación geográfica de ruta (ej: "GAM Norte", "San José Centro") |
| **Vehículo** | Unidad de transporte con capacidad de peso y volumen definida |
| **Conductor** | Persona que maneja el vehículo |
| **Transportista** | Empresa o unidad operativa dueña de los vehículos |
| **Ruta Generada** | Resultado: secuencia optimizada de paradas asignada a un vehículo/conductor |
| **Parada** | Punto de entrega dentro de una ruta, con secuencia y coordenadas |

## Estado Actual del Módulo

**Prototipo funcional con datos mock.** La base de datos compartida de Supabase tiene 0 pedidos pendientes y el login está bloqueado por un problema de RLS circular. Todo el sistema mock está diseñado con condiciones que lo desactivan automáticamente cuando la condición real cambie (datos disponibles en DB, auth funcional).

### Backlog Priorizado (documentado en HANDOFF.md)

1. Resolver RLS circular y conectar auth real
2. Fusionar motor de ventanas horarias (`src/lib/routePlanning/`)
3. Crear tablas `trips`/`trip_orders` en Supabase
4. Desplegar OSRM para Venezuela
5. Integrar Google Maps Distance Matrix como fuente alternativa
6. Tests unitarios formales para algoritmos
