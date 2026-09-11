# API Documentation — Integraciones Externas

## Resumen de Integraciones

| Servicio | Protocolo | Estado | Archivos |
|----------|-----------|--------|----------|
| Supabase (Postgres + Auth) | HTTPS (SDK) | Parcialmente activo | `catalogos-api.ts`, `pedidos-api.ts`, `generar-ruta-api.ts`, `src/lib/supabase.ts` |
| OSRM — Distance Matrix | HTTP REST | Activo | `distance-matrix.ts`, `osrm-config.ts` |
| OSRM — Route Geometry | HTTP REST | Activo | `route-geometry.ts`, `osrm-config.ts` |
| Google Maps Distance Matrix | HTTP REST | Solo prototipo | `src/lib/routePlanning/google-distance-matrix.ts` |
| Leaflet + OpenStreetMap | Tile HTTP | Activo | `RutaMapaPreview.tsx` |
| localStorage | Browser API | Activo (mock) | `src/lib/mock-store.ts` |

---

## 1. Supabase (Base de Datos + Auth)

### Configuración
- **Cliente**: `src/lib/supabase.ts` — singleton inicializado con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- **SDK**: `@supabase/supabase-js` v2.57.4

### Operaciones de Lectura

#### `catalogos-api.ts` — Catálogos de referencia
```typescript
// Tablas consultadas:
// - route_types (tipos de ruta)
// - vehicles (vehículos con capacidad)
// - carriers (transportistas)
// - drivers (conductores)

// Patrón: select → filter by org_id → return array
// Fallback: si 0 resultados → datos mock de fallback-rutas.ts
```

#### `pedidos-api.ts` — Pedidos pendientes
```typescript
// Tabla: orders
// Filtros: route_type_id + org_id + status = 'pending'
// Campos clave: id, address, lat, lng, weight_kg, volume_m3, client_name
// Fallback: si 0 filas → fallback-pedidos.ts (20 paradas sintéticas)
```

#### `viajes-api.ts` — Viajes despachados
```typescript
// ⚠️ 100% MOCK — la tabla trips no existe aún en Supabase
// Fuente real: fallback-viajes.ts (4 viajes sintéticos)
// Pendiente: crear tablas trips + trip_orders en schema
```

### Operaciones de Escritura

#### `generar-ruta-api.ts` — Generación de ruta
```typescript
// Transacción (secuencial, no atómica DB-level):
// 1. INSERT into routes (ruta con metadata)
// 2. INSERT into dispatch_guides (guía de despacho por parada)
// 3. UPDATE orders SET status = 'routed' WHERE id IN (...)

// ⚠️ Actualmente bloqueado por RLS circular — las políticas
// de seguridad a nivel de fila impiden escritura con el token anon.
// Workaround activo: generar-ruta-mock.ts vía localStorage
```

### Esquema de Tablas Conocido

| Tabla | Campos clave | Estado |
|-------|-------------|--------|
| `route_types` | id, name, org_id | Existente |
| `vehicles` | id, plate, weight_capacity_kg, volume_capacity_m3, carrier_id | Existente |
| `carriers` | id, name, org_id | Existente |
| `drivers` | id, name, carrier_id | Existente |
| `orders` | id, address, lat, lng, weight_kg, volume_m3, client_name, route_type_id, status | Existente |
| `routes` | id, vehicle_id, driver_id, carrier_id, route_type_id, date, status | Existente |
| `dispatch_guides` | id, route_id, order_id, sequence, lat, lng | Existente |
| `trips` | — | ⚠️ NO EXISTE |
| `trip_orders` | — | ⚠️ NO EXISTE |

### Auth
- **Estado real**: bloqueada por RLS circular
- **Mock**: `src/lib/mock-auth.ts` genera sesión falsa con org_id hardcoded
- **Activación mock**: `VITE_MOCK_AUTH=true`

---

## 2. OSRM (Open Source Routing Machine)

### Configuración
```typescript
// osrm-config.ts
const OSRM_BASE_URL = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org'
```

Instancias conocidas:
- **Demo público**: `https://router.project-osrm.org` (rate limited)
- **Auto-hospedado**: `https://osrm.jesusaraujo.lat` (Dokploy, solo Costa Rica)

### Endpoint: `/table` — Matriz de Distancias

**Archivo**: `distance-matrix.ts`

```
GET {OSRM_BASE_URL}/table/v1/driving/{coordinates}
    ?annotations=distance
```

**Parámetros**:
- `coordinates`: lista de `lng,lat` separados por `;` (formato OSRM: longitud primero)
- `annotations=distance`: solicita solo distancias (no duraciones)

**Respuesta esperada**:
```json
{
  "code": "Ok",
  "distances": [[0, 1234.5, ...], [1234.5, 0, ...], ...]
}
```

**Comportamiento**:
- Envía todas las coordenadas en una sola request (N paradas → N×N matrix)
- Si OSRM falla (error HTTP, timeout, `code !== "Ok"`): fallback a haversine × 1.35
- El factor 1.35 compensa que haversine es línea recta (la ruta real es ~35% más larga en entorno urbano)

