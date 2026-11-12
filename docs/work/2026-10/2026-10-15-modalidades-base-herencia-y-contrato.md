# Modalidades de base, ajustes ligados y contrato del transportista

Fecha: 2026-10-15. Alcance: solo tarifador. Sin despliegue, sin push.

## Aplicado
- **F-01** (`baseOverride.ts`): con la tarifa fija del transportista el concepto cobrado es `fixed` (antes caía a `km`), así un recargo por km transversal ya no se descarta como `DUPLICA_BASE`. Test: base fija 1000 + recargo por km ⇒ 1090.
- **F-14**: borrado el alias `compareRulesForBase`; `baseOverride.ts` usa `compareRules`. Imports sin uso eliminados.
- **Contrato**: `carriers.contract_expiry` en el esquema/manifest; `carrierBaseForCarrier` devuelve el contrato; `calculateTrip` lo guarda en `TripCalculation.contract` y avisa si venció a la fecha del viaje (no bloquea). `ContractBaseBanner` reemplaza el bloque "Base del cálculo"; chip de forma de cobro y de contrato vencido en el lote; `baseChange.contractExpiry` en el snapshot.
- **Ajustes ligados** (`baseInheritance.ts`, `appliesToBase`, `MODALIDAD_DISTINTA`): transversal por defecto, flota propia = por km. Selector "Se cobra con la base…" en el modal de reglas y distintivo en el listado.
- **Forma de cobro declarada** (`baseMethod`): la declarada manda; sin declarar se deduce de la fórmula (`baseKindOf`). La UI la deduce al guardar. `baseMethodMismatch` solo avisa. `RuleSchema` rechaza `baseMethod` fuera de BASE, `appliesToBase` en BASE y Tendering.
- **BD**: `sql/38_tarifas_reglas_ligadas_a_base.sql` (idempotente, backfill de las BASE); `sql/04_tarifas.sql` y `schema_manifest.json` regenerados. Ejecutar la migración es decisión de quien administra la BD.
- **Docs**: `docs/tarifador/FASES_MOTOR.md`; `ROADMAP.md §3` marcado obsoleto.

## Decisiones / no hecho
- No hay selector manual de "Modalidad" en BASE ni precarga con `BASE_RULE_TEMPLATES`: la forma de cobro se deduce de la fórmula, así no puede contradecirla. `BASE_RULE_TEMPLATES` sigue sin uso.
- Validación dura (rechazar BASE sin `baseMethod` o con porcentaje) **no** se aplicó: primero avisa; endurecer cuando el backfill se verifique con las reglas reales (`classifyExpr` solo mira el primer argumento de MIN/MAX y el `then` de IF).
- Un ajuste `PERCENT` de otra regla que quede descartada por `MODALIDAD_DISTINTA` deja esa referencia sin base (`BASE_NO_DISPONIBLE`): conviene ligar ambas al mismo tipo.
- Tendering sigue visible y deshabilitado, sin cálculo. La forma de cobro se queda en `carriers`.
