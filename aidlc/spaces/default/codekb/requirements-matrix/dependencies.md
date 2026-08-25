# Dependencies — Módulo de Planificación de Rutas

## Dependencias Críticas para el Módulo

Estas son las dependencias que el módulo de planificación utiliza directamente. Otras dependencias del `package.json` del proyecto pertenecen a otros módulos del TMS.

### Runtime Dependencies

| Package | Versión | Rol en el módulo | Importado desde |
|---------|---------|-----------------|-----------------|
| `react` | 19.1.0 | Framework UI — hooks, componentes, renderizado | Todos los archivos `.tsx` y hooks |
| `react-dom` | 19.1.0 | Renderizado al DOM — portales para modales | Modales (`ParadaDetalleModal`, `SecuenciaRutaModal`, `EditarRutaModal`) |
| `react-router-dom` | 7.6.3 | Routing — la página se monta en `/planificacion` | `page.tsx`, navegación interna |
| `@supabase/supabase-js` | 2.57.4 | Cliente de base de datos y auth — queries, inserts, session | `catalogos-api.ts`, `pedidos-api.ts`, `generar-ruta-api.ts`, `src/lib/supabase.ts` |
| `leaflet` | 1.9.4 | Mapas interactivos — marcadores, polylines, bounds, eventos de click | `RutaMapaPreview.tsx` |
| `react-leaflet` | 5.0.0 | Wrapper React para Leaflet — `<MapContainer>`, `<TileLayer>`, `<Marker>`, `<Polyline>`, `<Popup>` | `RutaMapaPreview.tsx`, mini-mapas en cards |
| `@types/leaflet` | — | Tipos TypeScript para Leaflet | Type-checking en compilación |
| `date-fns` | 4.1.0 | Formateo de fechas relativas y absolutas | `route-status.ts`, cards de rutas generadas |
| `i18next` | 25.4.1 | Framework i18n — lookup de traducciones | Componentes con texto visible |
| `react-i18next` | 15.6.0 | Hook `useTranslation()` para React | Componentes con texto visible |

### Dev Dependencies relevantes

| Package | Versión | Rol |
|---------|---------|-----|
| `vite` | 7.0.3 | Bundler/dev server — procesa `import.meta.env.*`, HMR |
| `@vitejs/plugin-react-swc` | — | Compilación JSX/TSX vía SWC |
| `typescript` | 5.8.3 | Compilador TypeScript — type-checking |
| `tailwindcss` | 3.4.17 | Procesamiento de clases utility en CSS final |
| `eslint` | 9.30.1 | Linting de código |
| `typescript-eslint` | 8.35.1 | Reglas ESLint type-aware para TypeScript |
| `unplugin-auto-import` | 19.3.0 | Auto-import: `useState`, `useEffect`, `useNavigate` sin import explícito |

---

## Dependencias Externas (No NPM)

| Servicio | Tipo | Rol | Costo |
|----------|------|-----|-------|
| **OSRM** (auto-hospedado) | Docker service | Motor de routing vehicular — distancias + geometría | Hosting del contenedor |
| **OpenStreetMap tiles** | HTTP tiles | Mapa base para Leaflet | Gratis (política de uso justo) |
| **OpenStreetMap data** | Archivo `.osm.pbf` | Datos de red vial para OSRM | Gratis |
| **Supabase** (hosted) | BaaS | Postgres + Auth + RLS | Plan free/pro según uso |
| **Google Maps Distance Matrix** | REST API (solo prototipo) | Distancias reales de manejo | Pay-per-use (no activo) |

---

## Lo Que NO Se Usa (decisiones explícitas)

| Categoría | No se usa | Alternativa propia |
|-----------|-----------|-------------------|
| Librería VRP/TSP | OR-Tools, OptaPlanner, jsprit | Nearest-neighbor + bin-packing propios |
| State management global | Redux, Zustand, Jotai | Custom hooks con useState local |
| Form library | React Hook Form, Formik | Selects controlados manuales |
| Drag-and-drop library | dnd-kit, react-beautiful-dnd | Implementación HTML5 drag nativa |
| Testing framework | Jest, Vitest | Solo self-check assert-based en prototipo |
| Maps (pago) | Google Maps JS SDK, Mapbox | Leaflet + OSM (gratis) |
| Routing engine (pago) | Google Directions API, HERE | OSRM (open source, auto-hospedado) |

---

## Grafo de Dependencias del Módulo

```
page.tsx
  ├── react (hooks, JSX)
  ├── use-*.ts hooks
  │     ├── react (useState, useEffect, useCallback)
  │     ├── @supabase/supabase-js (vía *-api.ts)
  │     ├── capacity-fit.ts (puro, sin deps)
  │     ├── optimize-stops.ts (puro, sin deps)
  │     ├── fleet-split.ts (puro, importa capacity-fit)
  │     ├── distance-matrix.ts (fetch → OSRM, fallback puro)
  │     └── route-geometry.ts (fetch → OSRM, fallback puro)
  │
  └── components/*.tsx
        ├── react + react-dom
        ├── leaflet + react-leaflet (solo RutaMapaPreview)
        ├── date-fns (cards con fechas)
        └── react-i18next (textos)
```

---

## Riesgos de Dependencias

| Riesgo | Impacto | Mitigación actual |
|--------|---------|-------------------|
| OSRM demo público desaparece o rate-limita agresivamente | Sin distancias reales | Auto-hospedado ya desplegado como alternativa |
| Supabase cambia pricing/limita free tier | Backend inaccesible | Mock layer permite operación offline |
| Leaflet deja de mantenerse | Mapas rotos en nuevos browsers | react-leaflet v5 activo; alternativa: Maplibre GL |
| React 19 breaking changes en ecosystem | Incompatibilidad con react-leaflet | react-leaflet v5 ya soporta React 19 |
| OpenStreetMap tiles overloaded | Mapa no carga | Se podría switchear a tile server propio o Mapbox |

---

## Actualización de Dependencias

**Estado al momento del scan**: todas las dependencias en versiones recientes (agosto 2026). No se detectaron vulnerabilidades conocidas en el análisis. Las versiones están pinned en `package.json` (pnpm lockfile garantiza reproducibilidad).
