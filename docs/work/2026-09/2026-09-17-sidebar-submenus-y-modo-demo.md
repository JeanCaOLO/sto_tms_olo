# 2026-09-17 — Submenús de Planificación en el sidebar + Modo demo

## What changed

### 1. Sidebar con submenús (estilo OMS) + tabs como rutas
- **Planificación** pasa a ser un **grupo expandible** en el sidebar (como OMS),
  con submenús: Nueva secuencia, Asignar Viajes, Reparto de Flota, Secuencias
  Generadas, Matriz de Rutas, Maestros (`sidebar-nav-items.ts`).
- Las tabs ahora son **sub-rutas** `/planificacion/<tab>`: `router/config.tsx`
  redirige `/planificacion` → `/planificacion/nueva` y sirve `/planificacion/:tab`.
  `use-tab-route.ts` (nuevo hook) deriva el tab de la URL y navega al cambiarlo —
  el tab vive en la ruta (una sola fuente de verdad), así el submenú del sidebar
  se marca y enlaza correcto. `page.tsx` usa `useTabRoute` en vez de `useState`.

### 2. Modo demo (datos de prueba perfectos)
- **Toggle "Demo ON/OFF"** arriba a la derecha (`PlanificacionHeader`, junto a
  País/Compañía). Cuando está ON, **todo el módulo** se alimenta de datos de
  prueba perfectos desde `demo-data.json` (no de EFLOW).
- Datos (6 viajes, 30 pedidos): **CR COFERSA** (3 viajes) y **VE FEBECA/SILLACA/
  BEVAL** (3 viajes), con **coordenadas reales**, pesos/volúmenes variados y
  **vehículos de capacidades distintas** — para que se aprecien mapa, secuencia y
  la sugerencia de reparto.
- `demo.ts`: selectores por país/compañía. Gating en `eflow-api` (fetchViajes,
  fetchPedidosDeViaje, fetchCompanias, fetchRutas/Vehiculos/Transportistas/
  Conductores) y en `pedidos-api.fetchPedidosDeRuta`. Flag `getDemo/setDemo` en
  `eflow-api` (no se persiste; arranca apagado). Los hooks (`useViajes`,
  `useCatalogos`, `useCompanias`) reciben `demo` como dependencia para recargar.

## Why

- Ana (reunión 2026-09-16): quería submenús como OMS y, sobre todo, un **modo
  demo** para la presentación al cliente, porque la data real no tiene
  direcciones, ni peso, ni volumen, ni capacidades distintas.

## How

Dataset demo autorizado por un subagente (fork). `tsc` limpio; `vitest run
src/pages/planificacion` → 78/78 (incluye `demo.test.ts`). Deploy a Amplify `dev`.

## Follow-ups

- La Matriz de Rutas en modo demo sigue leyendo `rutas-dias` real (no crítico).
- Backend multi-WMS para VE (Beval vive en `EFLOW_BEVAL`, hoy solo se consulta
  `EFLOW_FEBECA`) queda como follow-up de datos reales.
