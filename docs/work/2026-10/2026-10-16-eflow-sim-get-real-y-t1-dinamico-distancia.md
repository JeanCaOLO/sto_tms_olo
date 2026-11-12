# 2026-10-16 — Planificación: GET real de eFlow (CR) + T-n dinámico por distancia

## What changed
Dos piezas, sobre la rebanada eFlow-sim del mismo día (nº de viaje / T-1 / CARCA / EPA):

- **GET real de eFlow enchufado (read-only).** El backend del sim (`backend/eflow-sim/`)
  ahora puede servir los endpoints `expediciones-cabecera/-detalle` desde el EFLOW real
  de CR en vez del seed, con `EFLOW_SIM_MODE=live`. Nueva fuente `eflow_live.py` que mapea
  las columnas reales al shape del PDF de ePrac y acota la cola a pedidos ABIERTOS, SIN
  viaje, NO anulados y con entrega de hoy en adelante (`EFLOW_SIM_LIMIT`, 150 por defecto).
  El frontend NO cambia (mismo contrato). Verificado contra CR: 150 expediciones reales
  (Cofersa 0109 + EPA 0029), fechas 2026-10-16…23, ~86% con coordenadas.
- **T-n dinámico por distancia real.** `tiempo-cluster.ts` dejó de usar la tabla fija
  por zona: ahora calcula los días de viaje del cluster a partir de la distancia (haversine)
  de la parada MÁS LEJANA del viaje al depósito de origen (CR, San José), `1 + floor(km /
  KM_POR_DIA)`. GAM → T-1; rutas lejanas (La Fortuna ~85 km) → T-2; Guanacaste ~167 km → T-3.

## Why
Repaso del usuario: el planificador lee expediciones reales por GET (API sim mientras
ePrac entrega la formal) y arma los viajes. Y la regla T-1 del OMS (project.md DECIDED
2026-09-10) es "entrega − duración de ruta": esa duración tiene que salir de la geografía
real del cluster, no de un mapa a mano. Ambas cosas aterrizan el flujo con datos reales
sin escribir nada en eFlow ni en Aurora.

## How
- `backend/eflow-sim/src/eflow_live.py` (nuevo): SELECT read-only vía `tms_common.eflow_db`
  (pytds, `readonly=True`). Columnas reales → shape sim: `FECHAEXPEDICIONPLANIFICADA AS
  FECHAENTREGA`, `CLIENTES.NOMBRELARGO/DIRECCIONLARGA/LATITUD/LONGITUD`, detalle con
  `IDEXPEDICIONLINEA/UNIDADESPEDIDAS/PESOPEDIDO/CUBICAJEPEDIDO`. Detalle acotado con JOIN
  a las MISMAS N expediciones (un `EXISTS ... TOP` no acotaba → devolvía 136k filas).
- `backend/eflow-sim/src/app.py`: `_reader()` elige `eflow_live` (live) o `sim_source` (seed,
  default); import perezoso. POST (write-back del nº de viaje) sigue simulado en `sim_source`
  — NO toca eFlow real.
- `tiempo-cluster.ts`: `tiempoViajeDias(trip)`/`fechaAlistamiento(fecha, trip)` por coords
  reales, reutilizando `haversineKm`. `DetalleModal` pasa el viaje. KNOB: depósito CR +
  `KM_POR_DIA`.
- Verificado: tsc + eslint limpios; vitest planificación 70 ✓; ruff + pytest sim 15 ✓.

## Promoted knowledge
- CR EFLOW real es ALCANZABLE desde esta máquina (host 10.17.224.20:1433, EFLOW_OLO,
  read-only); 13.050 pedidos abiertos+sin viaje ahora. Credenciales SOLO en `.env.local.bak`
  (ya ignorado por git; NUNCA commitear). Ver memoria [[eflow-pull-gotchas]].
- Columnas reales ≠ PDF: no hay FECHAENTREGA (es FECHAEXPEDICIONPLANIFICADA), ni coords en
  cabecera (vienen de CLIENTES). EPA (0029) llega sin RUTA y sin coords.

## Follow-ups
- Multi-país: depósito y credenciales por país/almacén (hoy solo CR).
- EPA sin RUTA cae en una zona "null" en el mapper; definir agrupamiento para 0029.
- Duración logística como COLUMNA en el modelo (acordado con Eduardo, en su PR de tablas).
- Write-back persistido + CARCAM real seguían delegados a Kiro, que NO ejecutó: reasignar.
