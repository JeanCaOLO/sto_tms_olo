import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanesList } from '../use-planes-list';
import type { PlanStatus } from '../planes-types';

const FILTROS: (PlanStatus | 'all')[] = ['all', 'draft', 'confirmed', 'completed', 'cancelled'];

const BADGE: Record<PlanStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-teal-50 text-teal-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
};

function fmt(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Pestaña "Planificaciones": lista los planes por estado (GET /planes?status=)
// con acciones completar (confirmed→completed) y cancelar. Un plan confirmado
// es el único que ofrece ambas acciones; draft solo se cancela.
export default function PlanesTab() {
  const { t } = useTranslation();
  const [filtro, setFiltro] = useState<PlanStatus | 'all'>('all');
  const { planes, cargando, completar, cancelar } = usePlanesList(filtro);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer ${
              filtro === f ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t(`planning.status.${f}`)}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center h-32 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
        </div>
      ) : planes.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">{t('planning.noPlans')}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {planes.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{fmt(p.plan_date)}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.trips.length} {t('planning.tripsWord')}
                  {p.unassigned_order_numbers.length > 0 &&
                    ` · ${p.unassigned_order_numbers.length} ${t('planning.unassignedShort')}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${BADGE[p.status]}`}>
                  {t(`planning.status.${p.status}`)}
                </span>
                {p.status === 'confirmed' && (
                  <button
                    onClick={() => completar(p.id)}
                    className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                  >
                    {t('planning.complete')}
                  </button>
                )}
                {(p.status === 'draft' || p.status === 'confirmed') && (
                  <button
                    onClick={() => cancelar(p.id)}
                    className="text-xs px-2.5 py-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  >
                    {t('planning.cancel')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
