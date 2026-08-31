# Motor de Reglas y Liquidación — Documentación técnica

> Objetivo de este documento: describir el motor con precisión suficiente para reimplementarlo o
> portarlo **sin necesidad de ver el código fuente original**. Todos los nombres de tipos, campos y
> funciones citados abajo son exactos, copiados de `src/kernel/*.ts`.

## 0. Principio de diseño: el kernel es puro

Todo `src/kernel/*.ts` **no importa nada fuera de la librería estándar de TypeScript** (más
`decimal.js`). No hay `React`, no hay `localStorage`, no hay `fetch`, no hay `Date.now()` implícito.
Cada función recibe todo lo que necesita como parámetro explícito. Esto es lo que permite que el
mismo código corra sin cambios en un cliente (React) o en un backend, y es la razón por la que se
puede portar tal cual a otro proyecto: **no depende de ningún detalle del proyecto de origen**.

Archivos del kernel (todos a portar tal cual):
```
types.ts     — tipos de dominio + AST del lenguaje de reglas (fuente de verdad)
resolver.ts  — ¿QUÉ reglas aplican? deriva contexto, filtra, resuelve stacking
evaluator.ts — ¿CUÁNTO suma cada regla? evalúa expresiones + corre el pipeline de cargo
cost.ts      — motor de costos (independiente del AST de reglas)
margin.ts    — margen + semáforo
money.ts     — Decimal / redondeo — único lugar que convierte Money↔Decimal
schemas.ts   — validación zod de Rule (para persistencia, opcional portar)
index.ts     — calculate(): punto de entrada único
```

## 1. Punto de entrada único: `calculate()`

```ts
// src/kernel/index.ts
export function calculate(input: CalculateInput): CalcResult {
  const derived = deriveContext(input);
  const { applied, discarded } = resolveRules(input, derived);
  const charge = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, input);
  const cost = computeCost(input, derived.overnightNights, derived.originZoneId, derived.destZoneId);
  const margin = computeMargin(toDecimal(charge.chargedTotal), toDecimal(cost.total), input.marginPolicy, input.country);

  return {
    trace: charge.trace,
    discarded,
    stageSubtotals: charge.stageSubtotals,
    chargedTotal: charge.chargedTotal,
    cost,
    margin,
    fxUsed: charge.fxUsed,
    warnings: charge.warnings,
  };
}
```

Es una función pura: `deriveContext → resolveRules → runChargePipeline → computeCost →
computeMargin`. Sin estado oculto. Misma entrada (`CalculateInput`) ⇒ mismo resultado
(`CalcResult`), siempre — incluida la hora de cotización, que entra como dato
(`trip.quotedAt`) y no se lee del reloj del sistema.

## 2. Modelo de datos completo (`types.ts`)

### 2.1 Dinero

```ts
export type Money = string; // "400.00", "-12.5" — NUNCA number de JS
```
El dinero jamás cruza una frontera serializable (JSON/props/localStorage) como `number`. Se
convierte a `Decimal` (decimal.js) únicamente dentro de `money.ts`.

### 2.2 País, geografía, maestros

```ts
export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'UP' | 'DOWN';

export interface Country {
  id: string; iso2: string; name: string;
  localCurrency: string; refCurrency: string;   // ej. 'VES' / 'USD' — refCurrency es la base de consolidación
  roundingDecimals: number; roundingMode: RoundingMode;
  overnightThresholdHours: number;              // horas a partir de las cuales un viaje es "más de un día"
}

export type FxRateType = 'OFFICIAL' | 'PARALLEL' | 'INTERNAL';
export interface FxRate {
  id: string; countryId: string; from: string; to: string;
  rate: string;          // decimal serializado
  type: FxRateType; source: string; validFrom: string; // ISO 8601
}

// Cascada geográfica: evita declarar una tarifa por cada combinación de localidades (N×N literal).
// Reglas y lookups se declaran a nivel de Zone (o ZoneGroup); cada Location resuelve a su Zone.
export interface ZoneGroup { id: string; countryId: string; code: string; name: string; }
export interface Zone { id: string; countryId: string; zoneGroupId: string; code: string; name: string; }
export interface Location { id: string; countryId: string; zoneId: string; code: string; name: string; }

export interface TruckType { id: string; countryId: string; code: string; name: string; }
export interface Carrier { id: string; countryId: string; code: string; name: string; }
export interface Customer { id: string; countryId: string; code: string; name: string; }
export interface Driver {
  id: string; countryId: string; code: string; name: string;
  carrierId: string | null; // null = conductor de flota propia; si no, transportista al que pertenece
}
```

