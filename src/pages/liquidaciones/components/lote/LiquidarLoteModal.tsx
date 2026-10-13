// Liquidar varios viajes de una vez: una fila por viaje (desplegable, con todo lo del modal de un viaje)
// y un solo botón para emitirlos. Cada viaje se emite por separado: los que fallen quedan abiertos.

import { useCallback, useMemo, useRef, useState } from 'react';
import Button from '../../../../components/base/Button';
import Modal from '../../../../components/base/Modal';
import { formatMoney } from '../../../../lib/tarifas/format';
import { sumMoney, toMoney } from '../../../../lib/tarifas/money';
import { useLiquidadorVista } from '../../hooks/useLiquidadorVista';
import { InterruptorVista } from '../InterruptorVista';
import { LoteViajeItem, type LoteItemHandle, type LoteItemSummary } from './LoteViajeItem';
import type { SettlementRecord, TripRecord } from '../../../../lib/tarifas/types';

interface Props {
  trips: TripRecord[] | null;
  onClose: () => void;
  /** Tras cada tanda de emisión. `todas` = ya no queda ningún viaje por emitir. */
  onEmitted: (saved: SettlementRecord[], todas: boolean) => void;
}

export default function LiquidarLoteModal({ trips, onClose, onEmitted }: Props) {
  const { puedeConfigurar, extendida, setExtendida } = useLiquidadorVista();
  const simple = !extendida;
  const handles = useRef<Record<string, LoteItemHandle | null>>({});
  const [summaries, setSummaries] = useState<Record<string, LoteItemSummary>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  const onReport = useCallback((id: string, summary: LoteItemSummary) => {
    setSummaries((prev) => ({ ...prev, [id]: summary }));
  }, []);

  const lista = trips ?? [];
  const listos = lista.filter((t) => summaries[t.id]?.ready);
  const pendientes = lista.filter((t) => !summaries[t.id]?.saved);
  // Si el lote mezclara monedas (países distintos), sumar no tendría sentido: no se muestra total.
  const monedas = new Set(listos.map((t) => summaries[t.id]?.currency));
  const currency = monedas.size === 1 ? [...monedas][0] ?? '' : '';
  const total = useMemo(
    () => toMoney(sumMoney(listos.map((t) => summaries[t.id]?.total ?? '0'))),
    [listos, summaries],
  );

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const emitirTodos = async () => {
    setRunning(true);
    const saved: SettlementRecord[] = [];
    const fallidos: string[] = [];
    try {
      for (const trip of listos) {
        const result = await handles.current[trip.id]?.emitir();
        if (result) saved.push(result);
        else fallidos.push(trip.id);
      }
    } finally {
      setRunning(false);
    }
    // Los que fallaron se abren solos para ver el motivo y corregirlos.
    if (fallidos.length) setExpanded((prev) => new Set([...prev, ...fallidos]));
    const quedan = pendientes.length - saved.length;
    if (saved.length) onEmitted(saved, quedan === 0);
    if (quedan === 0) onClose();
  };

  const cerrar = () => { if (!running) onClose(); };

  return (
    <Modal
      isOpen={!!trips}
      onClose={cerrar}
      title="Liquidar viajes"
      widthClass={simple ? 'max-w-4xl' : 'max-w-7xl'}
      closeOnBackdrop={false}
    >
      <div className="shrink-0 bg-white flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Liquidar {lista.length} viaje{lista.length === 1 ? '' : 's'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Despliega un viaje para revisarlo o editarlo. Cada uno se emite por separado.
          </p>
        </div>
        {puedeConfigurar && <InterruptorVista extendida={extendida} onChange={setExtendida} />}
        <button onClick={cerrar} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
          <i className="ri-close-line text-xl" />
        </button>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
        {lista.map((trip) => (
          <LoteViajeItem
            key={trip.id}
            ref={(h) => { handles.current[trip.id] = h; }}
            trip={trip}
            simple={simple}
            expanded={expanded.has(trip.id)}
            onToggle={() => toggle(trip.id)}
            onReport={onReport}
          />
        ))}
      </ul>

      <div className="shrink-0 bg-white flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          {listos.length > 0 && monedas.size === 1 && (
            <>Total a pagar: <strong className="text-teal-700">{formatMoney(total, currency)}</strong></>
          )}
          {listos.length < pendientes.length && (
            <span className="ml-3 text-xs text-amber-700">
              {pendientes.length - listos.length} sin poder emitirse aún (bloqueados, con error o calculando).
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={cerrar} disabled={running}>Cancelar</Button>
          <Button onClick={() => void emitirTodos()} disabled={running || listos.length === 0}>
            <i className="ri-save-line mr-1" />
            {running ? 'Guardando…' : `Emitir ${listos.length} liquidaci${listos.length === 1 ? 'ón' : 'ones'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
