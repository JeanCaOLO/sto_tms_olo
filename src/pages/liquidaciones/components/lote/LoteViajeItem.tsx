// Un viaje dentro del lote: una fila con el resumen y, al desplegarla, el mismo cuerpo del modal de un viaje.

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { BASE_METHODS } from '../../../../lib/tarifas/baseMethods';
import { formatMoney } from '../../../../lib/tarifas/format';
import { useEmitTrip } from '../../hooks/useEmitTrip';
import { useLiquidarViajeController } from '../../hooks/useLiquidarViajeController';
import { LiquidarViajeBody } from '../LiquidarViajeBody';
import { LiquidarViajeNotices } from '../LiquidarViajeNotices';
import type { SettlementRecord, TripRecord } from '../../../../lib/tarifas/types';

export interface LoteItemHandle {
  /** null = no se emitió; el motivo queda visible en la fila. */
  emitir: () => Promise<SettlementRecord | null>;
}

export interface LoteItemSummary {
  total: string | null;
  currency: string;
  /** Se puede emitir ahora mismo. */
  ready: boolean;
  saved: SettlementRecord | null;
}

interface Props {
  trip: TripRecord;
  simple: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReport: (tripId: string, summary: LoteItemSummary) => void;
}

type Estado = { text: string; tone: string; icon: string };

function estadoDe(args: {
  saved: SettlementRecord | null; error: string; loading: boolean; blocked: string | null; saving: boolean;
}): Estado {
  if (args.saved) return { text: `Emitida ${args.saved.number}`, tone: 'text-emerald-700 bg-emerald-50', icon: 'ri-check-line' };
  if (args.saving) return { text: 'Guardando…', tone: 'text-slate-600 bg-slate-100', icon: 'ri-loader-4-line animate-spin' };
  if (args.error) return { text: 'Revisar', tone: 'text-red-700 bg-red-50', icon: 'ri-error-warning-line' };
  if (args.loading) return { text: 'Calculando…', tone: 'text-slate-600 bg-slate-100', icon: 'ri-loader-4-line animate-spin' };
  if (args.blocked) return { text: 'Bloqueado', tone: 'text-amber-700 bg-amber-50', icon: 'ri-lock-line' };
  return { text: 'Listo', tone: 'text-teal-700 bg-teal-50', icon: 'ri-checkbox-circle-line' };
}

export const LoteViajeItem = forwardRef<LoteItemHandle, Props>(function LoteViajeItem(
  { trip, simple, expanded, onToggle, onReport }, ref,
) {
  const ctrl = useLiquidarViajeController({ trip, settlement: null, isOpen: true });
  const { emitir, puedeEmitir, blocking } = useEmitTrip(ctrl, simple);
  const [saved, setSaved] = useState<SettlementRecord | null>(null);
  const { calculation, totals, loading, pending, saving, error } = ctrl;

  useImperativeHandle(ref, () => ({
    emitir: async () => {
      if (saved) return saved;
      const result = await emitir();
      if (result) setSaved(result);
      return result;
    },
  }));

  const currency = calculation?.result.currency ?? '';
  const total = totals?.total ?? null;
  const ready = puedeEmitir && !saved;
  useEffect(() => {
    onReport(trip.id, { total, currency, ready, saved });
  }, [trip.id, total, currency, ready, saved, onReport]);

  const blocked = calculation?.notLiquidableReason ?? blocking[0]?.message ?? null;
  const estado = estadoDe({ saved, error, loading: loading || pending, blocked, saving });
  const baseMethod = calculation?.result.base?.method;
  const modalidad = calculation?.trip.isOwnFleet ? 'Flota propia' : baseMethod ? BASE_METHODS[baseMethod].label : null;

  return (
    <li className="border border-slate-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-slate-50 rounded-lg"
      >
        <i className={`${expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-slate-400`} />
        <span className="font-mono text-xs text-teal-700">{trip.routeNumber}</span>
        <span className="text-sm text-slate-700 truncate max-w-[220px]">{trip.carrierName ?? '—'}</span>
        {modalidad && (
          <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full" title="Forma de cobro del viaje">
            {modalidad}
          </span>
        )}
        {calculation?.contract?.expired && (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full" title="El contrato del transportista venció">
            Contrato vencido
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {total !== null && (
            <span className="text-sm font-medium text-slate-800">{formatMoney(total, currency)}</span>
          )}
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${estado.tone}`}>
            <i className={estado.icon} />{estado.text}
          </span>
        </span>
      </button>
      {!expanded && !saved && (error || blocked) && (
        <p className="px-4 pb-3 -mt-1 text-xs text-slate-500 truncate" title={error || blocked || ''}>{error || blocked}</p>
      )}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4">
          {saved ? (
            <p className="text-sm text-emerald-700">Liquidación {saved.number} emitida. Quedó en el Historial.</p>
          ) : loading && !calculation ? (
            <div className="text-center py-10 text-slate-400"><i className="ri-loader-4-line animate-spin text-2xl" /></div>
          ) : (
            <>
              <LiquidarViajeNotices calculation={calculation} error={ctrl.error} loadError={ctrl.loadError} noLogic={ctrl.noLogic} />
              <LiquidarViajeBody ctrl={ctrl} simple={simple} blocking={blocking} currency={currency} />
            </>
          )}
        </div>
      )}
    </li>
  );
});
