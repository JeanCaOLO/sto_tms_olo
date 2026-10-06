import { useTranslation } from 'react-i18next';
import { usePlanes } from '../use-planes';
import { useNuevosPedidos } from '../use-nuevos-pedidos';
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

// "2026-09-22" -> "lunes, 22 de septiembre" (mediodía local para evitar corrimiento de zona).
function formatearDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Vista "Generar plan": botón que arma y persiste el draft (POST /planes),
// render de los viajes con sus paradas en secuencia, edición (mover pedidos
// entre viajes → PUT) y confirmación (draft→confirmed). Solo editable en draft.
export default function PlanEditor({ fecha, pedidosCount, vehiculosCount, ctx, disabled, onConfirmed }: Props) {
  const { t } = useTranslation();
  const { plan, generando, guardando, generar, mover, confirmar } = usePlanes({ fecha, ctx });
  const { nombreDe } = useZonasNombre();
  const editable = plan?.status === 'draft';

  // Pedidos que consideró el plan actual (paradas + sin-asignar). Base para
  // detectar pedidos nuevos que llegaron DESPUÉS de generar → hay que regenerar.
  const pedidosEnPlan = plan
    ? plan.trips.reduce((acc, tr) => acc + tr.stops.length, 0) + plan.unassigned_order_numbers.length
    : null;
  const nuevosPedidos = useNuevosPedidos(fecha, pedidosEnPlan);

  const confirmarPlan = async () => {
    await confirmar();
    onConfirmed?.();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-slate-800 capitalize flex items-center gap-2">
            <i className="ri-calendar-event-line text-teal-600"></i>
            {formatearDia(fecha)}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
              <i className="ri-shopping-bag-3-line"></i>{pedidosCount} {t('planning.ordersWord')}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
              <i className="ri-truck-line"></i>{vehiculosCount} {t('planning.vehiclesWord')}
            </span>
            {plan && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                <i className="ri-flag-line"></i>{ESTADO_LABEL[plan.status]}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              data-testid="generar-plan"
              onClick={generar}
              disabled={generando || disabled || pedidosCount === 0}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-2 ${
                nuevosPedidos > 0 && !generando
                  ? 'bg-amber-500 hover:bg-amber-600 animate-pulse'
                  : 'bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300'
              }`}
            >
              <i className={generando ? 'ri-loader-4-line animate-spin' : plan ? 'ri-refresh-line' : 'ri-route-line'}></i>
              {generando ? t('planning.generating') : t(plan ? 'planning.regenerate' : 'planning.generate')}
            </button>
            {nuevosPedidos > 0 && !generando && (
              <span
                data-testid="nuevos-pedidos-badge"
                title={t('planning.newOrders', { count: nuevosPedidos })}
                className="absolute -top-2 -right-2 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold shadow"
              >
                {nuevosPedidos}
              </span>
            )}
          </div>
          {editable && (
            <button
              data-testid="confirmar-plan"
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

      {!disabled && pedidosCount === 0 && !plan && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <i className="ri-inbox-line text-amber-500 text-xl mt-0.5"></i>
          <div>
            <p className="text-sm font-semibold text-amber-800">No hay pedidos para este día</p>
            <p className="text-xs text-amber-700 mt-0.5">
              No se puede generar un plan sin pedidos. Elegí otro día en el selector de arriba.
            </p>
          </div>
        </div>
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

      {plan && (plan.unassigned_order_numbers?.length ?? 0) > 0 && (
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
