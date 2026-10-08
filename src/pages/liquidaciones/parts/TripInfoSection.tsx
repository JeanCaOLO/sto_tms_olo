// Section displaying trip information (read-only) in settlement emission.

import { describeTrip } from '../../../lib/tarifas/tripContext';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

interface Props {
  calculation: TripCalculation;
  simple: boolean;
}

export function TripInfoSection({ calculation, simple }: Props) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        {simple ? 'El viaje' : '1 · El viaje'}
      </h3>
      <div className={`bg-slate-50 border border-slate-200 rounded-lg ${simple ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-xs">
          {describeTrip(calculation.trip).map((d) => (
            <Dato key={d.label} label={d.label} valor={d.value} />
          ))}
        </div>
        {!simple && (
          <p className="text-[11px] text-slate-400 mt-2">
            Son de guía de despacho: no se editan desde el liquidador. La fecha del viaje decide
            qué reglas estaban vigentes.
          </p>
        )}
      </div>
      {!simple && !calculation.partyId && (
        <p className="text-xs text-amber-700 mt-2">
          El transportista no tiene perfil de cálculo: se liquida solo con las reglas del país.
        </p>
      )}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-slate-800 font-medium">{valor}</div>
    </div>
  );
}
