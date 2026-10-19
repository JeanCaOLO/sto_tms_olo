import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanesList } from '../use-planes-list';
import DetalleModal from './DetalleModal';
import VistaTabla from './VistaTabla';
import type { PlanStatus, RoutePlan } from '../planes-types';

const FILTROS: (PlanStatus | 'all')[] = ['all', 'draft', 'confirmed', 'completed', 'cancelled'];

// Punto de color por estado (para que los filtros se lean de un vistazo).
const ESTADO_DOT: Record<PlanStatus, string> = {
  draft: 'bg-slate-400',
  confirmed: 'bg-teal-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

// Un plan entra en "Completadas"/"Canceladas" si tiene ≥1 viaje en ese estado
// (completar/cancelar es por viaje); "Borrador"/"Confirmado" es estado del plan.
function coincideEstado(p: RoutePlan, filtro: PlanStatus | 'all'): boolean {
  if (filtro === 'all') return true;
  if (filtro === 'completed') return p.trips.some((tr) => tr.status === 'completed');
  if (filtro === 'cancelled') return p.trips.some((tr) => tr.status === 'cancelled');
  return p.status === filtro;
}

// Pestaña "Planificaciones": misma vista tipo tabla del calendario (zonas×días)
// sobre los planes REALES de Aurora, con filtro por estado y por fecha. Abrir una
// celda reusa DetalleModal (mapa + paradas + pedidos + artículos).
export default function PlanesTab() {
  const { t } = useTranslation();
  const { planes, cargando, recargar } = usePlanesList();
  const [filtro, setFiltro] = useState<PlanStatus | 'all'>('all');
  const [fecha, setFecha] = useState('');
  const [detalle, setDetalle] = useState<{ fechaISO: string; zonaCodigo: string } | null>(null);

  const visibles = useMemo(
    () => planes.filter((p) => coincideEstado(p, filtro) && (!fecha || p.plan_date === fecha)),
    [planes, filtro, fecha],
  );
  const dias = useMemo(
    () => [...new Set(visibles.map((p) => p.plan_date))].sort().map((iso) => new Date(`${iso}T00:00:00`)),
    [visibles],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
                filtro === f ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${filtro === f ? 'bg-white' : f !== 'all' ? ESTADO_DOT[f] : 'bg-slate-400'}`}></span>
              {t(`planning.status.${f}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label={t('planning.day')}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 cursor-pointer"
          />
          {fecha && (
            <button
              onClick={() => setFecha('')}
              aria-label={t('planning.close')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          )}
        </div>
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
        <VistaTabla planes={visibles} dias={dias} onAbrirCelda={(f, z) => setDetalle({ fechaISO: f, zonaCodigo: z })} />
      )}

      {detalle && (
        <DetalleModal
          planes={visibles}
          fechaISO={detalle.fechaISO}
          zonaCodigo={detalle.zonaCodigo}
          onClose={() => setDetalle(null)}
          onRecargar={recargar}
        />
      )}
    </div>
  );
}