### 2.3 Contexto del viaje (entrada) y variables derivadas

```ts
export type ServiceType = 'STANDARD' | 'EXPRESS' | 'DEDICATED';
export type FleetType = 'OWN' | 'OUTSOURCED';

export interface TripContext {
  countryId: string;
  quotedAt: string;           // ISO 8601 — nunca Date.now() implícito
  originLocationId: string; destLocationId: string;
  km: number; clientCount: number; packageCount: number; weightKg: number;
  truckTypeId: string; serviceType: ServiceType; fleetType: FleetType;
  carrierId: string | null; driverId: string | null; customerId: string | null;
  durationHours: number;
  tollsAmount: Money; lateMinutes: number; incidentCount: number;
}

// Calculadas por el resolver a partir de TripContext + parametría del país — nunca se ingresan a mano.
export interface DerivedVars {
  originZone: string; destZone: string;         // CÓDIGO de zona (no id interno) — así se escriben las reglas
  originZoneGroup: string; destZoneGroup: string;
  overnightNights: number;
  weekday: number;                              // 0 (domingo) .. 6 (sábado)
}
```

### 2.4 Vocabulario cerrado de variables (`VarKey`)

Las condiciones y expresiones de las reglas **solo** pueden referenciar estas claves — si una regla
referenciara otra, no compilaría en TypeScript (ese es el punto: cerrar el vocabulario):

```ts
export type VarKey =
  | 'countryId' | 'km' | 'clientCount' | 'packageCount' | 'weightKg'
  | 'truckTypeId' | 'serviceType' | 'fleetType' | 'carrierId' | 'customerId'
  | 'durationHours' | 'tollsAmount' | 'lateMinutes' | 'incidentCount'
  | 'originZone' | 'destZone' | 'originZoneGroup' | 'destZoneGroup'
  | 'overnightNights' | 'weekday';

export type VarValue = string | number;
export type VarBag = Record<VarKey, VarValue>;

// Subconjunto numérico, usable como "unidad" en PER_UNIT/TIERED (no tiene sentido multiplicar
// un rate por serviceType). Es un tipo aparte para que el compilador rechace usos inválidos.
export type NumericVarKey =
  | 'km' | 'clientCount' | 'packageCount' | 'weightKg' | 'durationHours'
  | 'tollsAmount' | 'lateMinutes' | 'incidentCount' | 'overnightNights' | 'weekday';
```

`carrierId`/`customerId` nulos se representan como `''` dentro de `VarBag` (ver `resolver.ts`).

### 2.5 AST de predicados (condiciones de reglas)

```ts
export type ComparisonOp = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE';

export type Pred =
  | { p: ComparisonOp; left: VarKey; right: string | number }
  | { p: 'IN'; left: VarKey; values: (string | number)[] }
  | { p: 'BETWEEN'; left: VarKey; from: number; to: number }
  | { p: 'AND' | 'OR'; args: Pred[] }
  | { p: 'NOT'; arg: Pred }
  | { p: 'ALWAYS' };
```

### 2.6 AST de expresiones (cálculo de montos — nunca texto ni `eval`)

