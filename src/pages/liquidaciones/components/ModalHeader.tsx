// Modal header for Liquidar Viaje Modal (title + close button).

import { InterruptorVista } from './InterruptorVista';

interface Props {
  reliquidando: boolean;
  tripNumber: string | undefined;
  puedeConfigurar: boolean;
  extendida: boolean;
  onExtendidaChange: (val: boolean) => void;
  onClose: () => void;
}

export function ModalHeader({
  reliquidando,
  tripNumber,
  puedeConfigurar,
  extendida,
  onExtendidaChange,
  onClose,
}: Props) {
  return (
    <div className="shrink-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          {reliquidando ? 'Re-liquidar viaje' : 'Liquidar viaje'}
          {tripNumber && <span className="ml-2 text-sm font-normal text-slate-500">{tripNumber}</span>}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {reliquidando
            ? 'Reemplaza a la anterior: queda anulada y enlazada a la nueva.'
            : 'Revise los datos del viaje. El total se calcula solo.'}
        </p>
      </div>
      {puedeConfigurar && <InterruptorVista extendida={extendida} onChange={onExtendidaChange} />}
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
        <i className="ri-close-line text-xl" />
      </button>
    </div>
  );
}
