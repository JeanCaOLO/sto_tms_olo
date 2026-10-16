// Validación de entrada para estructura de costos.

import type { CostStructureInput, StructureErrors } from './types';

export function validateStructure(input: CostStructureInput): StructureErrors {
  const errors: StructureErrors = {};
  if (!input.name.trim()) errors.name = 'Poné un nombre que la identifique.';
  if (!input.countryId) errors.countryId = 'Elegí el país: define la moneda.';
  if (!Number.isFinite(input.operatingDaysPerMonth) || input.operatingDaysPerMonth <= 0) {
    // Es el divisor del prorrateo mensual: en cero, todos esos costos darían cero sin avisar.
    errors.operatingDaysPerMonth = 'Los días operativos por mes deben ser mayores que cero.';
  }
  return errors;
}
