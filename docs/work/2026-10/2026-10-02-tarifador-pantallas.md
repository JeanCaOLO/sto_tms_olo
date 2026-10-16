# Tarifador: pantallas del liquidador sobre el ORM nuevo (2026-10-02)

Pedido del usuario: hacer por única vez el trabajo asignado a Kiro en `.agents/CANAL.md` (mensaje "Liquidador: viajes completados de guía de despacho vía ORM").

## Cambios
- `src/pages/liquidaciones/`: `page.tsx` con pestañas "Viajes por liquidar" e "Historial" (DataTable); `LiquidarViajeModal.tsx` nuevo (reemplaza `LiquidacionModal`, borrado); `AdhocRuleModal` sin `packageCount`; sin `registrarEvento` (la bitácora la escribe `settlementsDataSource`).
- `src/pages/companias/`: lista solo lectura desde `listCarrierProfiles`; `VariablesModal`, `CostStructureModal`, `RateTablesModal` reciben `CarrierProfile` y usan `ensurePartyProfile`; borrados `CompaniaModal`, `RoutesModal`, `VehicleTypesModal`.
- `src/pages/reglas-tarifa/`: zonas solo lectura + `ZoneGroupModal`; `CountrySettingsCard`; selectores por `partyId`; `listTruckTypes`; Probador "desde un viaje"; `ZoneModal` borrado.
- `src/components/tarifas/DriverCarrierPicker.tsx` borrado.

## Verificación
tsc 0 errores; vitest 666/666; eslint 0 errores (warnings preexistentes de exhaustive-deps); `vite build` OK. No probado en navegador.
