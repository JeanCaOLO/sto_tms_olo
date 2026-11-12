// Contrato del transportista: lo que aporta a la liquidación (quién es y hasta cuándo rige).
// Lógica pura.

/** Lo que el contrato del transportista aporta a la liquidación: quién es y hasta cuándo rige. */
export interface CarrierContract {
  carrierName: string | null;
  /** YYYY-MM-DD, o null si el contrato no tiene vencimiento cargado. */
  contractExpiry: string | null;
}

/** ¿Venció el contrato antes del día del viaje? Fechas YYYY-MM-DD; sin vencimiento no vence. */
export function isContractExpired(contractExpiry: string | null | undefined, tripDay: string): boolean {
  if (!contractExpiry) return false;
  return contractExpiry.slice(0, 10) < tripDay.slice(0, 10);
}

/** El contrato tal como sale de la fila del transportista del catálogo. */
export function contractOfCarrier(carrier: Record<string, unknown>): CarrierContract {
  const expiry = carrier.contract_expiry;
  return {
    carrierName: typeof carrier.name === 'string' ? carrier.name : null,
    contractExpiry: typeof expiry === 'string' && expiry.trim() !== '' ? expiry.slice(0, 10) : null,
  };
}
