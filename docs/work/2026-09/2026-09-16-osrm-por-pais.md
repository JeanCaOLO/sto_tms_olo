# 2026-09-16 — OSRM por país (self-hosted CR + VE)

## What changed

`osrm-config.ts` ahora elige la instancia de OSRM **según el país activo**:
- CR → `https://osrm.jesusaraujo.lat`
- VE → `https://osrm-ve.jesusaraujo.lat`

Override por env: `VITE_OSRM_URL_CR` / `VITE_OSRM_URL_VE`. Se exporta
`osrmBaseUrl()` (antes `OSRM_BASE_URL` constante); `distance-matrix.ts` y
`route-geometry.ts` lo llaman en cada request para reflejar el país.

## Why

Antes apuntaba al demo público `router.project-osrm.org` (sin SLA → "No se pudo
contactar OSRM", caía a línea recta). Ya hay OSRM self-hosted por país en Dokploy
(desplegado con estibador). CR y VE son grafos SEPARADOS — un punto de VE sobre el
grafo de CR hace snap a ~1.600 km, por eso se elige por país.

## How / evidencia

- CORS OK en ambas instancias (`Access-Control-Allow-Origin: *`), así que el
  navegador puede consumirlas desde Amplify.
- Rutas verificadas: CR San José 2 puntos → 2.113 m; VE Valencia→Maracay → 53 km.
- `tsc` limpio; `vitest` 74/74. Deploy a Amplify `dev`.

## Follow-ups

- Si en producción se quiere aislar por dominio propio, setear las env
  `VITE_OSRM_URL_*` en el build.
