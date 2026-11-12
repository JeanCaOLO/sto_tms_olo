// Un viaje con devoluciones: resumen y progreso; al abrirlo muestra sus devoluciones por parada, las acciones de recepción,
// las casillas para armar un formulario con las devoluciones elegidas y los formularios que el viaje ya tiene.
import { useEffect, useRef, useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import {
  defaultReceiveQuantity, formatRouteDate, groupBySection, isReadyToSettle, newFormView, pruneSelection, toggleGroup,
  toggleSelection, tripProgress,
} from '../../../lib/devoluciones/trips';
import type { FormView, ReturnCondition, ReturnLine, ReturnTrip } from '../../../lib/devoluciones/types';
import { getForm, receiveAll, receiveReturn } from '../api/devolucionesApi';
import ReceiveModal from '../components/ReceiveModal';
import ReturnFormModal from '../components/ReturnFormModal';
import { useTripDetail } from '../hooks/useTripDetail';
import ReturnLinesTable from './ReturnLinesTable';

interface Props {
  trip: ReturnTrip;
  canEdit: boolean;
  canPrint: boolean;
  /** El viaje cambió (se recibió algo o se creó un formulario): la página recarga el resumen y la lista. */
  onChanged: () => void;
}

type Receiving = { kind: 'line'; line: ReturnLine } | { kind: 'all' } | null;

export default function TripCard({ trip, canEdit, canPrint, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState<Receiving>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [formView, setFormView] = useState<FormView | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const formRequest = useRef(0);
  const { detail, loading, error, reload } = useTripDetail(open ? trip.route_id : null);
  const progress = tripProgress(trip);
  const ready = isReadyToSettle(trip);

  // Al plegar, cambiar de viaje o desmontar la tarjeta, una respuesta pendiente ya no debe abrir un formulario.
  useEffect(() => () => { formRequest.current++; }, [open, trip.route_id]);

  // Si otra persona le creó un formulario a una devolución marcada, deja de estar marcada.
  useEffect(() => {
    if (detail) setSelected((current) => pruneSelection(current, detail.returns));
  }, [detail]);

  const changed = () => { reload(); onChanged(); };

  const confirm = async (quantity: number | null, condition: ReturnCondition) => {
    if (receiving?.kind === 'line' && quantity !== null) await receiveReturn(receiving.line.id, quantity, condition);
    else await receiveAll(trip.route_id, condition);
    setReceiving(null);
    changed();
  };

  const openForm = async (formId: string) => {
    const request = ++formRequest.current;
    setFormError(null);
    try {
      const view = await getForm(formId);
      if (request === formRequest.current) setFormView(view);
    } catch (e) {
      if (request === formRequest.current) setFormError(e instanceof Error ? e.message : 'No se pudo abrir el formulario.');
    }
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
              {formatRouteDate(trip.route_date)}{trip.carrier_name ? ` · ${trip.carrier_name}` : ''}{trip.driver_name ? ` · ${trip.driver_name}` : ''}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-3">
          {trip.forms_count > 0 && (
            <span className="text-xs text-slate-500">{trip.forms_count} {trip.forms_count === 1 ? 'formulario' : 'formularios'}</span>
          )}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.forms.map((form) => (
                    <button key={form.id} type="button" onClick={() => openForm(form.id)}
                      className="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      title="Abrir el formulario">
                      <i className="ri-file-list-3-line mr-1" aria-hidden="true" />
                      {form.form_number} · {form.returns_count} {form.returns_count === 1 ? 'devolución' : 'devoluciones'}
                    </button>
                  ))}
                  {detail.forms.length === 0 && <span className="text-xs text-slate-500">Sin formularios todavía.</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button size="sm" variant="secondary" disabled={selected.size === 0}
                      onClick={() => { formRequest.current++; setFormError(null); setFormView(newFormView(detail, selected)); }}>
                      <i className="ri-file-add-line" aria-hidden="true" />Crear formulario ({selected.size})
                    </Button>
                  )}
                  {canEdit && detail.trip.pending_returns > 0 && (
                    <Button size="sm" variant="success" onClick={() => setReceiving({ kind: 'all' })}>
                      <i className="ri-check-double-line" aria-hidden="true" />Recibir todas
                    </Button>
                  )}
                </div>
              </div>
              {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
              <ReturnLinesTable groups={groupBySection(detail.returns, detail.sections)} canReceive={canEdit} onReloadPhotos={reload}
                onReceive={(line) => setReceiving({ kind: 'line', line })}
                selection={canEdit ? {
                  selected,
                  onToggle: (line) => setSelected((current) => toggleSelection(current, line.id)),
                  onToggleGroup: (lines) => setSelected((current) => toggleGroup(current, lines)),
                } : undefined} />
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
      {formView && (
        <ReturnFormModal detail={formView} canEdit={canEdit} canPrint={canPrint}
          onClose={() => { formRequest.current++; setFormView(null); }}
          onSaved={(saved) => {
            // Un formulario recién creado deja de estar "marcado" y pasa a la lista del viaje.
            if (!formView.form) setSelected(new Set());
            setFormView(saved);
            changed();
          }} />
      )}
    </Card>
  );
}
