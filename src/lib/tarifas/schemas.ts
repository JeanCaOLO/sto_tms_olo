// Validadores zod del AST de reglas. Sirven para (1) validar lo que entra desde la UI antes de
// llegar al evaluador, y (2) como documentación ejecutable del vocabulario cerrado de operadores.
// Puerto literal de vista-tarifas-fase1/src/kernel/schemas.ts.

import { z } from 'zod';
import { STAGE_ORDER } from './types';

export const MoneySchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Monto inválido: se espera un string decimal, p.ej. "400.00"');

// Igual formato que Money pero semánticamente es una fracción (0.08 = 8%), no un monto.
export const PctSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Porcentaje inválido: se espera una fracción decimal, p.ej. "0.08" para 8%');

export const StageSchema = z.enum(STAGE_ORDER as [string, ...string[]]) as z.ZodEnum<
  ['BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX']
>;

export const VarKeySchema = z.enum([
  'countryId', 'km', 'clientCount', 'packageCount', 'weightKg',
  'truckTypeId', 'serviceType', 'fleetType', 'carrierId', 'customerId',
  'durationHours', 'tollsAmount', 'lateMinutes', 'incidentCount',
  'originZone', 'destZone', 'originZoneGroup', 'destZoneGroup',
  'overnightNights', 'weekday',
]);

// Subconjunto de VarKeySchema válido como `unit` en PER_UNIT/TIERED — ver NumericVarKey en types.ts.
export const NumericVarKeySchema = z.enum([
  'km', 'clientCount', 'packageCount', 'weightKg', 'durationHours',
  'tollsAmount', 'lateMinutes', 'incidentCount', 'overnightNights', 'weekday',
]);

// ── Predicados (recursivo) ─────────────────────────────────────────────────────────────────────

const ComparisonOpSchema = z.enum(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE']);
const ScalarSchema = z.union([z.string(), z.number()]);

export const PredSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('p', [
    z.object({ p: ComparisonOpSchema, left: VarKeySchema, right: ScalarSchema }),
    z.object({ p: z.literal('IN'), left: VarKeySchema, values: z.array(ScalarSchema).min(1) }),
    z.object({ p: z.literal('BETWEEN'), left: VarKeySchema, from: z.number(), to: z.number() }),
    z.object({ p: z.literal('AND'), args: z.array(PredSchema).min(1) }),
    z.object({ p: z.literal('OR'), args: z.array(PredSchema).min(1) }),
    z.object({ p: z.literal('NOT'), arg: PredSchema }),
    z.object({ p: z.literal('ALWAYS') }),
  ]),
);

// ── Base de porcentaje — explícita siempre ────────────────────────────────────────────────────

export const BaseRefSchema = z.discriminatedUnion('of', [
  z.object({ of: z.literal('STAGE_SUBTOTAL'), stage: StageSchema }),
  z.object({ of: z.literal('RUNNING_SUBTOTAL') }),
  z.object({ of: z.literal('RULE'), ruleCode: z.string().min(1) }),
]);

// ── Expresiones (recursivo) — vocabulario cerrado de exactamente diez operadores ───────────────

const TierSchema = z.object({
  upTo: z.number().nullable(),
  amount: MoneySchema,
});

export const ExprSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('FIXED'), amount: MoneySchema }),
    z.object({ op: z.literal('PER_UNIT'), unit: NumericVarKeySchema, rate: MoneySchema }),
    z.object({ op: z.literal('PER_KM'), rate: MoneySchema }),
    z.object({ op: z.literal('PERCENT'), pct: PctSchema, base: BaseRefSchema }),
    z.object({ op: z.literal('TIERED'), unit: NumericVarKeySchema, tiers: z.array(TierSchema).min(1) }),
    z.object({ op: z.literal('LOOKUP_ZONE'), fallback: ExprSchema }),
    z.object({ op: z.literal('MIN'), args: z.array(ExprSchema).min(1) }),
    z.object({ op: z.literal('MAX'), args: z.array(ExprSchema).min(1) }),
    z.object({ op: z.literal('CLAMP'), value: ExprSchema, min: MoneySchema.optional(), max: MoneySchema.optional() }),
    z.object({ op: z.literal('IF'), cond: PredSchema, then: ExprSchema, else: ExprSchema }),
  ]),
);

// ── Regla completa ────────────────────────────────────────────────────────────────────────────

export const RuleSchema = z.object({
  id: z.string().min(1),
  countryId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  stage: StageSchema,
  priority: z.number().int(),
  stacking: z.enum(['SUM', 'MAX', 'EXCLUSIVE']),
  exclusionGroup: z.string().nullable(),
  currencyMode: z.enum(['REF', 'LOCAL']),
  conditions: PredSchema,
  expression: ExprSchema,
  isAdhoc: z.boolean(),
  active: z.boolean(),
  version: z.number().int().min(1),
});

export const OverrideSchema = z.object({
  value: MoneySchema,
  reason: z.string().min(1, 'El motivo del override no puede estar vacío'),
});

export type RuleInput = z.infer<typeof RuleSchema>;
