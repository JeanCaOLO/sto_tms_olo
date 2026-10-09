# 006 — Geocodificación de direcciones (coordenadas de clientes)

- **Status:** Draft
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Author role:** DA/SYS (Jesús)
- **Branch:** (pendiente)
- **Depends on:** 001

## Context

El motor dibuja la ruta (OSRM) y optimiza la secuencia solo con **coordenadas**. En los datos reales de eflow, la dirección en texto está casi completa pero la **coordenada no**: en Costa Rica ~40% de los clientes activos de COFERSA, y en **Venezuela ~7%** sobre ~20.000 puntos (en el daily 2026-10-06 se marcó como bloqueante). Es el verdadero cuello de botella de la planificación a escala.

## Goal

- Un proceso que, a partir de `DIRECCIONLARGA` (texto), calcule **lat/long** y las **persista** (no recalcular en cada corrida).
- Degradar con gracia: un pedido sin coordenada queda fuera del dibujo de ruta (ya contemplado), no rompe el plan.
- Dejar claro que **mantener** la calidad de la dirección es responsabilidad del negocio/cliente; nosotros ofrecemos el proceso de homologación/geocodificación periódica, no el relleno manual continuo.

## Areas to investigate

- Proveedor: Nominatim + Bedrock (propuesto internamente) vs API de Google (lo que iban a probar Dylan/José). Costo/volumen para ~20k puntos VE.
- Dónde persistir: `addresses.latitude/longitude` ya existe (+ `geocoding_status`/`provider`/`geocoded_at`). Reusar ese esquema.
- Gestión del dato VE: Jean lo ve con Toño.

## Expected deliverable

- Proceso/batch de geocodificación que llena `addresses.latitude/longitude` + `geocoding_status`.
- Documento de homologación para el cliente (qué direcciones no se pudieron resolver).

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| | | | | | depende de decisión de proveedor y acceso a datos VE |

## Changes

- (vacío)
