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

// Fecha SIN hora. La vigencia se compara por día contra la fecha del viaje, y el formato fijo es
// lo que permite compararla como texto (el orden lexicográfico de 'YYYY-MM-DD' es el cronológico).
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida: se espera AAAA-MM-DD');

export const StageSchema = z.enum(STAGE_ORDER as [string, ...string[]]) as z.ZodEnum<
  ['BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX']
>;

// Variable personalizada de una compañía. No se puede enumerar en tiempo de compilación (se
// declaran en caliente), así que se valida por forma; que exista de verdad lo verifica el editor de
// reglas contra las variables declaradas por esa compañía.
export const CustomVarKeySchema = z
  .string()
  .regex(/^custom:[a-z0-9_]+$/i, 'Variable personalizada inválida: se espera custom:nombre_sin_espacios');

export const BuiltinVarKeySchema = z.enum([
  'countryId', 'km', 'clientCount', 'packageCount', 'weightKg',
  'truckTypeId', 'serviceType', 'fleetType', 'carrierId', 'customerId',
  'durationHours', 'tollsAmount', 'tollCount', 'pickupCount',
  'truckVolumeM3', 'truckWeightTons', 'lateMinutes', 'incidentCount',
  'originZone', 'destZone', 'originZoneGroup', 'destZoneGroup',
  'overnightNights', 'weekday',
]);

export const VarKeySchema = z.union([BuiltinVarKeySchema, CustomVarKeySchema]);

// Subconjunto válido como `unit` en PER_UNIT/TIERED/PER_BLOCK — ver NumericVarKey en types.ts.
export const BuiltinNumericVarKeySchema = z.enum([
  'km', 'clientCount', 'packageCount', 'weightKg', 'durationHours',
  'tollsAmount', 'tollCount', 'pickupCount', 'truckVolumeM3', 'truckWeightTons',
  'lateMinutes', 'incidentCount', 'overnightNights', 'weekday',
]);

export const NumericVarKeySchema = z.union([BuiltinNumericVarKeySchema, CustomVarKeySchema]);

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
    z.object({
      op: z.literal('TIERED'),
      unit: NumericVarKeySchema,
      // Ausente = 'FLAT', como se interpretaban los escalones antes del campo.
      mode: z.enum(['FLAT', 'RATE', 'PROGRESSIVE']).optional(),
      tiers: z.array(TierSchema).min(1),
    }),
    z.object({
      op: z.literal('PER_BLOCK'),
      unit: NumericVarKeySchema,
      blockSize: z.number().positive('El tamaño de bloque debe ser mayor que cero'),
      amount: MoneySchema,
    }),
    z.object({ op: z.literal('LOOKUP_TABLE'), table: z.string().min(1), fallback: ExprSchema }),
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
  // Ausente = regla de país, que es como se interpretaban todas antes de que existiera el alcance.
  scope: z.enum(['COUNTRY', 'PARTY']).optional(),
  partyId: z.string().min(1).nullable().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  stage: StageSchema,
  priority: z.number().int(),
  stacking: z.enum(['SUM', 'MAX', 'EXCLUSIVE']),
  exclusionGroup: z.string().nullable(),
  conditions: PredSchema,
  expression: ExprSchema,
  description: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  effect: z.enum(['INCREASE', 'DECREASE']).nullable().optional(),
  builder: z.unknown().nullable().optional(),
  conditionBuilder: z.unknown().nullable().optional(),
  isAdhoc: z.boolean(),
  active: z.boolean(),
  // Ausentes = rige siempre, que es como se interpretaban todas antes de que existiera la vigencia.
  effectiveFrom: DateOnlySchema.nullable().optional(),
  effectiveTo: DateOnlySchema.nullable().optional(),
  version: z.number().int().min(1),
}).refine(
  (rule) => !rule.effectiveFrom || !rule.effectiveTo || rule.effectiveFrom <= rule.effectiveTo,
  { message: 'La fecha de fin no puede ser anterior a la de inicio.', path: ['effectiveTo'] },
);

export const RuleWithScopeSchema = RuleSchema.refine(
  (rule) => rule.scope !== 'PARTY' || !!rule.partyId,
  { message: 'Una regla con alcance de compañía debe indicar a qué compañía pertenece.', path: ['partyId'] },
);

export const OverrideSchema = z.object({
  value: MoneySchema,
  reason: z.string().min(1, 'El motivo del override no puede estar vacío'),
});

export type RuleInput = z.infer<typeof RuleSchema>;
