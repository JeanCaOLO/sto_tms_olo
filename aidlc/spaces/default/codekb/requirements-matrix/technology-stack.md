# Technology Stack — Módulo de Planificación de Rutas

## Stack Completo

### Core

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **React** | 19.1.0 | Framework UI — renderizado de componentes, estado, ciclo de vida |
| **TypeScript** | 5.8.3 | Lenguaje — tipado estático sobre JavaScript |
| **Vite** | 7.0.3 | Bundler/dev server — HMR rápido, build optimizado para producción |
| **@vitejs/plugin-react-swc** | — | Plugin Vite — compilación JSX/TSX via SWC (más rápido que Babel) |

### Routing y Navegación

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **react-router-dom** | 7.6.3 | Routing SPA — página `/planificacion` montada como ruta |

### Styling

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **Tailwind CSS** | 3.4.17 | Utility-first CSS — todos los estilos como clases en el markup |
| **Remix Icons** | CDN | Iconografía — clases `ri-*` cargadas desde CDN |

### Mapas y Geolocalización

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **Leaflet** | 1.9.4 | Librería de mapas interactivos — marcadores, polylines, bounds, eventos |
| **react-leaflet** | 5.0.0 | Wrapper React para Leaflet — componentes declarativos `<MapContainer>`, `<Marker>`, `<Polyline>` |
| **@types/leaflet** | — | Tipos TypeScript para Leaflet |
| **OpenStreetMap tiles** | — | Tiles de mapa base (servicio gratuito, sin API key) |

### Backend / Base de Datos

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **Supabase** | SDK 2.57.4 | BaaS — Postgres + Auth + Row Level Security + Realtime |
| **PostgreSQL** (via Supabase) | — | Base de datos relacional para catálogos, pedidos, rutas |

### Routing Engine (Optimización de Rutas)

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **OSRM** | Docker `osrm/osrm-backend:latest` | Motor de routing vehicular — distancias reales y geometría de calles |
| **OpenStreetMap data** | — | Datos de red vial para OSRM (Costa Rica actualmente) |

### Internacionalización

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **i18next** | 25.4.1 | Framework i18n — traducciones, interpolación, pluralización |
| **react-i18next** | 15.6.0 | Wrapper React — hook `useTranslation()`, componente `<Trans>` |

### Visualización de Datos

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **Recharts** | 3.2.0 | Gráficos React — usado en otros módulos del TMS, disponible para métricas de ruta |

### Fechas

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **date-fns** | 4.1.0 | Manipulación de fechas — formateo relativo ("hace 3 h"), comparaciones |

### Calidad de Código

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **ESLint** | 9.30.1 | Linter — reglas de calidad y estilo |
| **typescript-eslint** | 8.35.1 | Plugin ESLint para TypeScript — reglas type-aware |
| **unplugin-auto-import** | 19.3.0 | Auto-import de React hooks y react-router hooks (sin import explícito) |

### Package Manager

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **pnpm** | (workspace mode) | Gestor de paquetes — instalación rápida, deduplicación, workspaces |

### Infraestructura / DevOps

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| **Docker** | — | Contenedorización de OSRM |
| **Docker Compose** | — | Orquestación de servicios OSRM (fetch + backend) |
| **Dokploy** | — | Plataforma de despliegue (hosting de OSRM en `osrm.jesusaraujo.lat`) |

---

## Stack del Prototipo No Integrado (`src/lib/routePlanning/`)

| Tecnología | Propósito adicional |
|-----------|-------------------|
| **Google Maps Distance Matrix API** | Fuente de distancias/duraciones reales de manejo (alternativa a OSRM) |

---

## Variables de Entorno

| Variable | Tipo | Propósito | Default |
|----------|------|-----------|---------|
| `VITE_SUPABASE_URL` | Build-time | URL del proyecto Supabase | (requerida) |
| `VITE_SUPABASE_ANON_KEY` | Build-time | Anon key de Supabase | (requerida) |
| `VITE_MOCK_AUTH` | Build-time | Activa mock de autenticación (`true`/`false`) | `false` |
| `VITE_OSRM_URL` | Build-time | Base URL de OSRM | `https://router.project-osrm.org` |

---

## Decisiones de Stack Notables

| Decisión | Justificación |
|----------|---------------|
| OSRM sobre Google Maps (módulo activo) | Sin costo por request, auto-hospedable, sin vendor lock-in |
| Algoritmos propios (no librería VRP) | Control total, debugging transparente, complejidad proporcional al problema actual (≤50 paradas) |
| Leaflet sobre Google Maps JS SDK | Open source, sin API key, tiles OSM gratuitos |
| Supabase sobre API REST propia | Prototipado rápido, auth integrado, RLS como capa de seguridad |
| Tailwind sobre CSS modules/styled-components | Convención del proyecto — consistencia con otros módulos del TMS |
| pnpm sobre npm/yarn | Workspace mode nativo, instalación más rápida, deduplicación estricta |
| Vite + SWC sobre webpack + Babel | HMR instantáneo, builds más rápidos en desarrollo |