```ts
export type BaseRef =
  | { of: 'STAGE_SUBTOTAL'; stage: Stage }
  | { of: 'RUNNING_SUBTOTAL' }
  | { of: 'RULE'; ruleCode: string };
// Todo porcentaje declara su base de forma EXPLÍCITA — un "+8%" sin base es la causa #1 de
// discrepancias irreproducibles en motores de tarifas (dos personas asumen bases distintas).

export type Expr =
  | { op: 'FIXED'; amount: Money }
  | { op: 'PER_UNIT'; unit: NumericVarKey; rate: Money }
  | { op: 'PER_KM'; rate: Money }
  | { op: 'PERCENT'; pct: string; base: BaseRef }
  | { op: 'TIERED'; unit: NumericVarKey; tiers: { upTo: number | null; amount: Money }[] }
  | { op: 'LOOKUP_ZONE'; fallback: Expr }   // busca ZoneLaneRate zona-a-zona; si no hay cobertura, usa fallback
  | { op: 'MIN' | 'MAX'; args: Expr[] }
  | { op: 'CLAMP'; value: Expr; min?: Money; max?: Money }
  | { op: 'IF'; cond: Pred; then: Expr; else: Expr };
```

Solo 5 de los 10 operadores son editables desde el formulario guiado de la UI del prototipo
(`FIXED`, `PER_UNIT`, `PER_KM`, `PERCENT`, `TIERED`) — los otros 5 (`LOOKUP_ZONE`, `MIN`, `MAX`,
`CLAMP`, `IF`) existen en el kernel y en los tests, pero se editan solo como datos crudos. Esto es
una decisión de UI, no una limitación del motor.

### 2.7 Reglas

```ts
export type Stage = 'BASE' | 'VARIABLE' | 'MODIFIER' | 'SURCHARGE' | 'ADJUSTMENT' | 'TAX';
export const STAGE_ORDER: readonly Stage[] = ['BASE','VARIABLE','MODIFIER','SURCHARGE','ADJUSTMENT','TAX'];

export type Stacking = 'SUM' | 'MAX' | 'EXCLUSIVE';
export type CurrencyMode = 'REF' | 'LOCAL';

export interface Rule {
  id: string; countryId: string; code: string; name: string;
  stage: Stage;
  priority: number;              // menor = se evalúa antes; dentro de EXCLUSIVE, gana la de menor priority
  stacking: Stacking;
  exclusionGroup: string | null; // reglas MAX mutuamente excluyentes comparten este grupo
  currencyMode: CurrencyMode;
  conditions: Pred;
  expression: Expr;
  isAdhoc: boolean;
  active: boolean;
  version: number;               // se incrementa al editar; nunca se sobreescribe en silencio
}
```

**Etapas (`Stage`), en orden fijo de aplicación:** `BASE` (precio base de la ruta) → `VARIABLE`
(cargo por cliente/kg/bulto) → `MODIFIER` (ajustes por tipo de servicio) → `SURCHARGE` (recargos:
pernocta, peajes, incidentes) → `ADJUSTMENT` (descuentos/penalidades sobre el subtotal corriente) →
`TAX` (existe en el modelo, sin uso en el seed actual). El subtotal de cada etapa ya cerrada queda
disponible para que una regla `PERCENT` posterior lo use como base.

### 2.8 Tablas de costo y margen