**Límites**:
- Demo público: no documentado, rate-limited en la práctica
- Auto-hospedado: sin límite configurado; rendimiento depende del dataset cargado

### Endpoint: `/route` — Geometría de Ruta

**Archivo**: `route-geometry.ts`

```
GET {OSRM_BASE_URL}/route/v1/driving/{coordinates}
    ?overview=full
    &geometries=geojson
```

**Parámetros**:
- `coordinates`: lista ordenada de `lng,lat` (la secuencia de paradas ya optimizada)
- `overview=full`: geometría completa (no simplificada)
- `geometries=geojson`: formato GeoJSON para la polyline

**Respuesta esperada**:
```json
{
  "code": "Ok",
  "routes": [{
    "geometry": {
      "type": "LineString",
      "coordinates": [[lng, lat], ...]
    },
    "distance": 12345.6,
    "duration": 1234.5
  }]
}
```

**Comportamiento**:
- Se invoca DESPUÉS de la optimización de secuencia (solo para visualización)
- Si falla: fallback a línea recta entre paradas (polyline GeoJSON manual)
- La polyline se pasa directamente a Leaflet `<Polyline>` component

### Infraestructura OSRM Auto-hospedada

**Archivos**: `infra/osrm/docker-compose.yml`, `infra/osrm/README.md`

```yaml
# docker-compose.yml (simplificado)
services:
  osrm-fetch:
    # Descarga y preprocesa datos OSM de Costa Rica
    # Se ejecuta una vez para generar el grafo de routing
  osrm-backend:
    image: osrm/osrm-backend:latest
    # Sirve el API de routing sobre los datos preprocesados
    ports:
      - "5000:5000"
```

**Despliegue**: probado en Dokploy (`osrm.jesusaraujo.lat`)
**Cobertura**: solo Costa Rica — Venezuela pendiente

---

## 3. Google Maps Distance Matrix API (Solo Prototipo)

### Configuración
**Archivo**: `src/lib/routePlanning/google-distance-matrix.ts`

```
GET https://maps.googleapis.com/maps/api/distancematrix/json
    ?origins={lat,lng|lat,lng|...}
    &destinations={lat,lng|lat,lng|...}
    &key={GOOGLE_MAPS_API_KEY}
```

### Batching
- La API acepta máximo 25 orígenes × 25 destinos por request
- El cliente implementa batching 10×10 para mantenerse dentro de la cuota free tier
- Las matrices parciales se ensamblan en una matriz N×N completa

### Estado
- **NO conectado a la UI activa** — solo en `src/lib/routePlanning/`
- Planificado como fuente alternativa a OSRM (backlog ítem #5)
- Requiere API key (no incluida en el repo)

---

## 4. Leaflet + OpenStreetMap

### Uso
**Archivo**: `components/RutaMapaPreview.tsx`

```typescript
// Renderiza:
// - Mapa base con tiles de OpenStreetMap
// - Marcadores numerados por secuencia de parada
// - Polyline de la ruta (geometría OSRM o fallback línea recta)
// - Fit bounds automático al conjunto de marcadores
```

### Dependencias
- `leaflet` v1.9.4 — librería de mapas base
- `react-leaflet` v5.0.0 — wrapper React para Leaflet
- Tiles: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (gratis, sin API key)

### Interacciones
- Click en marcador → abre `ParadaDetalleModal`
- Polyline animada al optimizar secuencia
- Múltiples instancias de mapa en cards de rutas generadas (`RutaGeneradaCard`)

---

## 5. localStorage (Mock Layer)

### Implementación
**Archivo**: `src/lib/mock-store.ts`

```typescript
// API genérica:
// - getAll<T>(key: string): T[]
// - getById<T>(key: string, id: string): T | null
// - create<T>(key: string, item: T): T
// - update<T>(key: string, id: string, partial: Partial<T>): T
// - remove(key: string, id: string): void

// Prefijo: 'sto_mock_' + key
// Serialización: JSON.stringify/parse
```

### Uso en el módulo
- `generar-ruta-mock.ts` persiste rutas generadas en localStorage cuando mock está activo
- `use-rutas-generadas.ts` lee/elimina/actualiza rutas desde localStorage
- Los datos sobreviven refresh del navegador pero NO se sincronizan entre tabs

---

## Resumen de Fallbacks

| Integración | Condición de fallback | Comportamiento degradado |
|-------------|----------------------|--------------------------|
| OSRM `/table` | Error HTTP o respuesta inválida | Haversine × 1.35 entre todos los pares |
| OSRM `/route` | Error HTTP o respuesta inválida | Línea recta GeoJSON entre paradas |
| Supabase queries | 0 filas retornadas | Datos sintéticos de `fallback-*.ts` |
| Supabase writes | RLS bloquea la escritura | localStorage vía `mock-store.ts` |
| Supabase auth | RLS circular impide login | `mock-auth.ts` con sesión falsa |
| Google Maps (prototipo) | No disponible/sin key | Haversine pura |
