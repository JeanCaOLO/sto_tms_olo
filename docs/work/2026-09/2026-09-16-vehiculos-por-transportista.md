# 2026-09-16 — Filtrar vehículos por transportista

## What changed

- **Nueva secuencia** (`RouteConfigForm`): el dropdown de **Vehículo** ahora se
  filtra por el **transportista** elegido (`vehiculosFiltrados`), igual que ya se
  hacía con los conductores. Al cambiar de transportista se limpia el vehículo
  seleccionado (`handleSetTransportistaId` en `page.tsx`).
- **Reparto de Flota** (`FlotaSlotPicker`): no hay selector de transportista, así
  que al elegir un **vehículo** se filtran los **conductores** a la flota de ese
  mismo transportista (`conductoresDisponibles`), y se limpia el conductor al
  cambiar de vehículo.
- De paso, las etiquetas usan `marcaModelo` (sin el "NISSAN UD NISSAN UD").

## Why

El vehículo **sí pertenece a un transportista** en EFLOW
(`trasportation_units.transportation_company_id`, 100% poblado: CR 29
transportistas, VE 24), pero la UI mostraba todos los vehículos sin filtrar, por
lo que parecían independientes. El dato ya estaba disponible
(`Vehiculo.carrier_id`).

## How

`tsc` limpio; `vitest` 74/74. Deploy a Amplify `dev`.
