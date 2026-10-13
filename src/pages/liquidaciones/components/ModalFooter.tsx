// Modal footer with action buttons and total.

import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import { formatMoney } from '../../../lib/tarifas/format';
import type { SettlementTotals } from '../../../lib/tarifas/settlementTotals';

interface Props {
  reliquidando: boolean;
  saving: boolean;
  puedeEmitir: boolean;
  totals: SettlementTotals | null;
  currency: string;
  reason: string;
  onSetReason: (reason: string) => void;
  onCancel: () => void;
  onEmit: () => Promise<void>;
}

export function ModalFooter({
  reliquidando,
  saving,
  puedeEmitir,
  totals,
  currency,
  reason,
  onSetReason,
  onCancel,
  onEmit,
}: Props) {
  return (
    <div className="shrink-0 bg-white flex flex-col items-end justify-between px-6 py-4 border-t border-slate-200 gap-3">
      {reliquidando && (
        <Input
          label="Motivo de la re-liquidación *"
          value={reason}
          onChange={(e) => onSetReason(e.target.value)}
          placeholder="Por qué se vuelve a liquidar este viaje"
          className="w-full"
        />
      )}
      <div className="flex items-center justify-between w-full gap-4">
        <div className="text-sm">
          {totals && (
            <span className="text-slate-600">
              Total a pagar: <strong className="text-teal-700">{formatMoney(totals.total, currency)}</strong>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void onEmit()} disabled={!puedeEmitir}>
            <i className="ri-save-line mr-1" />
            {saving ? 'Guardando…' : reliquidando ? 'Re-liquidar' : 'Emitir liquidación'}
          </Button>
        </div>
      </div>
    </div>
  );
}
