// Tipos de dominio + AST del lenguaje de reglas del motor de tarifación.
// Puerto literal de vista-tarifas-fase1/src/kernel/types.ts (prototipo fuente real, no
// documentación reconstruida). Este archivo no importa React, localStorage, fetch, ni usa
// Date.now()/new Date() implícito.

export type Money = string; // "400.00", "-12.5" — NUNCA number de JS

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'UP' | 'DOWN';

export interface Country {
  id: string;
  iso2: string;
  name: string;
  localCurrency: string; // p.ej. 'VES'
  refCurrency: string; // p.ej. 'USD' — base de consolidación
  roundingDecimals: number;
  roundingMode: RoundingMode;
  /** Horas a partir de las cuales un viaje cuenta como "más de un día". */
  overnightThresholdHours: number;
}

export type FxRateType = 'OFFICIAL' | 'PARALLEL' | 'INTERNAL';

export interface FxRate {
  id: string;
  countryId: string;
  from: string;
  to: string;
  rate: string; // decimal serializado
  type: FxRateType;
  source: string;
  validFrom: string; // ISO 8601
}

// Cascada geográfica ZoneGroup → Zone → Location: evita declarar una tarifa por cada
// combinación de localidades (matriz N×N literal). Reglas y lookups se declaran a nivel de Zone
// (o ZoneGroup), y cada Location resuelve a su Zone en el contexto derivado del viaje.
export interface ZoneGroup {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Zone {
  id: string;
  countryId: string;
  zoneGroupId: string;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  countryId: string;
  zoneId: string;
  code: string;
  name: string;
}

// Maestros de referencia (flota, terceros).
export interface TruckType {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Carrier {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Customer {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Driver {
  id: string;
  countryId: string;
  code: string;
  name: string;
  /** null = conductor de flota propia; si no, transportista al que pertenece. */
  carrierId: string | null;
}

export type ServiceType = 'STANDARD' | 'EXPRESS' | 'DEDICATED';
export type FleetType = 'OWN' | 'OUTSOURCED';

export interface TripContext {
  countryId: string;
  quotedAt: string; // ISO 8601 — nunca Date.now() implícito
  originLocationId: string;
  destLocationId: string;
  km: number;
  clientCount: number;
  packageCount: number;
  weightKg: number;
  truckTypeId: string;
  serviceType: ServiceType;
  fleetType: FleetType;
  carrierId: string | null;
  driverId: string | null;
  customerId: string | null;
  durationHours: number;
  tollsAmount: Money;
  lateMinutes: number;
  incidentCount: number;
}

// Calculadas por el resolver a partir de TripContext + parametría del país — nunca se ingresan a
// mano. originZone/destZone/*ZoneGroup usan el CÓDIGO de zona (no el id interno), igual que el
// resto del vocabulario de predicados.
export interface DerivedVars {
  originZone: string;
  destZone: string;
  originZoneGroup: string;
  destZoneGroup: string;
  overnightNights: number;
  weekday: number; // 0 (domingo) .. 6 (sábado)
}

// Vocabulario cerrado: si una regla referenciara otra clave, no compilaría en TypeScript.
export type VarKey =
  | 'countryId' | 'km' | 'clientCount' | 'packageCount' | 'weightKg'
  | 'truckTypeId' | 'serviceType' | 'fleetType' | 'carrierId' | 'customerId'
  | 'durationHours' | 'tollsAmount' | 'lateMinutes' | 'incidentCount'
  | 'originZone' | 'destZone' | 'originZoneGroup' | 'destZoneGroup'
  | 'overnightNights' | 'weekday';

export type VarValue = string | number;
export type VarBag = Record<VarKey, VarValue>;

// Subconjunto de VarKey usable como "unidad" en PER_UNIT/TIERED — multiplicar un rate por un
// serviceType no tiene sentido, así que el compilador rechaza ese uso.
export type NumericVarKey =
  | 'km' | 'clientCount' | 'packageCount' | 'weightKg' | 'durationHours'
  | 'tollsAmount' | 'lateMinutes' | 'incidentCount' | 'overnightNights' | 'weekday';

export type ComparisonOp = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE';

export type Pred =
  | { p: ComparisonOp; left: VarKey; right: string | number }
  | { p: 'IN'; left: VarKey; values: (string | number)[] }
  | { p: 'BETWEEN'; left: VarKey; from: number; to: number }
  | { p: 'AND' | 'OR'; args: Pred[] }
  | { p: 'NOT'; arg: Pred }
  | { p: 'ALWAYS' };

// Todo porcentaje declara su base de forma explícita — un "+8%" sin base es la causa #1 de
// discrepancias irreproducibles en motores de tarifas.
export type BaseRef =
  | { of: 'STAGE_SUBTOTAL'; stage: Stage }
  | { of: 'RUNNING_SUBTOTAL' }
  | { of: 'RULE'; ruleCode: string };

export type Expr =
  | { op: 'FIXED'; amount: Money }
  | { op: 'PER_UNIT'; unit: NumericVarKey; rate: Money }
  | { op: 'PER_KM'; rate: Money }
  | { op: 'PERCENT'; pct: string; base: BaseRef }
  | { op: 'TIERED'; unit: NumericVarKey; tiers: { upTo: number | null; amount: Money }[] }
  // Cascada N×N con respaldo: busca ZoneLaneRate zona-a-zona; si no hay cobertura, usa fallback.
  | { op: 'LOOKUP_ZONE'; fallback: Expr }
  | { op: 'MIN' | 'MAX'; args: Expr[] }
  | { op: 'CLAMP'; value: Expr; min?: Money; max?: Money }
  | { op: 'IF'; cond: Pred; then: Expr; else: Expr };

export type Stage = 'BASE' | 'VARIABLE' | 'MODIFIER' | 'SURCHARGE' | 'ADJUSTMENT' | 'TAX';
export const STAGE_ORDER: readonly Stage[] = ['BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX'];

export type Stacking = 'SUM' | 'MAX' | 'EXCLUSIVE';
export type CurrencyMode = 'REF' | 'LOCAL';

export interface Rule {
  id: string;
  countryId: string;
  code: string;
  name: string;
  stage: Stage;
  priority: number; // menor = se evalúa antes; dentro de EXCLUSIVE, gana la de menor priority
  stacking: Stacking;
  exclusionGroup: string | null; // reglas MAX mutuamente excluyentes comparten este grupo
  currencyMode: CurrencyMode;
  conditions: Pred;
  expression: Expr;
  isAdhoc: boolean;
  active: boolean;
  version: number; // se incrementa al editar; nunca se sobreescribe en silencio
}

// Tabla de tarifas zona-a-zona que resuelve LOOKUP_ZONE.
export interface ZoneLaneRate {
  id: string;
  countryId: string;
  originZoneId: string;
  destZoneId: string;
  amount: Money;
}

// La edición manual nunca sobreescribe en silencio — siempre queda registrada con un motivo.
export interface Override {
  value: Money;
  reason: string;
}

// ── Salida del kernel ────────────────────────────────────────────────────────────────────────

export interface TraceLine {
  seq: number;
  stage: Stage;
  ruleId: string | null; // null = línea ad-hoc sin persistir
  ruleCode: string;
  label: string;
  inputs: Record<string, string | number>;
  computed: Money; // lo que dictó la regla, en su moneda original
  currency: string;
  computedRef: Money; // convertido a moneda de referencia
  override?: Override;
  final: Money; // override.value si existe, si no computedRef
  runningSubtotal: Money;
}

export type DiscardReason = 'CONDITION_FALSE' | 'EXCLUDED_BY_EXCLUSIVE' | 'LOST_MAX' | 'INACTIVE';
export interface DiscardedRule {
  ruleCode: string;
  reason: DiscardReason;
  detail: string;
}

export interface FxUsed {
  rate: string;
  type: FxRateType;
  source: string;
}

// El motor calcula cuánto se le debe LIQUIDAR (pagar) al transportista por el viaje — nunca un
// cobro a un cliente. No hay "costo interno vs cobrado" que comparar (no existe margen de venta en
// este módulo): la misma regla de negocio (propio → nómina, outsourcing → cuentas por pagar) se
// resuelve enteramente con reglas condicionadas por `fleetType`/`carrierId`, igual que cualquier
// otra condición del AST — nunca con un `if` de código que bifurque el modelo de cálculo.
export interface CalcResult {
  trace: TraceLine[];
  discarded: DiscardedRule[];
  stageSubtotals: Record<Stage, Money>;
  totalLiquidado: Money;
  fxUsed: FxUsed;
  warnings: string[];
}

// ── Entrada de calculate() — todo lo que el kernel necesita, nada implícito ───────────────────

export interface CalculateInput {
  country: Country;
  trip: TripContext;
  rules: Rule[];
  zones: Zone[];
  zoneGroups: ZoneGroup[];
  locations: Location[];
  zoneLaneRates: ZoneLaneRate[];
  fxRates: FxRate[];
  overrides?: Record<string, Override>; // indexados por ruleCode
  adhocRules?: Rule[]; // reglas del viaje actual, no persistidas
}

// ── Proformas — viajes emitidos y persistidos ─────────────────────────────────────────────────

export type ProformaStatus = 'PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'LIQUIDADO';

/** Snapshot inmutable de un viaje emitido: `result` queda congelado al emitir y nunca se
 *  recalcula, aunque después cambien las reglas o los parámetros de costo. */
export interface Proforma {
  id: string;
  countryId: string;
  number: string; // secuencial legible, único por país: "VJ-0001"
  status: ProformaStatus;
  createdAt: string; // ISO 8601, igual a trip.quotedAt al momento de emitir
  trip: TripContext;
  overrides: Record<string, Override>;
  adhocRules: Rule[];
  result: CalcResult;
  reason?: string; // motivo capturado si la política de margen lo exigió
}

// ── Plantillas de viaje frecuente ──────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  countryId: string;
  name: string;
  trip: Omit<TripContext, 'quotedAt'>;
  overrides?: Record<string, Override>;
}
