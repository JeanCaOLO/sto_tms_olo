# 2026-09-16 — Geocoding de direcciones con Nominatim

## What changed

Capa de coordenadas para los clientes que EFLOW no trae georreferenciados
(~2% CR / ~6% VE tienen lat/lng; el resto solo dirección de texto en
`DIRECCIONLARGA`).

- **`scripts/geocode-clientes.py`** (ops, read-only sobre EFLOW): toma clientes
  activos (en viajes recientes) sin coords, parsea la dirección estructurada
  (CR: `Prov/Cton/Dist`; VE: `Estado/Ciudad`), geocodifica en el Nominatim
  self-hosted (`nominatim.jesusaraujo.lat`) y guarda incremental en
  `src/pages/planificacion/geocode.json` (clave `<pais>:<IDCLIENTE>`).
- **`geocode.json`** generado: **900 entradas** (450 CR + 450 VE, 85 KB).
- **`geocode.ts`** expone `geocodeCliente(pais, customerId)`.
- **`eflow-api.fetchPedidosDeViaje`** rellena lat/lng desde la capa cuando EFLOW
  no las trae y marca el pedido `geo_approx` (nivel distrito/ciudad, no puerta).
- `tsconfig.app.json`: `resolveJsonModule` para importar el JSON.

## Why

Sin coordenadas, esas paradas quedaban fuera del optimizador ("N pedidos sin
coordenadas"). Con el geocoding entran al mapa a nivel de pueblo/ciudad.

## How / evidencia

Nominatim self-hosted (montado con estibador). Hit rate de la probe: **CR 16/20,
VE 20/20**; los MISS eran datos basura ("CR", solo el nombre). Precisión = `admin`
(centroide de distrito/ciudad) → aproximada, no puerta: varios clientes del mismo
pueblo comparten punto. `tsc` limpio; `vitest` 74/74. Deploy a Amplify `dev`.

## Follow-ups

- Ana (reunión 2026-09-16 tarde): evaluar un **LLM en Bedrock** (Claude/Haiku/
  DeepSeek) para normalizar el texto libre antes de geocodificar, junto a
  Nominatim.
- Fase 2: **pin manual** para corregir las de baja precisión.
- Re-correr el batch para ampliar cobertura (hoy cap 500/país).
