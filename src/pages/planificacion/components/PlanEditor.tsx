import { useTranslation } from 'react-i18next';
import { usePlanes } from '../use-planes';
import { useZonasNombre } from '../use-zonas-nombre';
import type { MockContext } from '../planes-api';
import PlanTripCard from './PlanTripCard';
import type { PlanStatus } from '../planes-types';

interface Props {
  fecha: string;
  pedidosCount: number;
  vehiculosCount: number;
  ctx: MockContext;
  disabled?: boolean;
  onConfirmed?: () => void;
}

const ESTADO_LABEL: Record<PlanStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

// Vista "Generar plan": botón que arma y persiste el draft (POST /planes),
// render de los viajes con sus paradas en secuencia, edición (mover pedidos
// entre viajes → PUT) y confirmación (draft→confirmed). Solo editable en draft.
export default function PlanEditor({ fecha, pedidosCount, vehiculosCount, ctx, disabled, onConfirmed }: Props) {
  const { t } = useTranslation();
  const { plan, generando, guardando, generar, mover, confirmar } = usePlanes({ fecha, ctx });
  const { nombreDe } = useZonasNombre();
  const editable = plan?.status === 'draft';

  const confirmarPlan = async () => {
    await confirmar();
    onConfirmed?.();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            <strong>{pedidosCount}</strong> {t('planning.ordersWord')} · <strong>{vehiculosCount}</strong> {t('planning.vehiclesWord')}
          </p>
          {plan && (
            <p className="text-sm font-semibold text-slate-800 mt-1">
              {t('planning.planStatus')}: <span className="text-teal-700">{ESTADO_LABEL[plan.status]}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generar}
            disabled={generando || disabled || pedidosCount === 0}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-2"
          >
            <i className={generando ? 'ri-loader-4-line animate-spin' : 'ri-route-line'}></i>
            {generando ? t('planning.generating') : t('planning.generate')}
          </button>
          {editable && (
            <button
              onClick={confirmarPlan}
              disabled={guardando}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-2"
            >
              <i className="ri-check-double-line"></i>{t('planning.confirm')}
            </button>
          )}
        </div>
      </div>

      {disabled && (
        <p className="text-center text-sm text-slate-400 py-6">{t('planning.selectContext')}</p>
      )}

      {plan && plan.trips.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plan.trips.map((trip, i) => (
            <PlanTripCard
              key={trip.id}
              trip={trip}
              indice={i}
              zonaNombre={nombreDe(trip.delivery_zone)}
              editable={Boolean(editable) && !guardando}
              destinos={plan.trips
                .filter((o) => o.id !== trip.id)
                .map((o) => ({ id: o.id, label: nombreDe(o.delivery_zone) || o.delivery_zone }))}
              onMover={(orderId, toTripId) => mover(orderId, trip.id, toTripId)}
            />
          ))}
        </div>
      )}

      {plan && plan.unassigned_order_numbers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <i className="ri-alert-line"></i>
            {plan.unassigned_order_numbers.length} {t('planning.unassigned')}
          </p>
          <p className="text-xs text-amber-700 mt-1">{t('planning.unassignedHint')}</p>
        </div>
      )}
    </div>
  );
}
