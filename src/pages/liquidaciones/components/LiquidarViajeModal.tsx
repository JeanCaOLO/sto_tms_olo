// Settlement emission modal for a trip. Uses Modal base component.

import Modal from '../../../components/base/Modal';
import { useLiquidadorVista } from '../hooks/useLiquidadorVista';
import { useLiquidarViajeController } from '../hooks/useLiquidarViajeController';
import { buildEmissionInput } from '../parts/emission';
import { ModalHeader } from './ModalHeader';
import { ModalFooter } from './ModalFooter';
import { LiquidarViajeNotices } from './LiquidarViajeNotices';
import { LiquidarViajeBody } from './LiquidarViajeBody';
import type { SettlementRecord, TripRecord } from '../../../lib/tarifas/types';

interface Props {
  trip: TripRecord | null;
  settlement: SettlementRecord | null;
  isOpen: boolean;
  onClose: () => void;
  /** Recibe la liquidación recién emitida para poder mostrarla (desglose y PDF). */
  onSaved: (saved: SettlementRecord) => void;
}

export default function LiquidarViajeModal({ trip, settlement, isOpen, onClose, onSaved }: Props) {
  const { puedeConfigurar, extendida, setExtendida } = useLiquidadorVista();
  const simple = !extendida;
  const ctrl = useLiquidarViajeController({ trip, settlement, isOpen });
  const { calculation, totals, effectiveResult, loading, pending, saving } = ctrl;

  const handleEmitir = async () => {
    if (!calculation || !totals || !effectiveResult) return;
    if (!ctrl.validateForm(ctrl.returns)) return;
    if (!(await ctrl.recheck())) return;

    const input = buildEmissionInput(
      calculation,
      ctrl.editsUsed,
      simple ? 'Borrador' : ctrl.status,
      ctrl.notes,
      ctrl.excludedSeqs,
      ctrl.returns,
      effectiveResult,
      totals,
    );

    const saved = await ctrl.emit(input);
    if (saved) {
      onSaved(saved);
      onClose();
    }
  };

  const currency = calculation?.result.currency ?? '';
  const blocking = calculation?.blockingIssues ?? [];
  const puedeEmitir = !!calculation && !!totals && !calculation.notLiquidableReason
    && blocking.length === 0 && !loading && !pending && !saving;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={ctrl.reliquidando ? 'Re-liquidar viaje' : 'Liquidar viaje'}
      widthClass={simple ? 'max-w-3xl' : 'max-w-7xl'}
      closeOnBackdrop={false}
    >
      <ModalHeader
        reliquidando={ctrl.reliquidando}
        tripNumber={trip?.routeNumber ?? settlement?.tripNumber}
        puedeConfigurar={puedeConfigurar}
        extendida={extendida}
        onExtendidaChange={setExtendida}
        onClose={onClose}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {loading && !calculation ? (
          <div className="text-center py-20 text-slate-400"><i className="ri-loader-4-line animate-spin text-2xl" /></div>
        ) : (
          <>
            <LiquidarViajeNotices
              calculation={calculation}
              error={ctrl.error}
              loadError={ctrl.loadError}
              noLogic={ctrl.noLogic}
            />
            <LiquidarViajeBody ctrl={ctrl} simple={simple} blocking={blocking} currency={currency} />
          </>
        )}
      </div>

      <ModalFooter
        reliquidando={ctrl.reliquidando}
        saving={saving}
        puedeEmitir={puedeEmitir}
        totals={totals}
        currency={currency}
        reason={ctrl.reason}
        onSetReason={ctrl.setReason}
        onCancel={onClose}
        onEmit={handleEmitir}
      />
    </Modal>
  );
}