```ts
export interface ZoneLaneRate {           // resuelve LOOKUP_ZONE
  id: string; countryId: string; originZoneId: string; destZoneId: string; amount: Money;
}

export interface OwnCostParams {          // 1 por país — lo único que NO depende del tipo de camión
  id: string; countryId: string; driverDaily: Money;
}

export interface OwnCostRate {            // costo por km de flota propia, por tipo de camión
  id: string; countryId: string; truckTypeId: string;
  costPerKm: Money; depreciationPerKm: Money;
}

export interface OutsourcedCostRate {     // tarifa plana de un transportista por ruta+tipo camión
  id: string; countryId: string; carrierId: string;
  originZoneId: string; destZoneId: string; truckTypeId: string; flatRate: Money;
}

export type OwnFleetCostMode = 'FLAT' | 'FORMULA';
export interface OwnFleetCostSettings {   // 1 por país — cuál modo es la fuente de verdad para calcular
  id: string; countryId: string; mode: OwnFleetCostMode;
}

export interface OwnFleetRouteRate {      // fila por (ruta zona-a-zona, tipo camión) de flota propia
  id: string; countryId: string; originZoneId: string; destZoneId: string; truckTypeId: string;
  flatRate: Money;       // usado si mode === 'FLAT'
  referenceKm: string;   // SOLO display en modo FORMULA; un viaje real siempre usa trip.km
}

export type MarginStatus = 'OK' | 'WARN' | 'CRITICAL' | 'LOSS';
export type MarginAction = 'NONE' | 'REQUIRE_REASON' | 'BLOCK';
export interface MarginPolicy {
  countryId: string;
  warnBelow: number; criticalBelow: number; requireReasonBelow: number; // ej. 0.15/0.10/0.10
  blockOnLoss: boolean;
}
```

### 2.9 Overrides, salida del kernel, proformas, plantillas

```ts
// La edición manual nunca sobreescribe en silencio — siempre queda registrada con un motivo.
export interface Override { value: Money; reason: string; }

export interface TraceLine {
  seq: number; stage: Stage; ruleId: string | null; ruleCode: string; label: string;
  inputs: Record<string, string | number>;
  computed: Money; currency: string; computedRef: Money;
  override?: Override; final: Money; runningSubtotal: Money;
}

export type DiscardReason = 'CONDITION_FALSE' | 'EXCLUDED_BY_EXCLUSIVE' | 'LOST_MAX' | 'INACTIVE';
export interface DiscardedRule { ruleCode: string; reason: DiscardReason; detail: string; }

export interface CostBreakdown { total: Money; breakdown: TraceLine[]; modelId: string; }
export interface MarginResult { amount: Money; pct: string; status: MarginStatus; action: MarginAction; }
export interface FxUsed { rate: string; type: FxRateType; source: string; }

export interface CalcResult {
  trace: TraceLine[]; discarded: DiscardedRule[]; stageSubtotals: Record<Stage, Money>;
  chargedTotal: Money; cost: CostBreakdown; margin: MarginResult; fxUsed: FxUsed;
  warnings: string[];
}

export interface CalculateInput {
  country: Country; trip: TripContext; rules: Rule[];
  zones: Zone[]; zoneGroups: ZoneGroup[]; locations: Location[];
  zoneLaneRates: ZoneLaneRate[]; fxRates: FxRate[];
  ownCostParams: OwnCostParams; ownCostRates: OwnCostRate[];
  outsourcedCostRates: OutsourcedCostRate[]; ownFleetRouteRates: OwnFleetRouteRate[];
  ownFleetCostSettings: OwnFleetCostSettings; marginPolicy: MarginPolicy;
  overrides?: Record<string, Override>;   // indexados por ruleCode
  adhocRules?: Rule[];                    // reglas del viaje actual, no persistidas
}

export type ProformaStatus = 'PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'LIQUIDADO';
export interface Proforma {   // snapshot inmutable: result nunca se recalcula tras emitir
  id: string; countryId: string; number: string; status: ProformaStatus; createdAt: string;
  trip: TripContext; overrides: Record<string, Override>; adhocRules: Rule[];
  result: CalcResult; reason?: string;
}

export interface Template {
  id: string; countryId: string; name: string;
  trip: Omit<TripContext, 'quotedAt'>; overrides?: Record<string, Override>;
}
```

## 3. Algoritmo de resolución y prioridad (`resolver.ts`)

`resolveRules()` decide **qué** reglas sobreviven (no cuánto suman — eso lo hace `evaluator.ts`).
Corre en fases, procesando `STAGE_ORDER` en orden:

**Fase 1 — Filtrado.** Se combinan `input.rules` y `input.adhocRules` (filtradas por
`countryId === trip.countryId`). Se descarta cada regla con `!rule.active` (razón `INACTIVE`) o cuya
condición no se cumple, `!evaluatePred(rule.conditions, vars)` (razón `CONDITION_FALSE`).

