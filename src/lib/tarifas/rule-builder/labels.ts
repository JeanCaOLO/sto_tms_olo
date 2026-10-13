// Etiquetas y sugerencias del vocabulario visual para el constructor de reglas.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import type { BuilderOperator, ConditionRowOperator, RuleEffect, TierMode } from '../types';

export const OPERATOR_LABELS: Record<BuilderOperator, string> = {
  FIXED: 'Monto fijo',
  TIMES: 'Por cada (×)',
  PER_BLOCK: 'Cada N unidades (÷)',
  PERCENT: 'Porcentaje (%)',
  TIERED: 'Por escalones',
  RATE_TABLE: 'Tarifa de tabla',
};

export const TIER_MODE_LABELS: Record<TierMode, string> = {
  FLAT: 'El tramo fija un importe fijo',
  RATE: 'El tramo fija la tarifa de todas las unidades',
  PROGRESSIVE: 'Cada tramo cobra solo sus unidades (marginal)',
};

export const TIER_MODE_HINTS: Record<TierMode, string> = {
  FLAT: 'Con 250 km y la tabla 100→2 · 300→1,50 · resto→1,20, cobra 1,50.',
  RATE: 'Con 250 km y esa misma tabla, cobra 250 × 1,50 = 375.',
  PROGRESSIVE: 'Con 250 km y esa misma tabla, cobra 100×2 + 150×1,50 = 425.',
};

export const OPERATOR_HINTS: Record<BuilderOperator, string> = {
  FIXED: 'Un importe fijo, sin depender de ninguna variable.',
  TIMES: 'Multiplica la variable por el importe. Ej: por cada peaje, $20.',
  PER_BLOCK: 'Cuenta bloques COMPLETOS. Ej: cada 10 peajes, $15 — con 25 peajes se pagan 2 bloques.',
  PERCENT: 'Un porcentaje sobre una base que elegís explícitamente.',
  TIERED: 'Tramos por cantidad. El modo decide si el tramo fija un importe, una tarifa, o cobra solo lo suyo.',
  RATE_TABLE: 'El importe sale de un tarifario cargado aparte. Acá se elige cuál y cuánto cobrar si el viaje no casa ninguna fila.',
};

export const EFFECT_LABELS: Record<RuleEffect, string> = {
  INCREASE: 'Aumenta el costo',
  DECREASE: 'Disminuye el costo',
};

export const CONDITION_ROW_OP_LABELS: Record<ConditionRowOperator, string> = {
  EQ: '= igual a',
  NEQ: '≠ distinto de',
  GT: '> mayor que',
  GTE: '≥ mayor o igual que',
  LT: '< menor que',
  LTE: '≤ menor o igual que',
  IN: 'está en la lista',
  BETWEEN: 'está entre',
};
