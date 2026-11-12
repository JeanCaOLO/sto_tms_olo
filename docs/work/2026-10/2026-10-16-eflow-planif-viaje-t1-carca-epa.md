# 2026-10-16 — Planificación eFlow-sim: nº de viaje, T-1 dinámico, alerta CARCA y EPA -0/-1

## What changed
El módulo de Planificación (capa eFlow-sim, sin tocar Aurora) ganó cuatro piezas de las reuniones del 2026-10-15 (Antonio + Jean/Eduardo):
- **Nº de viaje** por viaje (`numero_viaje`, secuencial desde 1001) que genera el mapper y se cachea en localStorage — es la **simulación del write-back** del `NUMEROVIAJEWMH` a eFlow.
- **T-1 dinámico** (`tiempo-cluster.ts`): tiempo logístico por zona → fecha de alistamiento = entrega − tiempo, para que el OMS lo consuma (antes era T-1 fijo).
- **Alerta CARCA**: `en_carca` por pedido (hoy derivado determinísticamente en el sim) con chip "Sin CARCA" en VistaTabla y una franja de aviso + nº de viaje + alistamiento en DetalleModal.
- **EPA (0029)**: expediciones partidas `-0` (falla, prioridad 1) / `-1` (regular, prioridad 2) en el seed, con `prioridad`/`compania` arrastrados al stop y mostrados en ParadaModal.

Se agregó `sql/11_wms_expediciones_detalle.sql` (DDL borrador: detalle + columnas de traza del viaje) y campos opcionales al modelo (`en_carca`, `prioridad`, `compania`, `numero_viaje`) que no afectan a los planes reales de Aurora.

El resto del flujo (CARCAM real, tabla sim en Aurora, write-back persistido, enriquecer la API sim, re-ejecución ~1x/hora) quedó **delegado a Kiro** vía worktree Orca `eflow-planif-carcam-writeback` (sobre `planificacion-2`, con subagentes crew).

## Why
El repaso del usuario y las actas confirmaron el flujo: el planificador lee expediciones por GET (API sim mientras ePrac entrega la formal), arma viajes por zona, los muestra en calendario/tabla, corre ~1x/hora, marca en alerta lo que no está en CARCAM, y "escribe" el nº de viaje a la cabecera (simulado). Estas piezas aterrizan ese flujo sin bloquearse en Aurora (en migración por Eduardo) ni en el eFlow real.

## How
- `planes-types.ts`: campos opcionales nuevos en PlanStop/PlanTrip.
- `tiempo-cluster.ts` (nuevo, puro): `tiempoViajeDias(zona)` + `fechaAlistamiento(entrega, zona)`.
- `eflow-sim-store.ts`: `numerarViajes` (post-pass) + `enCarca` (determinístico) + mapea PRIORIDAD/IDCOMPANIA al stop.
- `eflow-sim-seed.ts`: bloque EPA (`epaCab`, EPA_TIENDAS) y `lineas` parametrizado por compañía.
- `calendario.ts`: `hayPendientesCarca`. Vistas: VistaTabla (chip), DetalleModal (franja), ParadaModal (prioridad). i18n es/en.
- Verificado: tsc limpio, eslint limpio, vitest 1131 ✓ (+10 nuevos: nº viaje, CARCA, EPA split, T-1).

## Promoted knowledge
- Nada de esto es verdad vigente por sí mismo: vive en el código del módulo. Las decisiones de las reuniones (nº de viaje lo escribe el TMS, T-1 por cluster, CARCAM = alerta, EPA -0/-1) están en memoria de proyecto.

## Follow-ups (en el worktree de Kiro)
- CARCAM real (lectura read-only del eFlow VE) para aterrizar `en_carca`.
- Tabla sim en Aurora (`wms_expediciones_sim`) como destino del write-back + persistir el `UPDATE numero_viaje`.
- Enriquecer el seed del backend sim (hoy 4 filas) con la semana + EPA.
- Modelar la re-ejecución ~1x/hora (poll/refetch).