**Fase 2 — Stacking, dentro de cada etapa:**
- **`SUM`**: todas pasan directo a ganadoras — no compiten entre sí.
- **`EXCLUSIVE`**: se ordenan por `priority` ascendente; gana la primera (`priority` más bajo);
  el resto se descarta con razón `EXCLUDED_BY_EXCLUSIVE`.
  ```ts
  const sorted = [...exclusiveRules].sort((a, b) => a.priority - b.priority);
  const winner = sorted[0]!;
  ```
- **`MAX`**: se agrupan por `exclusionGroup` (o una clave singleton por regla si es `null`). Dentro
  de cada grupo con más de un miembro, se evalúa la expresión de cada regla contra un
  **`probeContext`** — un `EvalContext` degradado donde `getStageSubtotal`/`getRunningSubtotal`
  devuelven `ZERO` y `getRuleAmount` devuelve `null`, porque el pipeline de cargo real todavía no
  existe en esta fase. Gana la regla con el `Decimal` más alto:
  ```ts
  const withAmounts = group.map((rule) => ({ rule, amount: evaluateExpr(rule.expression, probeContext(...)) }));
  const winner = withAmounts.reduce((best, curr) => (curr.amount.greaterThan(best.amount) ? curr : best));
  ```
  Las perdedoras se descartan con razón `LOST_MAX`.

**Fase 3 — Orden final.** Todas las ganadoras se ordenan por `(stageIndex, priority)`:
```ts
const applied = winners.sort((a, b) => {
  const stageDiff = stageIndex(a.stage) - stageIndex(b.stage);
  return stageDiff !== 0 ? stageDiff : a.priority - b.priority;
});
```
Esta lista final alimenta `runChargePipeline` en `evaluator.ts`, en orden estricto etapa→prioridad.

**Limitación documentada e importante para el port**: una regla dentro de un `exclusionGroup` con
`stacking: 'MAX'` **no debería** depender de `RUNNING_SUBTOTAL`/`STAGE_SUBTOTAL`/`RULE` para decidir
su propio monto — esa comparación ocurre antes de que exista el pipeline de cargo real, y con la
sonda esos valores son siempre cero.

**Cuándo importa `priority`**: solo para desempatar reglas `EXCLUSIVE` de la misma etapa, y como
clave secundaria de orden de evaluación dentro de una etapa. No afecta en absoluto a `SUM` (todas
suman) ni a `MAX` (gana el monto más alto, la prioridad es irrelevante ahí).

### 3.1 Abstracción de UI sobre `priority` (opcional portar)

El prototipo nunca muestra el número crudo de `priority` al usuario — solo un checkbox "Marcar como
prioritaria" cuando `stacking === 'EXCLUSIVE'`. La traducción vive en `src/ui/priorityAssignment.ts`:

```ts
export function computeAutoPriority(
  stage: Stage, stacking: Stacking, prioritaria: boolean,
  selfId: string | null, existingRules: Rule[],
): number {
  if (stacking !== 'EXCLUSIVE') {
    const maxPriority = existingRules
      .filter((r) => r.stage === stage && r.id !== selfId)
      .reduce((m, r) => Math.max(m, r.priority), 0);
    return maxPriority + 10;   // SUM/MAX: el orden no afecta el resultado, solo se ponen "al final"
  }
  const competitors = existingRules.filter((r) => r.stage === stage && r.stacking === 'EXCLUSIVE' && r.id !== selfId);
  if (competitors.length === 0) return 10;
  const priorities = competitors.map((r) => r.priority);
  return prioritaria ? Math.min(...priorities) - 10 : Math.max(...priorities) + 10;
}

export function inferPrioritaria(rule: Rule, existingRules: Rule[]): boolean {
  if (rule.stacking !== 'EXCLUSIVE') return false;
  const competitors = existingRules.filter((r) => r.stage === rule.stage && r.stacking === 'EXCLUSIVE' && r.id !== rule.id);
  if (competitors.length === 0) return true;
  return rule.priority <= Math.min(...competitors.map((r) => r.priority));
}
```

