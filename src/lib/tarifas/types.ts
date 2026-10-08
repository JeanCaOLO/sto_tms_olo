// Tipos de dominio + AST del lenguaje de reglas del motor de tarifación.
// Puerto literal de vista-tarifas-fase1/src/kernel/types.ts (prototipo fuente real, no
// documentación reconstruida). Este archivo no importa React, localStorage, fetch, ni usa
// Date.now()/new Date() implícito.

// Barril: re-exporta todas las definiciones de tipos por dominio.
// Los nombres públicos son idénticos — los imports externos siguen funcionando sin cambios.

export type { RoundingMode, Country } from './types/country';

export type { ZoneGroup, Zone, Location, ZoneMapping } from './types/geography';

export type { TruckType, Carrier, Customer, Driver } from './types/master';

export type { Money, CustomVarOrigin, PartyVariable, CustomVarKey, VarValue } from './types/variables';

export type {
  ServiceType,
  FleetType,
  TripContext,
  DerivedVars,
  BuiltinVarKey,
  VarKey,
  VarBag,
  BuiltinNumericVarKey,
  NumericVarKey,
} from './types/trip';

export type {
  ComparisonOp,
  Pred,
  ConditionRowOperator,
  ConditionRowForm,
  ConditionMode,
  ConditionBuilderForm,
  BaseRef,
  Expr,
  TierMode,
  Tier,
  Stage,
  Stacking,
  RuleScope,
  RuleEffect,
  BuilderOperator,
  RuleBuilderForm,
  Rule,
} from './types/ast';
export { STAGE_ORDER } from './types/ast';

export type {
  RateTable,
  RateTableRow,
  RateTableMatch,
  Override,
} from './types/rateTable';
export { RATE_TABLE_WILDCARD } from './types/rateTable';

export type {
  TripStatus,
  TripRecord,
  TripEdits,
  SettlementStatus,
  SettlementReturn,
  SettlementRecord,
} from './types/settlement';

export type {
  SettlementInput,
  SettlementErrors,
  EmitSettlementResult,
} from './types/settlement-input';

export type {
  BuiltinCostDriver,
  CostDriver,
  CostFrequency,
  CostGroup,
  CostStructureParams,
  CostStructure,
  CostStructureRow,
  CostBreakdown,
  MarginPolicy,
  MarginStatus,
  MarginResult,
} from './types/cost';

export type {
  CargoPart,
  OrderMark,
  TripOrder,
  SettlementOrder,
  CargoSummary,
  AllocationCriterion,
  AllocationShare,
  Allocation,
} from './types/cargo';

export type {
  TraceSource,
  TraceLine,
  DiscardReason,
  DiscardedRule,
  CalcIssue,
  CalcResult,
} from './types/trace';

export type {
  CalculateInput,
  ProformaStatus,
  Proforma,
  Template,
} from './types/io';
