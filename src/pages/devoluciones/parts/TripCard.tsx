// Un viaje con devoluciones: resumen y progreso; al abrirlo muestra sus devoluciones por parada y las acciones de recepción.
import { useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import { defaultReceiveQuantity, groupBySection, isReadyToSettle, tripProgress } from '../../../lib/devoluciones/trips';
import type { ReturnCondition, ReturnLine, ReturnTrip } from '../../../lib/devoluciones/types';
import { receiveAll, receiveReturn } from '../api/devolucionesApi';
import ReceiveModal from '../components/ReceiveModal';
import ReturnFormModal from '../components/ReturnFormModal';
import { useTripDetail } from '../hooks/useTripDetail';
import ReturnLinesTable from './ReturnLinesTable';

interface Props {
  trip: ReturnTrip;
  canEdit: boolean;
  canPrint: boolean;
  /** El viaje cambió (se recibió algo): la página recarga el resumen y la lista. */
  onChanged: () => void;
}

type Receiving = { kind: 'line'; line: ReturnLine } | { kind: 'all' } | null;

export default function TripCard({ trip, canEdit, canPrint, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState<Receiving>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { detail, loading, error, reload } = useTripDetail(open ? trip.route_id : null);
  const progress = tripProgress(trip);
  const ready = isReadyToSettle(trip);

  const changed = () => { reload(); onChanged(); };

  const confirm = async (quantity: number | null, condition: ReturnCondition) => {
    if (receiving?.kind === 'line' && quantity !== null) await receiveReturn(receiving.line.id, quantity, condition);
    else await receiveAll(trip.route_id, condition);
    setReceiving(null);
    changed();
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="flex flex-1 cursor-pointer items-center gap-3 text-left" aria-expanded={open}
          onClick={() => setOpen((o) => !o)}>
          <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line text-xl text-slate-500`} aria-hidden="true" />
          <div>
            <div className="font-medium text-slate-900">Viaje {trip.route_number}</div>
            <div className="text-xs text-slate-500">
              {trip.route_date}{trip.carrier_name ? ` · ${trip.carrier_name}` : ''}{trip.driver_name ? ` · ${trip.driver_name}` : ''}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-3">
          {trip.form_number && <span className="font-mono text-xs text-slate-500">{trip.form_number}</span>}
          <span className="text-sm text-slate-600">{progress.label} recibidas</span>
          {ready
            ? <Badge variant="success">Listo para liquidar</Badge>
            : <Badge variant="warning">{trip.pending_returns} por recibir</Badge>}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {loading && !detail && <p role="status" className="text-sm text-slate-500">Cargando…</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {detail && (
            <>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setFormOpen(true)}>
                  <i className="ri-file-list-3-line" aria-hidden="true" />Formulario
                </Button>
                {canEdit && detail.trip.pending_returns > 0 && (
                  <Button size="sm" variant="success" onClick={() => setReceiving({ kind: 'all' })}>
                    <i className="ri-check-double-line" aria-hidden="true" />Recibir todas
                  </Button>
                )}
              </div>
              <ReturnLinesTable groups={groupBySection(detail.returns, detail.sections)} canReceive={canEdit}
                onReceive={(line) => setReceiving({ kind: 'line', line })} />
              {ready && <p className="text-sm text-emerald-700">Todas las devoluciones están recibidas: el viaje ya puede liquidarse.</p>}
            </>
          )}
        </div>
      )}

      <ReceiveModal
        isOpen={receiving !== null}
        title={receiving?.kind === 'line' ? `Recibir ${receiving.line.return_number}` : 'Recibir todas las devoluciones del viaje'}
        description={receiving?.kind === 'all'
          ? 'Se marcan como recibidas todas las pendientes, con la cantidad que registró el conductor.'
          : undefined}
        initialQuantity={receiving?.kind === 'line' ? defaultReceiveQuantity(receiving.line) : null}
        onClose={() => setReceiving(null)}
        onConfirm={confirm}
      />
      {formOpen && detail && (
        <ReturnFormModal detail={detail} canEdit={canEdit} canPrint={canPrint} onClose={() => setFormOpen(false)}
          onSaved={() => { reload(); onChanged(); }} />
      )}
    </Card>
  );
}
