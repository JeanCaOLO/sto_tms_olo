import { useTranslation } from 'react-i18next';
import AdminModal from '../../configuracion/components/AdminModal';
import Button from '../../../components/base/Button';
import { gruposPorPunto } from '../colores-parada';
import type { PlanStop, PlanTrip } from '../planes-types';

interface Props {
  trip: PlanTrip | null;
  onClose: () => void;
}

const DASH = '—';

function etiqueta(s: PlanStop): string {
  return s.customer_name || s.order_number || s.order_id.slice(0, 8);
}

// Lista los pedidos de un viaje agrupados por punto de entrega: cada punto con su
// color (el mismo de la lista y los pines) y los pedidos que se bajan ahí.
export default function ViajePedidosModal({ trip, onClose }: Props) {
  const { t } = useTranslation();
  if (!trip) return null;

  const grupos = gruposPorPunto(trip.stops);

  return (
    <AdminModal title={t('planning.viewOrders')} onClose={onClose}>
      <div className="px-6 py-4 space-y-4">
        <p className="text-xs text-slate-500">
          {grupos.length} {grupos.length === 1 ? t('planning.pointWord') : t('planning.pointsWord')} ·{' '}
          {trip.stops.length} {t('planning.ordersWord')}
        </p>
        {grupos.map((g, i) => (
          <div key={i} className="rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }}></span>
              <span className="text-xs font-semibold text-slate-700">
                {t('planning.pointWord')} {i + 1}
              </span>
              <span className="text-[11px] text-slate-400 ml-auto">
                {g.stops.length} {t('planning.ordersWord')}
              </span>
            </div>
            <ul className="px-3 py-2 space-y-1">
              {g.stops.map((s) => (
                <li key={s.order_id} className="flex items-center gap-2 text-xs text-slate-600">
                  <span
                    className="w-4 h-4 flex items-center justify-center text-white rounded-full text-[10px] font-semibold shrink-0"
                    style={{ backgroundColor: g.color }}
                  >
                    {s.stop_order}
                  </span>
                  <span className="truncate flex-1">{etiqueta(s)}</span>
                  <span className="text-slate-400 shrink-0">{s.order_number || DASH}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t('planning.close')}
        </Button>
      </div>
    </AdminModal>
  );
}
