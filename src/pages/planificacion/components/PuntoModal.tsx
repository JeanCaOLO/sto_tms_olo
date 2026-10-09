import { useTranslation } from 'react-i18next';
import AdminModal from '../../configuracion/components/AdminModal';
import type { PlanStop } from '../planes-types';

interface Props {
  // Pedidos que comparten el mismo punto de entrega (mismas coordenadas).
  stops: PlanStop[] | null;
  color?: string;
  onVerDetalle: (stop: PlanStop) => void;
  onClose: () => void;
}

const DASH = '—';

function etiqueta(s: PlanStop): string {
  return s.customer_name || s.order_number || s.order_id.slice(0, 8);
}

// Cuando un punto del mapa tiene varios pedidos (misma coordenada), en vez de
// abrir uno "al azar" se muestra la lista como tabla; al tocar una fila se abre
// el detalle de ese pedido (ParadaModal, que se renderiza encima).
export default function PuntoModal({ stops, color, onVerDetalle, onClose }: Props) {
  const { t } = useTranslation();
  if (!stops || stops.length === 0) return null;

  const ubicacion = [stops[0].delivery_city, stops[0].delivery_zone].filter(Boolean).join(' · ') || DASH;

  return (
    <AdminModal title={t('planning.pointOrders')} onClose={onClose}>
      <div className="px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }}></span>
          <span className="text-sm font-medium text-slate-700">{ubicacion}</span>
          <span className="text-[11px] text-slate-400 ml-auto">
            {stops.length} {t('planning.ordersWord')}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-2">{t('planning.pointOrdersHint')}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="py-1.5 pr-2 font-medium w-8">#</th>
              <th className="py-1.5 pr-2 font-medium">{t('planning.customer')}</th>
              <th className="py-1.5 pr-2 font-medium">{t('planning.orderNumber')}</th>
              <th className="py-1.5 pl-2 font-medium text-right">{t('planning.weight')}</th>
            </tr>
          </thead>
          <tbody>
            {stops.map((s) => (
              <tr
                key={s.id || s.order_id}
                role="button"
                tabIndex={0}
                onClick={() => onVerDetalle(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onVerDetalle(s);
                  }
                }}
                className="border-b border-slate-50 cursor-pointer hover:bg-slate-50"
              >
                <td className="py-2 pr-2">
                  <span
                    className="w-5 h-5 flex items-center justify-center text-white rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: color }}
                  >
                    {s.stop_order}
                  </span>
                </td>
                <td className="py-2 pr-2 text-slate-800 font-medium truncate max-w-[9rem]">{etiqueta(s)}</td>
                <td className="py-2 pr-2 text-slate-500 font-mono text-xs">{s.order_number || DASH}</td>
                <td className="py-2 pl-2 text-right text-slate-600">
                  {s.total_weight != null ? `${s.total_weight} kg` : DASH}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminModal>
  );
}
