// Validación de liquidaciones.

import type { SettlementInput, SettlementErrors } from '../types';

export function validateSettlement(input: SettlementInput): SettlementErrors {
  const errors: SettlementErrors = {};

  if (!input.trip?.id) errors.trip = 'Falta el viaje a liquidar.';
  if (!input.trip?.countryId) errors.trip = 'El viaje no tiene país.';

  return errors;
}

export function blockingIssues(input: SettlementInput) {
  return input.calc.blockingIssues;
}
