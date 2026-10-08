# Registro — Ronda 2, Fase A (revertir «Forma de liquidar»)

Fecha: 2026-10-08. Pedido del usuario: dejar la liquidación «como antes».

- Borrados: `lib/tarifas/liquidationMethod.ts` y su prueba, `parts/MethodSelector.tsx` y su prueba, `hooks/useLiquidationMethod.ts`, y `sql/26_roles_liquidador_desarrollador.sql` (nunca se ejecutó; el usuario creó el rol Liquidador y los desarrolladores son SuperUsuario/SuperAdministrador, ya admins por código).
- Revertido en `calculate` (`index.ts`), `settlementInput.ts`, `tripSettlement.ts`, `types/settlement.ts` (`TripEdits.method`), `types/io.ts`, `types.ts`, `CalculationContent`, `LiquidarViajeBody`, `ProformaImprimible`, `useLiquidarViajeController`, `useEditsUsed`.
- Conservado (no era del selector): `VerMasSection`, `useEditsUsed`, PDF/proforma, `settlementToResult`, «Ver el desglose completo».
- Snapshots de `LiquidarViajeModal.snap` regenerados: la ÚNICA diferencia es la sección «Forma de liquidar» que desaparece.
- `grep` no deja ningún uso de `LiquidationMethod`, `MethodSelector`, `methodLabel` ni `liquidationMethod`.
- Los registros `12` y `13` de la ronda 1 quedan como histórico: describen cosas ya revertidas/retiradas.
