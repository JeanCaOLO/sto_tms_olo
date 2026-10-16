# Fases de los motores del tarifador

Vigente al 2026-10-15. Sustituye al diagrama de `ROADMAP.md` §3 (que ponía el costo después del pipeline).

El tarifador tiene dos motores encadenados, ambos puros (no leen nada del entorno): el **motor de reglas** decide QUÉ reglas aplican a un viaje y el **motor de cálculo** decide CUÁNTO se liquida. Las 5 formas de cobro de la base son: **Por kilómetro, Por unidad, Tarifa fija, Por volumen y Tendering** (Tendering todavía sin cálculo: se muestra deshabilitado y bloquea con motivo).

## Antes de calcular (`calculateTrip`, `tripSettlement.ts`)
1. Perfil del transportista → `partyId`.
2. Tercero: `carriers.rate_type` (+ `flat_rate_amount`) da la forma de cobro (`resolveCarrierBase`). Sin ella: `BASE_NO_DEFINIDA` (bloquea). Flota propia: siempre su estructura de costos.
3. Contrato: `carriers.contract_expiry` contra el día del viaje. Vencido ⇒ aviso `Contrato vencido el …`, **no bloquea**. Se guarda en `TripCalculation.contract` y en el snapshot de la liquidación (`baseChange.contractExpiry`).
4. Catálogo del país (`catalogLoader.ts`, caché de 5 min): reglas país + globales, tarifarios, estructuras de costos, política de margen.
5. Armado del input (`settlementInput.ts`): falta una zona ⇒ `BASE_NO_DISPONIBLE`, no corre el motor.

## Motor de reglas — qué aplica (`resolveRules`, `resolver/evaluation.ts`)
1. Variables derivadas (`resolver/context.ts`): km, paradas, peso, zonas, pernocta, día de la semana, `custom:*`.
2. Alcance: reglas de la compañía (PARTY) y del país.
3. Vigencia `effectiveFrom/To` contra la fecha del viaje ⇒ `OUT_OF_PERIOD`.
4. La regla de la compañía reemplaza a la del país con el mismo código ⇒ `OVERRIDDEN_BY_PARTY` (una regla de compañía inactiva es la forma de apagar la del país).
5. Condiciones ⇒ `INACTIVE`, `CONDITION_FALSE`, `RULE_BROKEN`.
6. Apilado por etapa: SUM, EXCLUSIVE (⇒ `EXCLUDED_BY_EXCLUSIVE`), MAX (se resuelve en el pipeline).
7. Orden total: etapa → prioridad → alcance → código (`compareRules`, única definición).

## Motor de cálculo — cuánto (`calculate`, `index.ts`)
1. **Costos** (`cost/structure.ts`), solo flota propia: filas por driver, componentes con frecuencia, combustible. El fijo mensual se prorratea por día operativo.
2. **Cambio de base** (`baseOverride.ts`), solo terceros: aplica la forma de cobro del contrato ⇒ `BASE_REEMPLAZADA`. Un ajuste de otra etapa que cobra lo MISMO que la base ⇒ `DUPLICA_BASE` (con tarifa fija del transportista el concepto es `fixed`, así un recargo por km sigue aplicando).
3. **Herencia de la base** (`baseInheritance.ts`, nuevo): un ajuste con `appliesToBase` solo aplica si la forma de cobro del viaje es una de las que declara ⇒ si no, `MODALIDAD_DISTINTA`. Forma activa: la del contrato (tercero) o *por km* (flota propia). `appliesToBase` vacío/nulo = transversal.
4. **Pipeline de cargos** (`evaluator/pipeline.ts`): siembra la BASE, detecta ciclos (`REFERENCIA_CIRCULAR`), resuelve grupos MAX (`LOST_MAX`).
5. **Expresiones** (`evaluator/expressions.ts`): FIXED, PER_UNIT, PER_KM, PERCENT, TIERED, PER_BLOCK, LOOKUP_TABLE, MIN, MAX, CLAMP, IF. Ilegible ⇒ `REGLA_ILEGIBLE` (bloquea). Overrides manuales. Acumula con Decimal exacto.
6. **Porcentajes**: base `STAGE_SUBTOTAL`, `RUNNING_SUBTOTAL` o `RULE`.
7. **Redondeo y totales**: se redondea una vez; total negativo ⇒ `TOTAL_NEGATIVO`.
8. **Margen** (`margin.ts`, solo auditoría) y **reparto** entre casas (`allocation.ts`).
9. **Totales con líneas destildadas** (`settlementTotals.ts`) y explicación (`explain/`).

Fases: BASE → VARIABLE → AJUSTE (ADJUSTMENT) → TAX. MODIFIER y SURCHARGE ya no son fases: son la `category` de una regla VARIABLE (solo reporte; el orden lo da la prioridad). Apilado: SUM | MAX | EXCLUSIVE (EXCLUSIVE solo en BASE). Detalle: `.test/cambios_motor/REFACTOR_FASES_2026-10-16.md`; migración: `sql/39`.

## Datos nuevos (sql/38)
- `tarifas_pricing_rules.base_method`: forma de cobro que declara una regla BASE. La UI la deduce de la fórmula al guardar; el backfill la deduce igual. Hoy **solo avisa** si no coincide con la fórmula (`baseMethodMismatch`); no rechaza.
- `tarifas_pricing_rules.applies_to_base`: ajustes ligados a una forma de cobro (nulo = transversal).