Idea: para que una regla "gane" su competencia EXCLUSIVE, se le asigna un `priority` estrictamente
menor al mínimo actual entre sus pares de etapa (`min - 10`); para que "pierda", estrictamente mayor
(`max + 10`). Nunca renumera a las demás reglas. `inferPrioritaria` es la inversa, usada para
precargar el checkbox al editar una regla existente.

## 4. Motor de costos (`cost.ts`) — independiente del AST de reglas

Deliberadamente separado del lenguaje de `Rule`: el costo no se cotiza al cliente, tiene su propio
modelo (`OWN`/`OUTSOURCED`) y solo alimenta el margen. Forzarlo dentro del AST de `Rule` obligaría a
meter conceptos de costo en un vocabulario pensado para tarifas.

```ts
export function computeCost(
  input: Pick<CalculateInput, 'country'|'trip'|'ownCostParams'|'ownCostRates'|'outsourcedCostRates'|'ownFleetRouteRates'|'ownFleetCostSettings'>,
  overnightNights: number, originZoneId: string, destZoneId: string,
): CostBreakdown
```

Dispatch por `trip.fleetType`:

### Flota propia (`OWN`) — 2 modos, seleccionados por `ownFleetCostSettings.mode` (1 por país)

**Modo `FLAT`**: busca `OwnFleetRouteRate` por `(originZoneId, destZoneId, truckTypeId)`.
Si no existe, **lanza un error** (no hay fallback silencioso — fuerza a configurar en Reglas →
Costos antes de cotizar):
```
"No hay tarifa plana de flota propia configurada para la ruta origen="{originZoneId}"
 destino="{destZoneId}" y truckType="{truckTypeId}". Configúrela en Reglas → Costos antes de cotizar."
```
Una única línea de costo: `COST_OWN_FLAT = flatRate.flatRate`.

**Modo `FORMULA`**: `days = overnightNights + 1` (un día por defecto, más uno por cada noche de
pernocta ya derivada por el resolver). Busca `OwnCostRate` por `truckTypeId` (independiente de la
ruta); lanza error si falta. Suma 3 líneas:
```
COST_KM           = km × ownRate.costPerKm
COST_DEPRECIATION = km × ownRate.depreciationPerKm
COST_DRIVER       = days × ownCostParams.driverDaily   // el costo de chofer es 1:1 por país, no por tipo de camión
total = COST_KM + COST_DEPRECIATION + COST_DRIVER
```

### Flota tercerizada (`OUTSOURCED`)

Busca `OutsourcedCostRate` por la tupla de 4 claves `(carrierId, truckTypeId, originZoneId,
destZoneId)` — "cada transportista cotiza distinto por ruta y tipo de camión". Lanza error si no
existe cobertura para esa combinación. Una única línea: `COST_FLAT = rate.flatRate`.

`CostBreakdown.modelId` guarda qué fila/modelo produjo el costo (`'OWN'` en modo fórmula, o el `id`
de la fila `OwnFleetRouteRate`/`OutsourcedCostRate` en los otros casos) — para trazabilidad.

Las líneas de costo reutilizan el tipo `TraceLine` (vía `toTraceLines()`) solo por paridad visual
con la tabla de cargos — **no son reglas**: no tienen semántica de `stage`/`stacking` real
(`stage` queda fijo en `'BASE'` como placeholder).

## 5. Motor de margen (`margin.ts`)

