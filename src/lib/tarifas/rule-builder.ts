// El puente entre cómo piensa una persona una regla y cómo la ejecuta el motor.
//
//   formulario visual          compilar          motor
//   ─────────────────    ───────────────▶   ───────────
//   peajes × 20          →  PER_UNIT{custom:peajes, "20.00"}
//   aumenta el costo                                     → se suma al total
//
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`. Toda la traducción y
// toda la redacción viven acá para que se puedan probar sin montar un formulario — que es
// exactamente lo que hace `__tests__/rule-builder.test.ts`.
//
// NOTA: En versión particionada, este archivo es un BARREL que re-exporta todos los submodulos.

// Etiquetas y sugerencias
export {
  OPERATOR_LABELS,
  TIER_MODE_LABELS,
  TIER_MODE_HINTS,
  OPERATOR_HINTS,
  EFFECT_LABELS,
  CONDITION_ROW_OP_LABELS,
} from './rule-builder/labels';

// Validación
export type { BuilderErrors } from './rule-builder/validation';
export {
  validateBuilder,
  isBuilderValid,
  validateConditionRows,
  isConditionRowFilled,
} from './rule-builder/validation';

// Compilación
export {
  percentToFraction,
  compileBuilder,
  emptyTier,
  emptyConditionRow,
  compileConditions,
} from './rule-builder/compilation';

// Redacción automática
export type { DescribeContext } from './rule-builder/describe';
export { describeBuilder } from './rule-builder/describe';

// Variables
export {
  isCustomVar,
  customVarKey,
  collectVarKeys,
  findMissingCustomVars,
} from './rule-builder/variables';
