import type { CarrierProfile } from '../../../../lib/tarifas/parties';

/** Encabezado fijo: nombre de la compañía, qué significa la estructura según su tipo y botón de cierre. */
export function CostStructureHeader({ party, onClose }: { party: CarrierProfile; onClose: () => void }) {
  return (
    <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Estructura de costos — {party.name}</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {party.classification === 'OWN'
            ? 'Los gastos de operar un viaje de esta flota propia. Se acumulan y es lo que se liquida y se envía a cuentas por pagar.'
            : 'Un tercero se liquida con reglas y tarifarios, no con una estructura de costos. Esta pantalla solo la muestra como referencia.'}
        </p>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
        <i className="ri-close-line text-xl"></i>
      </button>
    </div>
  );
}