```ts
export function computeMargin(chargedTotal: Decimal, costTotal: Decimal, policy: MarginPolicy, country): MarginResult {
  const amount = chargedTotal.minus(costTotal);
  const pct = chargedTotal.isZero() ? ZERO : amount.dividedBy(chargedTotal);
  const status = isNegative(amount) ? 'LOSS'
    : pct.lessThan(policy.criticalBelow) ? 'CRITICAL'
    : pct.lessThan(policy.warnBelow) ? 'WARN' : 'OK';
  const action = (status === 'LOSS' && policy.blockOnLoss) ? 'BLOCK'
    : pct.lessThan(policy.requireReasonBelow) ? 'REQUIRE_REASON' : 'NONE';
  return { amount: roundToMoney(amount, country), pct: pct.toFixed(4), status, action };
}
```
Los umbrales viven en `MarginPolicy` (configurable por país en la UI, no son constantes de código).
`action === 'BLOCK'` debe impedir emitir la proforma; `action === 'REQUIRE_REASON'` debe exigir un
motivo no vacío antes de permitir emitir.

## 6. Infraestructura de dinero (`money.ts`)

```ts
Decimal.set({ precision: 34 }); // precisión interna de trabajo — no es el redondeo final
export const ZERO: Decimal = new Decimal(0);
export function toDecimal(value: Money | number): Decimal { return new Decimal(value); }
export function toMoney(value: Decimal): Money { return value.toFixed(); }

const ROUNDING_MODE_MAP: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP, HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  UP: Decimal.ROUND_UP, DOWN: Decimal.ROUND_DOWN,
};

// ÚNICO punto de redondeo del sistema.
export function roundMoney(value: Decimal, country): Decimal {
  return value.toDecimalPlaces(country.roundingDecimals, ROUNDING_MODE_MAP[country.roundingMode]);
}
export function roundToMoney(value: Decimal, country): Money {
  return roundMoney(value, country).toFixed(country.roundingDecimals); // fija decimales: "510.00", no "510"
}
export function addAll(values: Decimal[]): Decimal { return values.reduce((acc, v) => acc.plus(v), ZERO); }
export function isNegative(value: Decimal): boolean { return value.isNegative() && !value.isZero(); }
```

Regla de oro: **acumular sin redondear, redondear solo al presentar/persistir un total**. Si se
redondeara línea por línea, cada línea siguiente heredaría un error de redondeo compuesto.

## 7. Mecánica del pipeline de cargo (`evaluator.ts::runChargePipeline`)

```ts
export function runChargePipeline(
  applied: Rule[], vars: VarBag, originZoneId: string, destZoneId: string,
  input: Pick<CalculateInput, 'country'|'trip'|'zoneLaneRates'|'fxRates'|'overrides'>,
): ChargeResult
```

Por cada regla ya resuelta (orden etapa→prioridad, entregado por `resolver.ts`):

1. Construye un `EvalContext` con acceso a `vars`, ids de zona, `zoneLaneRates`, y 3 lookups que
   reflejan solo lo evaluado hasta el momento: `getStageSubtotal(stage)`, `getRunningSubtotal()`,
   `getRuleAmount(ruleCode)` (una base `PERCENT` de tipo `RULE` que referencia un código inexistente
   o aún no evaluado emite un warning y devuelve `ZERO`, no lanza error).
2. `computed = evaluateExpr(rule.expression, ctx)` — recorrido recursivo del AST, un `switch`
   exhaustivo sobre los 10 operadores de `Expr` (sin `eval`, sin fórmulas como texto).
3. Si `rule.currencyMode === 'LOCAL'`, convierte a moneda de referencia:
   `computedRef = computed / fxUsed.rate`. `fxRateFor()` elige la `FxRate` del país para el par
   local→referencia con `validFrom` más reciente que sea `<= trip.quotedAt`; si no hay ninguna,
   asume paridad 1:1 con un warning. Si `localCurrency === refCurrency`, se salta la conversión
   directamente (`rate: '1'`).
4. Si existe un `Override` para `rule.code`, `final = override.value`; si no, `final = computedRef`.
5. Acumula sobre `Decimal`s **sin redondear**: `running += final`, `stageAccum[rule.stage] += final`,
   `ruleAmounts[rule.code] = final`.
