import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanesList } from '../use-planes-list';
import { useZonasNombre } from '../use-zonas-nombre';
import PlanTripCard from './PlanTripCard';
import type { PlanStatus, RoutePlan } from '../planes-types';

const FILTROS: (PlanStatus | 'all')[] = ['all', 'draft', 'confirmed', 'completed', 'cancelled'];

// Punto de color + estilo del pill por estado (para que los filtros y los
// badges lean de un vistazo).
const ESTADO_UI: Record<PlanStatus, { badge: string; dot: string }> = {
  draft: { badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  confirmed: { badge: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
  completed: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
};

function fmt(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Pestaña "Planificaciones": cada plan es una tarjeta desplegable que muestra
// fecha, estado, rutas y paradas; al expandir, cada ruta con su mapa. Las
// acciones (completar/cancelar) viven en la cabecera de cada plan.
export default function PlanesTab() {
  const { t } = useTranslation();
  const [filtro, setFiltro] = useState<PlanStatus | 'all'>('all');
  const { planes, cargando, recargar } = usePlanesList();

  // El filtro opera sobre el estado de los VIAJES (completar/cancelar es por
  // viaje): un plan entra en "Completadas"/"Canceladas" si tiene ≥1 viaje en ese
  // estado. "Borrador"/"Confirmado" siguen siendo el ciclo de vida del plan.
  const visibles = planes.filter((p) => {
    if (filtro === 'all') return true;
    if (filtro === 'completed') return p.trips.some((t) => t.status === 'completed');
    if (filtro === 'cancelled') return p.trips.some((t) => t.status === 'cancelled');
    return p.status === filtro;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = filtro === f;
          const dot = f !== 'all' ? ESTADO_UI[f].dot : 'bg-slate-400';
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
                activo ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activo ? 'bg-white' : dot}`}></span>
              {t(`planning.status.${f}`)}
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center h-32 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-14 flex flex-col items-center gap-2 text-slate-400">
          <i className="ri-inbox-line text-3xl"></i>
          <p className="text-sm">{t('planning.noPlans')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => (
            <PlanCard key={p.id} plan={p} onViajeActualizado={recargar} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  onViajeActualizado,
}: {
  plan: RoutePlan;
  onViajeActualizado: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { nombreDe } = useZonasNombre();
  const [abierto, setAbierto] = useState(false);

  const ui = ESTADO_UI[plan.status];
  const paradas = plan.trips.reduce((acc, trip) => acc + trip.stops.length, 0);
  const completados = plan.trips.filter((tr) => tr.status === 'completed').length;
  const cancelados = plan.trips.filter((tr) => tr.status === 'cancelled').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
        >
          <i
            className={`ri-arrow-right-s-line text-xl text-slate-400 transition-transform shrink-0 ${abierto ? 'rotate-90' : ''}`}
          ></i>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 capitalize truncate">{fmt(plan.plan_date)}</p>
            <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
              <span><i className="ri-route-line mr-1"></i>{plan.trips.length} {t('planning.routesWord')}</span>
              <span><i className="ri-map-pin-line mr-1"></i>{paradas} {t('planning.stopsWord')}</span>
              {completados > 0 && (
                <span className="text-emerald-600">
                  <i className="ri-check-double-line mr-1"></i>{completados} {t('planning.status.completed').toLowerCase()}
                </span>
              )}
              {cancelados > 0 && (
                <span className="text-red-600">
                  <i className="ri-close-line mr-1"></i>{cancelados} {t('planning.status.cancelled').toLowerCase()}
                </span>
              )}
              {plan.unassigned_order_numbers.length > 0 && (
                <span className="text-amber-600">
                  <i className="ri-alert-line mr-1"></i>{plan.unassigned_order_numbers.length} {t('planning.unassignedShort')}
                </span>
              )}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${ui.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ui.dot}`}></span>
            {t(`planning.status.${plan.status}`)}
          </span>
        </div>
      </div>

      {abierto && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          {plan.trips.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">{t('planning.noStops')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plan.trips.map((trip, i) => (
                <PlanTripCard
                  key={trip.id}
                  trip={trip}
                  indice={i}
                  zonaNombre={nombreDe(trip.delivery_zone)}
                  editable={false}
                  destinos={[]}
                  onMover={() => {}}
                  onViajeActualizado={onViajeActualizado}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
