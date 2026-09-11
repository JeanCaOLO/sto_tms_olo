# 2026-09-08 — EFLOW PROD: datos reales + selector de país en Planificación

Commit: `525c33d`.

## What changed

El backend `server/` del prototipo de Planificación pasó de QA a las **bases
productivas de EFLOW** (Costa Rica y Venezuela), verificadas directamente contra
los servidores reales. Se agregó un **selector de país (CR/VE)** en la UI que
recarga viajes y catálogos desde el servidor EFLOW correspondiente. Se documentó
el mapa real de fuentes y sus gotchas.

## Why

Las reuniones de fuentes de datos (Padrón/Calzadilla 09-07, Antonio 09-04)
dejaron abierta la pregunta de dónde salían viajes, pedidos, rutas, choferes y
capacidad. Con las credenciales de solo-lectura del proyecto OL26004 se exploró
directamente PROD y se confirmó/corrigió lo levantado. El proyecto necesita
además operar multipaís (CR y VE son servidores y esquemas distintos).

## How

- `server/db.mjs`: un pool por país; enruta por `?pais=cr|ve`, con host y BDs de
  `EFLOW_CR_*` / `EFLOW_VE_*` (`.env.local`). Compat con `EFLOW_QA_*` como CR.
- `server/queries.mjs`: queries como funciones de los nombres de BD (`wmh`,
  `sap`) para inyectar el esquema por país. Fuentes reales: `distribution_routes`,
  `drivers`, `transportation_companies`, `trasportation_units`, `journeys` +
  `journey_order_transportation`, y `EXPEDICIONESCABECERA` + `CLIENTES` para
  pedidos (ligados por `NUMEROVIAJEWMH`). Ruta desde `EXPEDICIONESCABECERA.RUTA`
  (nunca `journey_orders.route_id`, 100% NULL).
- `eflow-api.ts`: `getPais`/`setPais` + `?pais=` en cada llamada; fallback mock
  intacto. `components/PaisSelector.tsx` nuevo; `page.tsx`, `use-viajes`,
  `use-catalogos` toman `pais` como dependencia para recargar.
- Verificado en vivo: CR 38 rutas / 62 choferes, VE 50 rutas / 263 choferes;
  viajes y pedidos reales por país. `pnpm test` 70/70, `tsc` 0 en planificacion,
  `pnpm build` OK.

## Promoted knowledge

- `docs/guides/eflow-fuentes-reales.md` (nuevo): servidores y BDs por país,
  tablas por entidad, y los gotchas confirmados (route_id NULL; dos llaves de
  chofer `driver_code` WMS vs `driver_id` WMH; coordenadas ~2%; capacidad 0;
  `TPEXPE`/compañías; `FECHAPLANIFICADADESPACHO` sin usar). Reemplaza la
  referencia de QA para este flujo.
- `.env.example`: documenta `EFLOW_CR_*` / `EFLOW_VE_*`.
- Detalle completo de la exploración también en Notion (INTELIX / TMS OLO):
  "Fuentes de datos reales (PROD) — exploración directa EFLOW/WMH 2026-09-08".

## Follow-ups

- [ ] VE: `EFLOW_FEBECA` no trae peso/volumen por pedido (0) — decidir cómo
  degradar el bin-packing por país/compañía, y si se usan las 3 BDs de compañía
  (Beval/Febeca/Sillaca) o una sola.
- [ ] Coordenadas al ~2%: pendiente que OLO pueble `CLIENTES.LATITUD/LONGITUD`
  (Andrey) o geocodificar direcciones antes de que la optimización escale.
- [ ] Réplica de CR (`Iflow OLO`/`Iflowce`) aún no existe (Padrón→Alfredo); hoy
  se lee del transaccional directo con las creds de solo-lectura.
- [ ] Mover las credenciales a Secret Manager al desplegar (hoy en `.env.local`).