6. Empuja una `TraceLine` con los valores de esa línea ya redondeados solo para presentación.

`chargedTotal = roundToMoney(running, country)` al final. `evaluatePred`/`evaluateExpr` son también
las funciones que usa `resolver.ts` (para condiciones y para la sonda de `MAX`).

### 7.1 Evaluación de expresiones — resumen de los 10 operadores

| `op` | Cálculo |
|---|---|
| `FIXED` | `amount` tal cual |
| `PER_UNIT` | `vars[unit] × rate` |
| `PER_KM` | `vars.km × rate` |
| `PERCENT` | `resolveBase(base) × pct` — `base` es `STAGE_SUBTOTAL`, `RUNNING_SUBTOTAL` o el monto de otra `RULE` por código |
| `TIERED` | busca el primer tier con `upTo === null \|\| qty <= upTo`, devuelve `tier.amount` (monto fijo del escalón, no fórmula) |
| `LOOKUP_ZONE` | busca `ZoneLaneRate` por `(originZoneId, destZoneId)`; si no hay, warning + evalúa `fallback` |
| `MIN`/`MAX` | mínimo/máximo de evaluar cada `args[i]` |
| `CLAMP` | evalúa `value`, lo acota a `[min, max]` si están definidos |
| `IF` | evalúa `cond`; según el resultado evalúa `then` o `else` |

## 8. "Viaje extraordinario" vs "Nueva tarifa" — dos formas de consumir el mismo motor

Ambos flujos llaman exactamente al mismo `calculate()`. La diferencia es de **capacidad de edición
en la capa de presentación**, no de lógica de cálculo:

| | Nueva tarifa (catálogo) | Viaje extraordinario (fuera de catálogo) |
|---|---|---|
| `overrides` | siempre `{}` | edición línea por línea con motivo obligatorio |
| `adhocRules` | siempre `[]` | soporta agregar reglas ad-hoc al viaje (opcionalmente persistirlas a la biblioteca luego) |
| Cuándo usarlo | el viaje está cubierto por reglas/tarifas existentes | `computeCost`/reglas no cubren la combinación — se resuelve con overrides/reglas puntuales |
| Si falta configuración de costo | `computeCost()` lanza error, se muestra como banner | mismo error, pero el usuario tiene overrides/ad-hoc para sortearlo para ese viaje puntual |

Si el proyecto destino quiere replicar esta distinción de UX (sin portar la UI original), el punto
clave es: **el mismo `calculate()` con `overrides`/`adhocRules` opcionales ya soporta ambos modos**
— no hace falta un segundo motor.

## 9. Contrato de datos que el motor necesita del proyecto destino

Para llamar a `calculate()` hace falta poder construir un `CalculateInput` completo. Equivalente a
lo que hoy provee la interfaz `Repository` del prototipo (`src/data/repository.ts`), por país:

- 1 `Country`
- N `Rule` (más `adhocRules` opcionales del viaje en curso)
- N `Zone`, `ZoneGroup`, `Location` (cascada geográfica)
- N `ZoneLaneRate` (fallback de `LOOKUP_ZONE`)
- N `FxRate` (histórico por `validFrom`)
- 1 `OwnCostParams`, N `OwnCostRate` (por tipo de camión), N `OutsourcedCostRate` (por
  carrier×ruta×tipo camión), N `OwnFleetRouteRate` (por ruta×tipo camión), 1
  `OwnFleetCostSettings` (modo activo)
- 1 `MarginPolicy`
- `overrides`/`adhocRules` opcionales, específicos del viaje que se está cotizando (no persistentes
  en el prototipo)

El proyecto destino puede o bien **adoptar estos tipos tal cual** (más simple, si no tiene modelo de
datos previo para esto), o **mapear sus propias entidades** hacia estos tipos justo antes de llamar
a `calculate()` (si ya tiene un modelo de reglas/tarifas distinto). El kernel no impone cómo se
guardan los datos — solo qué forma deben tener al momento de la llamada.
