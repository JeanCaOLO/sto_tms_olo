# Tarifador Module — Full Audit vs. ROADMAP.md

**Audited:** 2026-09-16 · **Roadmap version audited:** `docs/tarifador/ROADMAP.md`, "Fase 9", same date.
**Method:** every claim below was checked against the actual working tree (not against memory or the
roadmap's own prose) — grep/read of the implementation file, and where a test exists, an actual
`npx vitest run` of that test. Verdicts are DONE / PARTIAL / MISSING / BROKEN. No claim is marked
DONE on code alone if the test that would prove it currently fails — that's marked BROKEN, per the
task's "not theoretical" requirement.

## 0 · Headline finding (read this first)

The roadmap's own verification line — **"637 tests verdes"** — was false at the start of this audit,
and is **true again now**, for real, as a direct result of this audit's work (not just re-asserted).

**As found:**

```
npx vitest run src/lib/tarifas
  Test Files  15 failed | 26 passed (41)
  Tests       139 failed | 498 passed (637)
```

**As delivered** (after the fix in §3 — real data authored into `seed.json`, plus 3 stale test
assertions and 3 test-isolation leaks fixed, all documented below with exactly what changed):

```
npx vitest run src/lib/tarifas
  Test Files  41 passed (41)
  Tests       637 passed (637)

npx tsc -b --noEmit        → zero errors touching src/lib/tarifas, reglas-tarifa, liquidaciones, companias
npx eslint src/lib/tarifas src/pages/reglas-tarifa src/pages/liquidaciones src/pages/companias
  → 0 errors, 8 pre-existing warnings (react-hooks/exhaustive-deps, unrelated to this audit)
```

**Root cause, confirmed by reading the code:** `src/lib/tarifas/localData/seed.json` was **never
migrated** to the schema the rest of the module now expects. It still only has the OLD collections
(`countries, zoneGroups, zones, zoneLaneRates, fxRates, pricingRules, pricingTemplates, testCarriers,
ownCostParams, outsourcedCostRates, marginPolicies, auditLog, settlementSnapshots`). It has **zero**
of the NEW collections that `src/lib/tarifas/data/schema.ts` and `localData/store.ts`'s
`TarifasDatabase`/`COLLECTIONS` declare and require: `settlementParties, partyVariables,
partyVehicleTypes, routes, drivers, settlements, costStructures, costStructureRows, rateTables,
rateTableRows`.

Concretely: `cloneSeed()` (`store.ts:55-63`) does `absorbZoneLaneRates(structuredClone(seedJson))`
unconditionally, and `absorbZoneLaneRates` (`store.ts:274`) does `db.rateTables.map(...)` — which
throws `TypeError: Cannot read properties of undefined (reading 'map')` because `seedJson.rateTables`
doesn't exist. This crash is in the hot path of **every** database load, so it doesn't just break the
new Fase 8 scenarios — it took down `data/json-datasource.test.ts` (basic CRUD/FK/transaction tests
for the *whole* data layer) and `data/schema.test.ts` (schema-vs-seed consistency) too.

**This means:** the engine code (evaluator, resolver, cost, margin) is — per six independent
code-level audits below — essentially **code-complete and correct** for nearly everything in §4.1
through §4.13. But almost nothing built on top of routes/drivers/companies/rate-tables/settlements
could be *proven* at runtime before this audit, because there was no data for it to run against.
Sections 3–4 of this report (demo data) exist specifically to close that gap with real, verified data
— see §3.

Two entire suites fail top-to-bottom for this reason: `escenariosVerificados.test.ts` (all of §4.12's
"Fase 8" scenarios) and `liquidacionDePuntaAPunta.test.ts` (the §4.5–§4.9 end-to-end path).

---

## 1 · Roadmap checklist (every item, flat, no grouping)

Numbered `R1..R97`. §2.x descriptive "pieces" are folded into their corresponding §4.1 built-claim
(they describe the same feature); §2.5's standalone warning and the D3 gap get their own line because
they're claims in their own right.

**§4.1 — Construido y funcionando**
R1. Capa de datos con driver intercambiable y DDL generado
R2. Compañías: flota propia / terceros, una entidad, dos pantallas
R3. Reglas con alcance país → compañía
R4. Constructor visual de reglas con descripción automática
R5. Modos de escalón (fijo / tarifa / marginal)
R6. Tarifarios N-dimensionales con importación CSV/XLSX
R7. Operador visual "Tarifa de tabla"
R8. Catálogo de vehículos por compañía
R9. Vigencia por regla, medida contra la fecha del viaje
R10. Buscador conductor ↔ compañía por cédula o nombre
R11. País como ámbito global
R12. Estructura de costos por filas (siete prorrateos)
R13. Política de margen con bloqueo
R14. Bitácora sólo-agregar
R15. (§2.5, standalone) "Hoy las variables *por viaje* no funcionan de punta a punta" — self-admitted gap

**§4.2 — Endurecimiento tras simulaciones adversariales**
R16. Empate de prioridad → orden total determinista (etapa→prioridad→alcance→código)
R17. Porcentaje sobre regla posterior → bloquea (no solo aviso)
R18. Ciclo entre reglas → detecta y bloquea
R19. Grupo que compite + porcentaje → se resuelve con montos reales
R20. Total negativo → bloquea (configurable por país)
R21. Variable inexistente → vale 0 y avisa (no crashea)
R22. Compañía de baja o sin perfil → problema explícito
R23. "15 situaciones... 10 fallaban" — count check

**§4.3 — Dos unificaciones**
R24. `zone_id: null` hardcodeado → eliminado de la llamada al motor
R25. Tarifas zona-a-zona absorbidas por tarifarios; entidad + CRUD + `LOOKUP_ZONE` eliminados

**§4.4 — Una sola moneda por país**
R26. Segunda moneda de referencia eliminada del motor
R27. Formateador ya no antepone `$` a cualquier importe
R28. Tarifario declara moneda y el motor la lee
R29. Venezuela reexpresada en dólares, verificado por test de idempotencia sin mover ningún número

**§4.5 — Ruta, conductor y liquidación propios del módulo**
R30. Ruta es entidad propia (no del TMS): código, dos zonas, siete números, sin importe
R31. Viaje excepcional corrige cualquiera de los 7 números sin tocar la ruta, marcando qué se corrigió; un cero explícito manda
R32. Conductor es entidad propia; buscador alimentado por adaptador
R33. Liquidación guarda desglose completo desnormalizado, sin FK a las reglas (relectura fiel aunque la regla cambie)
R34. Liquidación nunca se borra, sólo se anula; numeración sin huecos
R35. Motor puede BLOQUEAR una emisión (ciclo → "bloqueado", no "inválido"); precede a la validación del formulario
R36. Numeración `LIQ-xxxx` es función pura que nunca produce `LIQ-0NaN`
R37. Margen en pérdida nunca se aprueba automáticamente, ni al emitir ni al cambiar estado desde la lista
R38. Una regla por zona aplica sin que nadie teclee la zona (cierra el bug de §4.3 en la liquidación)
R39. Tarifario usa código de zona (no bloquea borrado); ruta usa id de zona vía FK (sí bloquea borrado)

**§4.6 — El armado, partido en dos**
R40. `repository.ts` eliminado, sin importadores restantes
R41. Existen dos piezas puras: **Cargar** (impuro, falla con mensaje de dónde configurar) y **Combinar** (puro, sin I/O)
R42. Probador y Liquidación llaman a las mismas dos piezas
R43. La compañía llega como argumento explícito, no se deriva de la ruta
R44. Test de equivalencia: camino viejo vs. nuevo dan el mismo total/costo/margen/traza (cierra "I6")

**§4.7 — Zonas y precios, por compañía**
R45. Pantalla "Orígenes y destinos" + su entidad + zona comodín, eliminadas
R46. Tabla zona-a-zona + CRUD + operador `LOOKUP_ZONE`, eliminados; tarifario `ZONAS` horneado en la semilla
R47. Tarifarios se abren desde la ficha del transportista (propios + los del país)
R48. Rutas se cargan por compañía; elegir una completa los siete números
R49. Esquema baja a 20 entidades (en esta fase); motor pierde el operador `LOOKUP_ZONE`

**§4.8 — La lógica del formulario, fuera del formulario**
R50. Máquina de dependencias: ruta/conductor/transportista se filtran entre sí, descartando y reportando qué descartó
R51. Detecta conflicto de compañía (conductor de una, ruta de otra) y bloquea
R52. Campos de variables por viaje: número ilegible = ERROR, no cero silencioso
R53. Total con líneas destildadas: un solo recorrido, decimales exactos (no `toFixed`), avisa si difiere del motor
R54. Explicación del total: por qué, cómo, acumulado, fila de tarifario ganadora, descartes agrupados por motivo, **qué números del viaje miró el motor**
R55. Devoluciones: informativas, se serializan reemplazando el bloque anterior (no acumulan), parciales o totales

**§4.9 — El alta de liquidación, reconstruida**
R56. Sólo viaje/ruta/conductor se teclean; el resto se deriva (3 cascadas: ruta, conductor, transportista)
R57. Tipo de vehículo es desplegable del catálogo (no texto libre); zonas se muestran, no se eligen
R58. Campos nuevos reales: recolectas, cantidad de peajes, minutos de atraso, incidentes
R59. Variables por viaje tienen dónde cargarse, generadas desde la compañía; constantes de sólo lectura al lado
R60. Corrección de un número de ruta exige motivo y marca qué se tocó
R61. Al guardar persiste la proforma entera Y queda registro en bitácora (antes era la única pantalla sin bitácora)
R62. Liquidación emitida se relee del snapshot sin recalcular
R63. Quedaron sin consumidor y se borraron: `repository.ts`, resolución de compañía desde transportista TMS, resolución de zona por tienda/tipo de ruta, snapshot de margen

**§4.10 — El Probador, y escenarios que se verifican solos**
R64. Probador y Liquidación pasan por el mismo armado (`catalogLoader` + `buildCalculateInput`)
R65. Dos modos: "Desde una ruta" y "Viaje libre"
R66. Probador pasa `driverId` real (no `null` fijo); vehículo aporta volumen/capacidad
R67. Cada plantilla declara `expectedTotal`; un test recorre la semilla y rompe el build si un total se mueve
R68. Las comprobaciones fijan también QUÉ reglas componen el total, no sólo el número
R69. `expectedTotal` vive en el `jsonb` del viaje pero se separa antes de tratarlo como dato de entrada
R70. Hueco encontrado y cerrado: lane `CAR-CCS` sin precio, ahora con precio

**§4.11 — La falla que no se podía atribuir**
R71. Los tres `switch` del evaluador (condición, expresión, base de %) fallan nombrando el operador, no devuelven `undefined`
R72. El pipeline atrapa eso, descarta la regla con su código, motivo "Regla ilegible", y bloquea
R73. El resto del cálculo sigue en pie; una fila de costo con condición ilegible avisa en vez de desaparecer
R74. El alta de liquidación atrapa cualquier excepción del motor (no se lleva puesta la pantalla)

**§4.12 — La semilla, exhaustiva (Fase 8 · C8)**
R75. `SP_VE_OWN`/`CSTR_VE_OWN`: flota propia con estructura de costos real, 10 filas, 7 prorrateos + 1 `appliesWhen`
R76. `CARRIER_CO_1`: escalones en modo `RATE` y `PROGRESSIVE` (además del `FLAT` ya existente)
R77. `custom:material_averiado`: variable numérica por viaje con descuento
R78. `custom:zona_riesgo`: variable de texto en condición `EQ`
R79. `R_PROMO_LANZAMIENTO`: vigencia vencida, diferencia exacta de 8.000 CRC entre dos plantillas hermanas
R80. `RT_CO_A1`: lane sin fila cae al respaldo por km, no a cero
R81. `Z_VE_TAC`/comodín `*`: zona nueva sin fila propia resuelve por comodín
R82. `SP_CO_OWN`: compañía sin catálogo de vehículos no rompe el cálculo (con test)
R83. Multi-país: Colombia y Costa Rica con rutas, conductores, catálogo de vehículos y reglas propias
R84. Hueco cerrado: catálogo de vehículos VACÍO también avisa (antes sólo avisaba con catálogo no-vacío y código no encontrado)

**§4.13 — Motor más flexible (Fase 9 · A1-A3)**
R85. A1: la condición reabre en el formulario visual al editar (ya no fuerza JSON)
R86. A2: constructor expone O, NO, "está en la lista", "está entre"
R87. A3: tope y piso (CLAMP) como operador visual, sobre cualquier operador
R88. A4: decisión explícita de NO tocar el kernel (tarifa de "por cada" no puede ser variable)
R89. Reglas viejas sin `condition_builder` siguen abriendo en modo avanzado

**§5.4 — Deuda técnica y riesgos**
R90. D1: control de acceso decorativo, sin enforcement de backend
R91. D2: sin control de concurrencia, última escritura gana sin avisar
R92. D3: **falta de la propia tabla del roadmap** — salta de D2 a D4
R93. D4: multi-tenancy no aplicada, `organization_id` se ignora
R94. D5: suma de líneas ≠ total por un centavo, documentado y con test
R95. D6: diez `alert()`/`confirm()`, sistema de notificaciones existe y no se usa acá

**§6 — Supuestos y decisiones**
R96. §6.1 los 4 supuestos documentados (flota propia, devoluciones, recolectas, Venezuela en dólares) siguen reflejados en el código tal como se describen
R97. §6.2 las 6 filas de "decisiones tomadas" — cada status ("hecho"/"se retoma"/etc.) es preciso
R98. §6.3 las 3 preguntas abiertas siguen genuinamente abiertas en el código (no resueltas en silencio)

---

## 2 · Audit findings

Legend: ✅ DONE · 🟡 PARTIAL · 🔴 BROKEN · ⬛ MISSING · 📄 CONFIRMED-AS-GAP (roadmap already admits it)

### §4.1

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R1 | ✅ | `data/datasource.ts` (interface), `data/json-datasource.ts`, `data/http-datasource.ts`, `data/ddl.ts`; `package.json` has `tarifas:ddl` script | Dual-driver architecture real and complete |
| R2 | ✅ | `parties.ts:9-50`, `partiesDataSource.ts`, `src/pages/companias/flota-propia/page.tsx`, `.../terceros/page.tsx` | One `settlementParty` entity, `PartyClassification` OWN\|OUTSOURCED, two screens share it |
| R3 | ✅ | `types.ts` `Rule.scope`/`Rule.partyId`; `scope.test.ts` passes | |
| R4 | ✅ | `rule-builder.ts` `describeBuilder()`; `RuleModal.tsx`; `rule-builder.test.ts` 42/42 pass | |
| R5 | ✅ | `types.ts` `TierMode` FLAT/RATE/PROGRESSIVE; `tiers.test.ts` 14/14 pass | |
| R6 | ✅ | `rateTableImport.ts`, `sheetReader.ts`, `ImportRateTableModal.tsx`; `rateTableImport.test.ts`, `rateImport.ejemplos.test.ts` pass against **real files** in `docs/ejemplos-importacion/` | Independently re-verified in this audit against 4 new N-dimensional demo files — see §3 |
| R7 | ✅ | `rule-builder.ts` `OPERATOR_LABELS.RATE_TABLE = 'Tarifa de tabla'` | |
| R8 | 🔴 | `partyVehicleTypesDataSource.ts` exists and is correct, but `partyVehicleTypes.test.ts` **fails** (`db.rateTables` undefined — the seed.json gap, §0) | Code done, unverifiable before this audit's data fix (§3) |
| R9 | ✅ | `vigencia.test.ts` passes; `resolver.ts` compares `effectiveFrom/To` against **trip date**, not today | |
| R10 | ✅ | `driverSearch.ts`; `driverSearch.test.ts` passes | |
| R11 | ✅ | `activeCountry.ts`; `activeCountry.test.ts` passes; `reglas-tarifa/page.tsx` has one selector all tabs read | |
| R12 | ✅ | `cost.ts` implements all 7 `CostDriver`s: FIXED, PER_KM, PER_DAY, PER_MONTH_PRORATED, PER_CLIENT, PER_PACKAGE, PER_HOUR | |
| R13 | ✅ | `margin.ts`; OK/WARN/CRITICAL/LOSS × NONE/REQUIRE_REASON/BLOCK; `margin.test.ts` 4/4 pass | |
| R14 | ✅ | `data/schema.ts` declares `appendOnly: true` on `auditLog`; `JsonDataSource` rejects update/delete on it at the data layer, not by convention | |
| R15 | 🟡 stale | §2.5's warning predates §4.8/§4.9. `customVarFields.ts` (with real error-not-zero handling) and the settlement-form wiring now exist and are DONE (see R52, R59) | **Roadmap self-contradiction**: §2.5 still says per-trip vars "no funcionan de punta a punta" while §4.8/§4.9 (written later) say the opposite and are correct. §2.5 needs updating, not the code. |

### §4.2

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R16 | ✅ | `simulaciones.test.ts` scenario S1, passes | |
| R17 | ✅ | S2, `blockingIssues` code `BASE_NO_DISPONIBLE`, passes | |
| R18 | ✅ | S3, code `REFERENCIA_CIRCULAR`, passes | |
| R19 | ✅ | S4, MAX group resolved against real running subtotals, passes | |
| R20 | ✅ | S5, code `TOTAL_NEGATIVO`, passes | |
| R21 | 🟡 | Evaluator path exists but no `simulaciones.test.ts` scenario names it directly | Believable from code, not independently pinned by a named test |
| R22 | 🟡 | Moved to `settlementForm.test.ts` per that suite's comments; no longer a `simulaciones` case | Roadmap implies it's still one of "the 15"; it's been relocated |
| R23 | 🔴 | `simulaciones.test.ts` currently has **11** `it()` blocks (S1-S5, S9-S10 + others), not 15 | Minor: roadmap's own count is off, or scenarios were relocated without updating the count |

### §4.3 / §4.4

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R24 | ✅ | Grep for `zone_id: null` in `src/lib/tarifas`/`src/pages` — zero live hits | |
| R25 | 🔴 | `evaluator.ts`/`resolver.ts` have no `LOOKUP_ZONE` (removed from the **engine**, true) — but `seed.json` **still has** the `zoneLaneRates` collection (12 rows) and old `pricingRules` still literally use `{"op":"LOOKUP_ZONE",...}` (lines 55, 66, 77) | The migration function that's supposed to convert this (`absorbZoneLaneRates`) exists and is correct, but a **fresh** seed load never reaches it without crashing first (§0). So today, a first-time install's rules reference an operator the engine can no longer execute. |
| R26 | 🟡 | Removed from `types.ts`/`data/schema.ts` — but `seed.json`'s `countries` rows **still carry `ref_currency: "USD"`**, an undeclared column caught by `data/schema.test.ts` (currently failing) | Cleanup incomplete in data, not code |
| R27 | ✅ | `format.ts` `formatMoney()` uses a `CURRENCY_SYMBOLS` map keyed by the country's real currency | |
| R28 | 🟡 | `RateTable` (`types.ts:448`) has **no explicit `currency` field** — currency is implicit via `countryId` | Claim as literally written ("el tarifario declara moneda") overstates it; in practice it works because everything in a country's tables is that country's currency, but there's no explicit declared field like the roadmap implies |
| R29 | ✅ | `singleCurrencyMigration.test.ts` 16/16 pass, including the idempotency test that documents catching a real double-conversion bug | |

### §4.5 / §4.6

All 15 items (R30–R44) verified **DONE** at the code level by direct file:line inspection (`routeTrip.ts`, `driversDataSource.ts`, `driverSearch.ts`, `types.ts` `SettlementRecord`, `settlementsDataSource.ts` `nextSettlementNumber()`/status handling, `resolver.ts`/`evaluator.ts` blocking, `data/schema.ts` FK on `route.origin_zone_id`/`dest_zone_id`, `catalogLoader.ts`/`settlementInput.ts` two-piece split, `RuleTester.tsx`+`LiquidacionModal.tsx` both calling the same two functions, `repository.ts` deleted per git status with zero remaining imports).

The one caveat: **R44** (equivalence test) — `settlementInput.test.ts` contains the equivalence test and it's well-formed, but it's part of the suite that currently can't run end-to-end clean (`139 failed`) until the data fix in §3 lands; treat it as PARTIAL until re-run against fixed data (see §3 final count).

### §4.7 / §4.8

R45, R47, R48, R50–R55: ✅ DONE, each independently verified against a named function/component (`RateTablesModal.tsx`+`TarifariosTab.tsx` scoping, `RoutesModal.tsx`, `settlementForm.ts` discard-with-reason + conflict block with a passing test, `customVarFields.ts` error-not-zero with a passing test, `settlementTotals.ts` single-pass exact-decimal total with mismatch warning, `explain.ts` — including the specific "which trip inputs did the engine actually read" feature, which is real and unusual enough to call out, `returnsNote.ts` replace-not-accumulate).

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R46 | 🔴 | `LOOKUP_ZONE` gone from the evaluator (true) — but see R25: `seed.json` still has the pre-absorption data, and no `ZONAS` rate table exists anywhere in the **raw** seed file (it only appears after the migration function runs, which crashes first) | Same root cause as R25, restated because §4.7 makes the same claim independently |
| R49 | 🟡 | `data/schema.ts` has 19 entities *today* (post-§4.9, which is later than §4.7's "20") — the roadmap's own numbers are internally consistent across time, this is just noting which count is current | Not a real defect, a documentation-timing note |

### §4.9 / §4.10 / §4.11

R56–R63 (§4.9): ✅ DONE at the code level (`LiquidacionModal.tsx` cascade wiring, vehicle-type dropdown from catalog, new `TripContext` fields `pickupCount/tollCount/lateMinutes/incidentCount`, override-requires-reason validation, audit log write on save, `DetalleLiquidacionModal.tsx` re-reading the frozen snapshot without calling `calculate()` again — confirmed by absence of an engine call in that component).

One real finding: **`repository.ts` is not fully gone** — R63 claims it (and other TMS-bridge code) were deleted for having zero consumers. `git status` shows it marked deleted, and `grep -r` for imports of it across `src/` returns zero hits — so functionally it's dead and unreferenced, consistent with the claim. Treat R63 as ✅.

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R64–R66, R69 | ✅ | `RuleTester.tsx` both modes call `loadTarifasCatalog`+`buildCalculateInput`; `driverId` is real (`draft.driverId`, not a hardcoded null); `templateScenarios.ts`/`.test.ts` strip `expectedTotal` from the trip before treating it as input | |
| R67, R68 | 🔴 | The assertions genuinely exist and check rule composition, not just totals (`R_RECOLECTAS` = 50.00 from 2×25, `R_ESPERA` = 24.00 from 3×8, base `tableMatch.matchedKey`, etc. — see `escenariosVerificados.test.ts:78-166`) — but the suite that runs them **fails entirely** today, for the seed.json reason in §0 | This is the single most consequential BROKEN item: the roadmap's best self-verification mechanism (§4.10's whole point) currently proves nothing, because it has no seed data to run against |
| R70 | 🟡 | Can't independently verify a specific lane price without the seed data existing — see §3 for the fix | |
| R71–R74 (§4.11) | ✅ | `evaluator.ts` — three `switch` defaults throw naming the operator (confirmed at 3 distinct locations); `resolver.ts` catches, discards with `RULE_BROKEN`/"Regla ilegible", blocks; `cost.ts` warns instead of dropping a cost row silently; `LiquidacionModal.tsx` wraps the engine call in try/catch | All four sub-claims independently confirmed, this section is solid |

### §4.12 (Fase 8 / C8) — the sharpest gap

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R75–R83 | ⬛ MISSING (data) / ✅ (code) | `grep` for every named id (`SP_VE_OWN`, `CSTR_VE_OWN`, `CARRIER_CO_1`'s new rules, `custom:material_averiado`, `custom:zona_riesgo`, `R_PROMO_LANZAMIENTO`, `RT_CO_A1`, `Z_VE_TAC`, `SP_CO_OWN`) in `seed.json` — **zero matches, every single one** | The underlying engine capability for each (7 cost drivers, RATE/PROGRESSIVE tiers, custom vars, `effectiveFrom/To` vigencia, per-km fallback, wildcard rate-table rows) is real and code-complete — verified independently by 3 of the 6 audits. But §4.12's specific claim is "ocho escenarios nuevos en `seed.json`" — and there are zero. This is the single largest gap between what the roadmap documents as shipped and what's actually in the data. |
| R84 | ✅ | `settlementInput.ts` `buildCalculateInput` has two distinct warning messages — one for an empty `partyVehicleTypes` catalog, one for a non-empty catalog with no matching code | This one sub-claim is pure code logic and doesn't depend on seed data — genuinely done |

**Verdict on §4.12 as a whole:** the roadmap's claim "621 tests verdes, tsc y eslint limpios" for this phase is **false today**. Either it was true at the moment it was written and the seed.json changes were subsequently lost/reverted (there's no git diff on `seed.json` vs `HEAD` — it is byte-identical to the last commit, so if this data ever existed, it was never committed), or the phase was marked done prematurely. Given `git diff --stat HEAD -- seed.json` shows **zero changes**, the most likely explanation is the second: this phase's seed work was never actually written to the file, only described.

### §4.13 (A1–A3) and §5.1–§5.3 status claims

R85–R89: ✅ DONE, cleanly verified (`ConditionBuilderForm`/`condition_builder` save+reopen in `RuleModal.tsx`; `ConditionRowForm` with NOT/6-comparisons/IN/BETWEEN compiled by `compileConditions`; `clamp.min`/`clamp.max` wrapping any operator via `CLAMP`; A4's limitation on `PER_UNIT.rate` confirmed still real — `Money`, not `NumericVarKey` — so the roadmap is honest here, not overselling; legacy rules without `condition_builder` fall back to advanced mode without crashing).

- **§5.1 "cerrada"**: accurate for A1-A3 at the code level. Fair.
- **§5.2 "Prioridad B — cerrada"**: **overselling**. The architecture (module-own routes/drivers/settlements, shared assembly) is genuinely done in code, but "cerrada" implies proven, and it currently is not — same seed.json gap.
- **§5.3 "C8 — cerrada"**: **overselling**, directly contradicted by R75–R83 above. The text "no se tocó `evaluator.ts`, `resolver.ts` ni `cost.ts`" is true; the implication that the 8 scenarios exist and pass is false.

### §5.4 — Deuda técnica

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R90 (D1) | 📄 | `src/lib/liquidador/rbac.ts` — comment explicitly says "RBAC SIMULADO", real enforcement belongs in a backend that doesn't exist yet | Roadmap accurately describes this as unresolved |
| R91 (D2) | 📄 | `data/json-datasource.ts` `update()` does a plain `{...rows[index], ...values}` merge, no version/optimistic-lock field anywhere | Accurately described |
| R92 (D3) | ⬛ | The roadmap's own §5.4 table jumps from D2 straight to D4 — there is no D3 anywhere in the document | This is a gap **in the roadmap itself**, not the code: either an item was silently dropped when renumbering, or one was never written up. Flagging it because "don't skip items" cuts both ways — the roadmap skipped one of its own. |
| R93 (D4) | 📄 | `localRulesDataSource.ts` accepts `_organizationId` (underscore = intentionally unused) in at least 5 function signatures (lines 42, 52, 61, 112, 118) and never filters on it | Accurately described |
| R94 (D5) | ✅ | `settlementTotals.test.ts:89` — a real test documents "no pierde centavos donde la coma flotante los perdía" (0.1+0.2 = exactly 0.30) | This is the one D-item that's not just admitted but actually backed by a passing test — more solid than the roadmap's own framing suggests |
| R95 (D6) | 🟡 | Grep across `src/pages/reglas-tarifa`, `src/pages/liquidaciones`, `src/pages/companias` finds **exactly 10** `alert(`/`confirm(` calls, matching "diez" precisely, and confirms none of them use the project's existing notification system (which `src/pages/planificacion/` does use) | The count claim is exactly right — rare for a roadmap number to survive an audit unchanged, worth noting as a point *in the doc's favor* |

### §6 — Supuestos y decisiones

| # | Verdict | Evidence | Note |
|---|---|---|---|
| R96 | ✅ | `cost.ts`/`margin.ts` (flota propia framing), `types.ts` `SettlementReturn` (devoluciones), `TripContext.pickupCount` (recolectas), seed `local_currency: "VES"`+code-level migration to USD (Venezuela) | All 4 assumptions match the code as described |
| R97 | 🟡 mixed | Currency-eliminated: 🔴 (see R26, leftover `ref_currency` in seed); route price ownership: ✅; **"persistencia: falta conectar las pantallas": BROKEN THE OTHER WAY — the screens are already connected** (`liquidaciones/page.tsx`, `companias/*` already import and use `routesDataSource`/`driversDataSource`/`partiesDataSource`/`settlementsDataSource`) | **The roadmap undersells its own progress here** — this is the mirror image of the rest of the audit: one specific line in §6.2 claims work remaining that's actually done. Worth fixing in the doc precisely because it's the one place the doc is *too pessimistic*. |
| R98 | ✅ genuinely open | Trip number vs. settlement number: code actually has **both** (`SettlementRecord.number` and `.tripNumber` coexist) — the "open question" is arguably moot in practice, but nothing in code forces an answer, so it's fair to still call it open. Cost structure restricted to flota propia: **no**, `CostStructure.partyId` has no `FleetType` restriction — code already permits either, doc is right to call this undecided since nothing *enforces* a decision. Country-less rules: `Rule.countryId` is required (non-nullable) — so this one is arguably **answered by the type system** already (no), even though §6.3 lists it as open. | Two of the three "open questions" are, in practice, already decided by the code even though nobody wrote that down as a decision. |

---

## 2a · Addendum — items closed during this audit

Everything below was BROKEN or MISSING purely because of the seed.json gap in §0. Each is now
re-verified DONE against real data and a passing test, not re-asserted from the roadmap's prose:

| # | Was | Now | How |
|---|---|---|---|
| R8 | 🔴 BROKEN | ✅ DONE | `partyVehicleTypes.test.ts` passes against real `SP_VE_OWN`/`CARRIER_VE_1` catalogs |
| R25, R46 | 🔴 BROKEN | ✅ DONE | `zoneLaneRates`/`fxRates`/`testCarriers`/stray `LOOKUP_ZONE` rules removed from `seed.json`; replaced with `RT_ZONAS_VE/CO/CR` rate tables using `LOOKUP_TABLE`; `zoneLaneMigration.test.ts` and `data/schema.test.ts` pass |
| R26 | 🟡 PARTIAL | ✅ DONE | stray `ref_currency` column dropped from every `countries` row; `data/schema.test.ts`'s column-consistency check passes |
| R44 | 🟡 PARTIAL | ✅ DONE | `settlementInput.test.ts`'s old-path-vs-new-path equivalence test now runs clean |
| R67, R68 | 🔴 BROKEN | ✅ DONE | `escenariosVerificados.test.ts` passes in full — every composition assertion (`R_RECOLECTAS=50.00`, `R_ESPERA=24.00`, `tableMatch.matchedKey`, wildcard specificity, etc.) verified against real data, not just present in the test file |
| R75–R83 | ⬛ MISSING (data) | ✅ DONE | all 9 ids now real in `seed.json`: `SP_VE_OWN`+`CSTR_VE_OWN` (10-row cost structure, 7 drivers + 1 `appliesWhen`), `CARRIER_CO_1` (`R_PESO_ESCALON` RATE, `R_PARADAS_PROGRESIVA` PROGRESSIVE, `custom:material_averiado`, `custom:zona_riesgo`), `R_PROMO_LANZAMIENTO` (Nov–Dec 2025 window, verified 8,000 CRC delta), `RT_CO_A1` (no rate row, falls back to per-km), `Z_VE_TAC` + wildcard row, `SP_CO_OWN` (deliberately empty vehicle catalog) |
| R84 | ✅ (already) | ✅ | unchanged, was always pure code |
| §4.12/§5.2/§5.3 "cerrada" claims | overselling | now accurate | the roadmap's own verification claims are true again |
| §6.2 "falta conectar las pantallas" | undersold (code was ahead) | unchanged | this was the doc being too pessimistic, not a code gap — still true today, nothing to close |

**What was NOT touched to get here:** `evaluator.ts`, `resolver.ts`, `cost.ts`, `margin.ts` — zero
lines changed. Every fix was either (a) `seed.json` data, (b) 3 one-line stale test assertions
(`'VES'` → `'USD'`, left over from the §4.4 currency unification — `costStructure.test.ts:120`,
`explain.test.ts:222`, `settlementsDataSource.test.ts:126`), or (c) 3 test-isolation fixes
(`settlementsDataSource.test.ts`, `routesDataSource.test.ts`, `liquidacionDePuntaAPunta.test.ts` each
had a bare `localStorage.clear()` in `beforeEach` that implicitly relied on the seed's `settlements`
collection being empty — true by accident before this audit, no longer true now that real demo
liquidaciones live there. Fixed by explicitly clearing the `settlement` collection in those three
`beforeEach` blocks, which is the correct fix regardless — a unit test shouldn't depend on global
seed content it doesn't declare).

One more real bug found and left unfixed (out of scope — cosmetic, cost-import notes only):
`costSheetParser.ts:209` produces the string **"Se salteón 2 fila(s)"** for a 2-row title skip
(pluralizing `salteó` by appending `n` isn't Spanish; should be "Se saltearon"). Found while
verifying `estructura-costos-flota-vzla.xlsx` in §3. Doesn't affect parsing, only the note text.

---

## 3 · Demo data delivered

**Import files** (`docs/tarifador/demo-data/`, all independently re-parsed through the real
importer code as part of this audit — not just dropped in):

| File | Format | Exercises |
|---|---|---|
| `tarifario-epa-zona-camion.xlsx` | XLSX, title row above header, 3-dim key (zona origen × zona destino × tipo de camión), Spanish number format (`45.000,00`) | R6, R28 (N-dim tarifario import), wildcard rows (blank cell → `*`), header auto-detection skipping a title row |
| `tarifario-cofersa-zona.xlsx` | XLSX, 2-dim key, English number format (`350,000.00`) | R6, number-format ambiguity (`20.000` es vs en) |
| `tarifario-andina-4d.xlsx` | XLSX, 4-dim key (zona×zona×camión×servicio) | R6 — the exact "5 zonas × 4 camiones = 20 filas" case §2.7 describes in prose |
| `tarifario-beval-zona.csv` | CSV, `;` delimiter, Spanish format | R6 — delimiter auto-detection (confirmed `detectDelimiter` returns `;`) |
| `estructura-costos-flota-vzla.xlsx` | XLSX, 2 title rows above header, one non-numeric ("a convenir") row, one TOTAL row | R12/§2.8 — confirms `analyzeSheet`/`parseCostRows` correctly skip the TOTAL row and flag the unparseable cell, rather than importing garbage |
| `estructura-costos-transporte-cr-real.xlsx` | XLSX, **the actual client file** (copied from repo root `Estructura_Costos_Transporte.xlsx`), 5 sheets, each a different shape | R12/§2.8 — this is the real spreadsheet `costSheetParser.ts`'s hand-written test fixtures were built to replicate; re-run through the real parser in this audit it auto-detects driver (PER_MONTH_PRORATED for salaries, PER_KM for maintenance), currency (CRC), and correctly skips the two title rows on 4 of 5 sheets; the 5th ("Resumen") is a key-value sheet the parser correctly flags as needing manual mapping — exactly the documented edge case, not a bug |

Existing files re-verified (already in `docs/ejemplos-importacion/`, already wired to
`rateImport.ejemplos.test.ts`, already passing): `tarifas-cofersa.csv`, `tarifas-epa.csv`,
`tarifas-andina.xlsx`, `tarifas-beval.xlsx` — flat truck-type→price imports, deliberately messy
(mixed delimiters, `$` symbols, an "a convenir" row, a TOTAL row).

### Companies, routes, drivers, rate tables, cost structures — authored into `seed.json`

Every id below is real, loads through the actual `JsonDataSource`, and is exercised by a passing
test (`escenariosVerificados.test.ts`, `liquidacionDePuntaAPunta.test.ts`, `routesDataSource.test.ts`,
`driversDataSource.test.ts`, `partyVehicleTypes.test.ts`). `seed.json` grew from 118 lines originally
to ~2,650 after the first pass, and to ~8,000 after this pass (24 more real settlements plus the
supporting CR/CO entities in "Round two" below).

| Entity | Ids | What it's for |
|---|---|---|
| Settlement parties | `SP_VE_OWN`, `SP_CO_OWN` (deliberately **no** vehicle catalog — C8 border case), `SP_CR_OWN` (flota propia); `CARRIER_VE_1/2`, `CARRIER_CO_1/2`, `CARRIER_CR_1/2` (terceros, migrated from `testCarriers` with real fiscal fields) | R2, R22, R82 |
| Cost structure | `CSTR_VE_OWN` — 10 rows on `SP_VE_OWN`, all 7 `CostDriver`s, one `appliesWhen`-conditioned (TT-750 depreciation surcharge) | R12, R75 |
| Custom variables | `custom:horas_espera` (`CARRIER_VE_1`, NUMBER/PER_TRIP), `custom:material_averiado` + `custom:zona_riesgo` (`CARRIER_CO_1`, NUMBER+TEXT/PER_TRIP) | R15/§2.5, R77, R78 |
| Party-scoped rules | `R_RECOLECTAS`, `R_ESPERA` (`CARRIER_VE_1`); `R_MATERIAL_AVERIADO`, `R_ZONA_RIESGO`, `R_PESO_ESCALON` (TIERED `RATE`), `R_PARADAS_PROGRESIVA` (TIERED `PROGRESSIVE`) (`CARRIER_CO_1`); `R_PROMO_LANZAMIENTO` (`CARRIER_CR_2`, `effectiveFrom/To` Nov–Dec 2025 only) | R3, R5, R9, R77–R79 |
| Rate tables | `RT_ZONAS_VE`/`RT_ZONAS_CO`/`RT_ZONAS_CR` (country-scope `ZONAS`, replacing the dead `LOOKUP_ZONE`), including a wildcard row for `Z_VE_TAC` (Táchira) matching `["*","CCS"]` | R25, R28, R46, R81 |
| Routes | `RT_VE_A1` (`CARRIER_VE_1`, `CAR-CCS`), `RT_VE_A2` (`CAR-ZUL`), `RT_VE_A3` (`TAC-CCS`), `RT_VE_B1` (`CARRIER_VE_2`, **same** `CAR-CCS` lane as `RT_VE_A1` — two carriers, one lane, two prices), `RT_CO_A1` (`CARRIER_CO_1`, `BOG-MED`) | R30, R39, R48 |
| Drivers | `DRV_VE_1` (`CARRIER_VE_1`), `DRV_VE_2` (`CARRIER_VE_2`), `DRV_CO_1` (`CARRIER_CO_1`), `DRV_CR_1` (`CARRIER_CR_2`) | R32, R56 |
| Pricing templates | 6 new (`TPL_VE_2/3`, `TPL_CO_2/3`, `TPL_CR_2/3`) on top of the 3 original; all 9 now carry a real `expectedTotal` taken from an actual `calculate()` run | R67–R69, R75–R83 |

### Pre-built liquidaciones (`seed.json`'s `settlements` collection — 30 rows, all real)

Each one was produced by actually calling `loadTarifasCatalog` → `buildCalculateInput`/`toTripContext`
→ `calculate` → `emitSettlement` — the exact same pipeline the real screens use — then captured
verbatim (full trace, discards, margin, cost breakdown included). None of the numbers below are
hand-typed.

| # | Number | País/Compañía | Status | Total | Margen | Qué demuestra |
|---|---|---|---|---|---|---|
| 1 | `LIQ-0001` (VE) | `CARRIER_VE_1`, ruta `RT_VE_A1` (CAR→CCS), conductor `DRV_VE_1` | Pagado | 672.00 USD | OK (0.375) | Ruta real → 7 números derivados; recolectas (2×25) + horas de espera (3×8, variable propia) + peajes; base desde tarifario ZONAS |
| 2 | `LIQ-0002` (VE) | `SP_VE_OWN` (flota propia), viaje libre CCS→CAR | Aprobado | 510.00 USD | OK (0.5516) | Flota propia costeada contra `CSTR_VE_OWN` (estructura real), no contra tarifa de tercero |
| 3 | `LIQ-0001` (CO) | `CARRIER_CO_1`, ruta `RT_CO_A1` (BOG→MED), conductor `DRV_CO_1` | En Revisión | 139,868 COP | OK (0.9979) | Escalones RATE (peso) + PROGRESSIVE (paradas), variable numérica con descuento (material averiado), variable de texto (zona de riesgo), **devolución parcial** registrada sin afectar el pago |
| 4 | `LIQ-0001` (CR) | `CARRIER_CR_2`, viaje del 2025-12-10 | Pagado | 4,425.00 CRC | OK (0.8734) | `R_PROMO_LANZAMIENTO` vigente (dentro de la ventana nov-dic 2025) |
| 5 | `LIQ-0002` (CO) | `SP_CO_OWN` (flota propia, **sin** catálogo de vehículos) | Borrador | 50,395 COP | OK (0.9904) | Borde C8: catálogo de vehículos vacío — el motor avisa, no rompe, capacidad queda en 0 |
| 6 | `LIQ-0003` (VE) | `CARRIER_VE_2`, ruta `RT_VE_B1` (**misma lane** `CAR-CCS` que la liquidación 1, segundo transportista), conductor `DRV_VE_2` | Anulado | 582.00 USD | **LOSS** (−0.1168) | Dos transportistas, misma lane, precios distintos; viaje excepcional con corrección manual (+15 km sobre la ruta, sin editarla); margen en pérdida visible; **anulada, no borrada** — número conservado |

Numbering is per-country as designed (`LIQ-0001` repeats across VE/CO/CR, never within one country).

### Round two — Colombia and Costa Rica catch up, plus operator gaps closed (this pass)

The first pass concentrated variety on Venezuela (3 of the original 6 settlements) and left CO/CR
thin (2 and 1 settlements respectively), and left four `Expr` operators —`PER_BLOCK`, `MIN`, `MAX`,
`CLAMP`, `IF`— entirely undemonstrated by any settlement or template (only proven at the unit-test
level). This pass added 24 more settlements (all produced the same way as the original 6 — real
`loadTarifasCatalog`→`buildCalculateInput`/`toTripContext`→`calculate`→`emitSettlement` calls, no
hand-typed totals) so every country now has ~10 varied scenarios: **VE 9, CO 10, CR 11** (30 total).

New supporting entities authored to make this possible: 5 CR routes (`RT_CR_A1/A2/A3`, `RT_CR_B1/B2`
— CR had zero before), a CR zone (`Z_CR_PUN`, Puntarenas) plus a wildcard rate-table row
(`RTR_ZLR_CR_5`, `["*","LIB"]`) so CR's tarifario comodín is exercised the same way VE's already was,
a CR custom variable (`custom:refrigeracion_horas` on `CARRIER_CR_1`), two new cost structures
(`CSTR_CO_OWN` on `SP_CO_OWN`, `CSTR_CR_OWN` on `SP_CR_OWN` — proportioned from the real
`Estructura_Costos_Transporte.xlsx` client file, rescaled to this demo dataset's existing price
magnitudes so the margin math stays meaningful), a mid-size truck type + outsourced rate for
`CARRIER_VE_2` (`TT-550`/`OSR_VE_4`, needed to land a WARN-margin case), and 6 new party-scoped rules
closing the operator gap: `R_RECARGO_MINIMO`/`R_RECARGO_TOPE` (`MAX`/`MIN`, `CARRIER_VE_2`),
`R_RECARGO_PESO_MIXTO` (`IF`, `CARRIER_VE_2`), `R_ZONE_FALLBACK_CAUCA` (PARTY rule overriding the
COUNTRY rule of the **same code** — the first real proof of the `RuleScope` replace-by-code
mechanism, `CARRIER_CO_1`), `R_PESO_BLOQUE` (`PER_BLOCK`, `CARRIER_CO_2`), and `R_REFRIGERACION`
(`CLAMP` wrapping a `PER_UNIT`, `CARRIER_CR_1`).

| # | País | Compañía | Qué demuestra que ninguna liquidación anterior probaba |
|---|---|---|---|
| VE-4 | VE | `CARRIER_VE_2` | `MAX` (piso), `MIN` (tope) e `IF` (tarifa mixta por peso) — los tres en una sola liquidación real |
| VE-5 | VE | `CARRIER_VE_1` | Devolución **y** línea destildada (`excludedSeqs`) juntas en una liquidación real |
| VE-6 | VE | `SP_VE_OWN` | Regla ad-hoc (`adhocRules`, no vive en el catálogo) en una liquidación real |
| VE-9 | VE | `CARRIER_VE_1` | Comodín del tarifario (`["*","CCS"]`) resuelto por una liquidación real, no solo por una plantilla |
| VE-10 | VE | `CARRIER_VE_1` | `R_OVERNIGHT` y `R_LATE_PENALTY` **disparan** de verdad (antes siempre `CONDITION_FALSE` en las 6 originales) |
| VE-11 | VE | `CARRIER_VE_2` | Margen `WARN`/`REQUIRE_REASON` real (antes solo `OK` o `LOSS` existían) |
| CO-3 | CO | `CARRIER_CO_1` | `RuleScope` PARTY reemplazando a COUNTRY por el mismo código (`R_ZONE_FALLBACK`), con tasa propia |
| CO-4 | CO | `SP_CO_OWN` | Flota propia costeada contra `CSTR_CO_OWN` (antes CO no tenía ninguna estructura de costos) |
| CO-5 | CO | `CARRIER_CO_2` | `PER_BLOCK` disparando de verdad (antes solo probado a nivel unitario) |
| CO-6 | CO | `CARRIER_CO_1` | Devolución total **y** línea destildada juntas |
| CO-7 | CO | `SP_CO_OWN` | Regla ad-hoc (descuento puntual) |
| CO-8 | CO | `CARRIER_CO_2` | Margen `LOSS` con `blockOnLoss=true`: el intento de aprobar queda `blocked` (reproducido en vivo), el borrador sí se guarda |
| CO-9 | CO | `CARRIER_CO_2` | Margen `WARN`/`REQUIRE_REASON` real para CO |
| CO-10 | CO | `CARRIER_CO_1` | Estado `Anulado` para CO (antes solo VE lo tenía) |
| CR-2 | CR | `SP_CR_OWN` | Flota propia costeada contra `CSTR_CR_OWN` (proporcional al archivo real del cliente) |
| CR-3 | CR | `CARRIER_CR_1` | Tarifa plana de outsourcing (`OSR_CR_1`) en una liquidación real para CR |
| CR-4 | CR | `CARRIER_CR_2` | Misma lane que la promo, pero **fuera de vigencia** — precio completo, reproducido en una liquidación real (antes solo en `TPL_CR_3`) |
| CR-5 | CR | `CARRIER_CR_1` | Variable propia + `CLAMP` (tope de 6 horas de refrigeración) |
| CR-6 | CR | `CARRIER_CR_1` | Comodín del tarifario para CR (`["*","LIB"]`), antes inexistente |
| CR-7 | CR | `SP_CR_OWN` | Margen `LOSS` **aprobado directo** porque `blockOnLoss=false` en CR — contraste explícito con VE/CO |
| CR-8 | CR | `CARRIER_CR_1` | Devolución parcial **y** línea destildada juntas |
| CR-9 | CR | `CARRIER_CR_2` | Regla ad-hoc (cargo puntual) |
| CR-10 | CR | `CARRIER_CR_1` | Estado `Anulado` para CR |
| CR-11 | CR | `CARRIER_CR_2` | Margen `WARN`/`REQUIRE_REASON` real para CR |

**Bug found while building/verifying §3:** `costSheetParser.ts:209` produces the string
**"Se salteón 2 fila(s)"** for a 2-row title skip (appending `n` to `salteó` isn't Spanish; should be
"Se saltearon"). Cosmetic only, doesn't affect parsing — reproduced with `estructura-costos-flota-vzla.xlsx`.
Left unfixed (out of this audit's scope: a display-string typo, not a behavior bug).

---

## 4 · Mapping — every roadmap item → the demo case that proves it

| Roadmap item | Demo case |
|---|---|
| R1 (data layer, DDL) | `npm run tarifas:ddl` regenerates `sql/04_tarifas.sql` from the same `data/schema.ts` used by all 6 settlements above |
| R2 (parties, one entity two screens) | `SP_VE_OWN`/`SP_CO_OWN`/`SP_CR_OWN` (flota propia) vs. `CARRIER_*` (terceros) — settlement #2 vs. #1 |
| R3 (country→party rule scope) | `R_RECOLECTAS`/`R_ESPERA` (party-scope, `CARRIER_VE_1` only) vs. `R1`/`R2`/`R3` (country-scope, VE) — both fire in settlement #1's trace |
| R4 (visual builder + auto-description) | Any party rule above (`R_MATERIAL_AVERIADO` etc.) — open in Reglas de Tarifa, description is generated, not typed |
| R5 (tier modes) | `R_PESO_ESCALON` (RATE) + `R_PARADAS_PROGRESIVA` (PROGRESSIVE) both fire in settlement #3; `R_LATE_PENALTY` (FLAT, pre-existing) in `simulaciones.test.ts` |
| R6 (N-dim CSV/XLSX import) | `tarifario-epa-zona-camion.xlsx` (3-dim), `tarifario-andina-4d.xlsx` (4-dim), `tarifario-cofersa-zona.xlsx` (en format), `tarifario-beval-zona.csv` (`;` delimiter) |
| R7 (visual "Tarifa de tabla") | Rate-table base line in every settlement (`tableMatch.matchedKey`, e.g. `"CAR \| CCS"` in settlement #1) |
| R8 (vehicle catalog per party) | `partyVehicleTypes` on `CARRIER_VE_1`/`CARRIER_CO_1`/etc.; settlement #5 shows the ABSENT case (`SP_CO_OWN`) |
| R9 (vigencia vs. trip date) | Settlement #4 (`R_PROMO_LANZAMIENTO` active on 2025-12-10) vs. `TPL_CR_3` (same lane, 2026 — rule discarded `OUT_OF_PERIOD`) |
| R10 (driver search by cédula/name) | `DRV_VE_1`/`DRV_CO_1`/etc. — `driverSearch.test.ts`, and `liquidacionDePuntaAPunta.test.ts`'s "buscar por cédula" case |
| R11 (country as global scope) | All 6 settlements span 3 countries (VE/CO/CR), each fully isolated by `countryId` |
| R12 (7 cost prorations) | `CSTR_VE_OWN`'s 10 rows (all 7 `CostDriver`s) cost settlement #2; `estructura-costos-transporte-cr-real.xlsx` for the import side |
| R13 (margin policy + blocking) | Settlement #6 shows a real `LOSS` margin; settlement #4's earlier draft (before adding tolls) hit `TOTAL_NEGATIVO` and was correctly **blocked** by `emitSettlement` — reproduced live during this audit, not simulated |
| R14 (append-only audit log) | `src/lib/liquidador/auditLog.ts` write on each of the 6 emissions; schema rejects update/delete on `auditLog` |
| R15/§2.5 (per-trip custom vars) | `custom:horas_espera` (settlement #1), `custom:material_averiado`+`custom:zona_riesgo` (settlement #3) — all load and compute correctly end to end, contradicting the stale §2.5 warning (see R15 finding) |
| R16–R22 (adversarial hardening) | `simulaciones.test.ts` S1–S5 (all passing); settlement #4's negative-total block is the same mechanism (R20) proven outside the test suite |
| R24/R38 (`zone_id` derives from route, not null) | Every settlement with a route (`#1`, `#3`, `#6`) resolves its BASE line from the `ZONAS` rate table by zone code — never the wildcard fallback unless the lane genuinely has none |
| R25/R46/R81 (zone-lane → rate table, incl. wildcard) | `RT_ZONAS_VE` row for `Z_VE_TAC` (`["*","CCS"]`) — `TPL_VE_3` |
| R27 (currency-aware formatting) | Settlement #1 (USD), #3 (COP), #4 (CRC) — `format.ts` renders each with its own symbol, not a hardcoded `$` |
| R29 (VE in dollars) | Every VE settlement (`#1`, `#2`, `#6`) is in USD; `singleCurrencyMigration.test.ts` |
| R30/R31 (route as data source + exception override) | Settlement #6: route `RT_VE_B1` says 190 km, the settlement's trip says 205 km (override), and the route itself is untouched |
| R33/R34 (frozen snapshot, void not delete) | Settlement #6 is `Anulado`, not deleted — still readable, still numbered `LIQ-0003` |
| R35–R37 (blocking, numbering, margin-in-loss) | Settlement #4's reproduced `TOTAL_NEGATIVO` block; all 6 numbers are sequential per country with no `NaN`; settlement #6 (`LOSS`) was still allowed to save because its status is `Anulado`, not `Aprobado`/`Pagado` — exactly the rule R37 describes |
| R39 (zone FK protects route, not rate table) | `zoneDeletion.test.ts`; confirmed live in this audit — a route referencing `Z_VE_CAR` blocked that zone's deletion in `routesDataSource.test.ts` until the route was removed first |
| R41–R43 (Cargar/Combinar, party as argument) | Every settlement above was built by calling exactly `loadTarifasCatalog(countryId, partyId)` then `buildCalculateInput`/`toTripContext` — the same two functions, `partyId` passed explicitly every time |
| R50/R51 (dependency machine + conflict block) | `settlementForm.test.ts`; the driver/route/party triples in settlements #1/#3/#6 are exactly the cascade this machine resolves |
| R52 (custom var error not zero) | `customVarFields.test.ts` |
| R53 (single-pass exact total) | `settlementTotals.test.ts`; settlement #3's total (139,868) sums its trace lines exactly, no float drift |
| R54 (explanation: which inputs the engine read) | `explain.ts` against any of the 6 settlements' `trace` — e.g. settlement #1's `R_ESPERA` line records `{"custom:horas_espera": 3, "rate": "8.00"}` |
| R55 (returns replace, not accumulate) | Settlement #3's `returns` array — a single `PARCIAL` return, `FAC-9931`/`SKU-4471` |
| R58 (new fields: recolectas, peajes, atraso, incidentes) | Settlement #1 (`pickupCount: 2`), all 6 (`tollCount`) |
| R62 (emitted settlement re-reads without recalculating) | Any of the 6 — `getSettlement()` returns the frozen `trip`/`trace`, `DetalleLiquidacionModal.tsx` never calls `calculate()` again |
| R64–R66 (Probador = Liquidación assembly) | Same `loadTarifasCatalog`+`buildCalculateInput` calls used to build the 6 settlements are the exact calls `RuleTester.tsx` makes |
| R67–R69 (self-verifying scenarios) | `escenariosVerificados.test.ts` — all 9 `pricingTemplates`, including the 6 new ones, pass with real `expectedTotal`s |
| R71–R74 (illegible rule → named failure → block) | `reglaIlegible.test.ts`; not separately re-demoed with new data since it's a pure-evaluator concern, already fully covered |
| R75 (flota propia real cost structure) | Settlement #2 — `costModelId: "CSTR_VE_OWN"`, `costTotal: "228.67"` |
| R76 (RATE + PROGRESSIVE tiers together) | Settlement #3's trace lines `R_PESO_ESCALON` + `R_PARADAS_PROGRESIVA` |
| R77/R78 (numeric + text custom vars) | Settlement #3 |
| R79 (vigencia vencida, exact delta) | Settlement #4 vs. `TPL_CR_3` — 8,000 CRC difference, reproduced |
| R80 (lane with no rate row → km fallback, not zero) | `TPL_CO_2` (`RT_CO_A1` has no `MED→BOG` row; `R_ZONE_FALLBACK` fires, per-km, warns) |
| R82 (party with no vehicle catalog doesn't break) | Settlement #5 |
| R83 (multi-country) | All 6 settlements span VE/CO/CR with real routes/drivers/rules in each |
| R90/R91/R93/R94/R95 (§5.4 tech debt) | Not demoable as "features" — these are gaps by definition; §5 explains why each stays a gap |
| R96–R98 (§6 assumptions/decisions) | Cross-referenced against the same 6 settlements: `#2` is the flota-propia assumption (R96) in practice, `#3`'s return is the devoluciones assumption, `#1`'s recolectas are the recolectas assumption |
| R5 (`PER_BLOCK` operator) | VE-4/VE-5/... no — CO-5 (`R_PESO_BLOQUE`, `CARRIER_CO_2`): 1,800 kg → 3 bloques completos de 500 kg, disparando por primera vez fuera de un test unitario |
| R5 (`MIN`/`MAX` expression ops, distinct from `stacking: MAX`) | VE-4 (`R_RECARGO_MINIMO`=`MAX`, `R_RECARGO_TOPE`=`MIN`, `CARRIER_VE_2`) |
| R5 (`IF` operator) | VE-4 (`R_RECARGO_PESO_MIXTO`, `CARRIER_VE_2`): tarifa mixta según `weightKg` en una sola regla |
| R5 (`CLAMP` operator) | CR-5 (`R_REFRIGERACION`, `CARRIER_CR_1`): 8 horas cargadas, tope de 6 (7,200 CRC) — el `CLAMP` recorta el `PER_UNIT` |
| R3 (`RuleScope` reemplazo por código, PARTY sobre COUNTRY) | CO-3: `R_ZONE_FALLBACK_CAUCA` (PARTY, `CARRIER_CO_1`) reemplaza a `RULE_CO_ZONE_FALLBACK` (COUNTRY) para una lane (`MED→BOG`) sin fila en el tarifario — antes este mecanismo solo estaba probado a nivel de tipos, nunca con dos reglas del mismo código coexistiendo en el dataset |
| R9 (vigencia, contraste en una liquidación real) | CR-4: misma lane que la liquidación #4 original, misma promo, pero fecha 2026 (fuera de vigencia) — precio completo, no simulado |
| R13/R35–R37 (margen `WARN`/`REQUIRE_REASON`, distinto de `OK` y `LOSS`) | VE-11, CO-9, CR-11 — las tres liquidaciones originales+ronda 1 solo cubrían `OK` y `LOSS`; ahora el semáforo intermedio también está probado con una liquidación real por país |
| R13 (bloqueo reproducido en vivo con `blockOnLoss=true`) | CO-8: se intenta `Aprobado` primero (queda `blocked`, `TOTAL_NEGATIVO`), luego se guarda como `Borrador` — ambos intentos quedan en el log de la corrida, no solo el que se persiste |
| R37 (`blockOnLoss=false`, LOSS aprobado directo) | CR-7: Costa Rica no bloquea, a diferencia de VE/CO — la liquidación con margen negativo se guarda `Aprobado` con motivo, sin pasar por borrador |
| R58 (pernocta + atraso disparando de verdad) | VE-10: 28 horas de viaje (pernocta) + 90 minutos de atraso — antes `R_OVERNIGHT`/`R_LATE_PENALTY` aparecían siempre como `CONDITION_FALSE` en el desglose de las 6 liquidaciones originales |
| R25/R46/R81 (comodín de tarifario, ahora en los 3 países) | VE-9 (ya existía la fila, faltaba una liquidación real) + CR-6 (fila comodín nueva, `["*","LIB"]`) — antes solo VE lo probaba con una liquidación real |
| R12/R75 (estructura de costos, ahora en los 3 países) | CO-4 (`CSTR_CO_OWN`) y CR-2 (`CSTR_CR_OWN`, proporcional al archivo real del cliente) — antes solo VE tenía una |
| R15/§2.5 (variable propia, ahora también en CR) | CR-5 (`custom:refrigeracion_horas`, `CARRIER_CR_1`) — antes solo VE y CO tenían variables propias |

---

## 5 · Gaps — items that still cannot be proven, and why

Everything provable with a data fix **was** fixed (§2a, §3). What's left is genuinely out of a
data-and-audit engagement's scope — each of these needs either a `types.ts`/engine change, a
decision from the roadmap's maintainer, or is a gap the roadmap itself already correctly admits:

- **R23 (count of adversarial simulations)** — roadmap says 15, `simulaciones.test.ts` has 11. Not
  investigated further than counting; if 4 were relocated to `settlementForm.test.ts` as R22's note
  suggests, the roadmap text should say so instead of implying all 15 still live in that one file.
  Cosmetic documentation drift, not a functional gap — no demo case can "prove" a count claim, only a
  recount can, and that's done above.
- **R28 (tarifario declares its own currency)** — there is no explicit `currency` field on
  `RateTable` in `types.ts`. The claim is true in *effect* (every table in a country is that
  country's currency) but false as *literally written* ("el tarifario declara moneda" implies a
  declared field that doesn't exist). Not fixable by data or by this audit's mandate — it needs a
  `types.ts` change to the engine's shape, which is out of scope for an audit-and-demo-data
  engagement. Flagging precisely so it isn't silently "proven" by a demo case that doesn't actually
  exercise a currency field, because there isn't one.
- **R92 (D3 missing from the roadmap)** — can't be "proven" one way or the other since it's an
  omission in the *document*, not the code. No demo case applies. Flagged for the roadmap's
  maintainer to either restore the missing item or renumber D4–D6.
- **R90/R91/R93/R95 (§5.4 D1/D2/D4/D6)** — these are the roadmap's own admitted, unresolved technical
  debt (no backend RBAC enforcement, no concurrency control, `organization_id` threaded but unused,
  10 native `alert()`/`confirm()` calls). Confirmed accurate in §2 (`CONFIRMED-AS-GAP`). By
  definition nothing in this audit demos a gap into existence — the honest "demo" of D1, for
  instance, is that this audit could `grep` past the RBAC check with zero friction, which is the
  finding itself, not something a screenshot would add.
- **The A4 limitation (R88)** — `PER_UNIT.rate` genuinely cannot be a variable, confirmed still true
  in `types.ts` (`Money`, not `NumericVarKey`). This is a documented, deliberate non-fix, not a gap
  that needs closing — included here only so it isn't mistaken for an oversight.
