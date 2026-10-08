// Re-exports públicos del módulo resolver.

export {
  type DerivedContext,
  computeOvernightNights,
  computeWeekday,
  resolveCustomVars,
  deriveContext,
} from './context';

export {
  type ResolveResult,
  evaluatePred,
  isRuleInEffect,
  resolveRules,
} from './evaluation';

export { detectTieWarnings } from './warnings';
