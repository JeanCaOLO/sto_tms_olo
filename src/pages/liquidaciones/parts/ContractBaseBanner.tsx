// Banner con qué forma de cobro rige el viaje: la del contrato del transportista (terceros) o la
// estructura de costos de la compañía (flota propia). No se elige acá: se define en el catálogo.

import { BASE_METHODS, describeCurrentBase } from '../../../lib/tarifas/baseMethods';
import { formatMoney } from '../../../lib/tarifas/format';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export function ContractBaseBanner({ calculation }: { calculation: TripCalculation }) {
  const { result, contract, trip, input } = calculation;
  const method = result.base?.method;
  const amount = input.baseOverride?.amount;
  const vencido = contract?.expired === true && contract.contractExpiry;

  let texto: string;
  if (trip.isOwnFleet) {
    texto = 'Flota propia: se cobra según la estructura de costos de la compañía.';
  } else if (method) {
    const label = BASE_METHODS[method].label;
    const monto = method === 'FIXED' && amount ? ` (${formatMoney(amount, result.currency ?? '')} por viaje)` : '';
    const quien = contract?.carrierName ? ` de ${contract.carrierName}` : '';
    const hasta = contract?.contractExpiry && !vencido ? `, vigente hasta ${fechaCorta(contract.contractExpiry)}` : '';
    texto = `Este viaje se cobrará por ${label}${monto}, según el contrato${quien}${hasta}.`;
  } else {
    texto = `Se calcula con: ${describeCurrentBase(result).label}.`;
  }

  return (
    <div className="space-y-2" data-testid="contract-base-banner">
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-600">
        {texto}
        <span className="ml-1 text-slate-400">La forma de pago se define en el catálogo de Transportistas.</span>
      </div>
      {vencido && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800" role="alert">
          <i className="ri-alert-line mr-1"></i>
          Contrato vencido el {fechaCorta(contract!.contractExpiry!)}. Se puede liquidar igual.
        </div>
      )}
    </div>
  );
}
