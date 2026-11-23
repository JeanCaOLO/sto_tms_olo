import { useTranslation } from 'react-i18next';
import AdminModal from '../../configuracion/components/AdminModal';
import Button from '../../../components/base/Button';
import TripMapa from './TripMapa';
import type { PlanStop } from '../planes-types';

interface Props {
  parada: PlanStop | null;
  onClose: () => void;
}

const DASH = '—';

// Detalle de una parada (el pedido que se entrega ahí). Reutiliza AdminModal del
// design system. Una sola instancia vive en PlanTripCard; aquí solo renderiza.
export default function ParadaModal({ parada, onClose }: Props) {
  const { t } = useTranslation();
  if (!parada) return null;

  const ubicacion = [parada.delivery_city, parada.delivery_zone].filter(Boolean).join(' · ') || DASH;
  const coords =
    parada.delivery_latitude != null && parada.delivery_longitude != null
      ? `${parada.delivery_latitude}, ${parada.delivery_longitude}`
      : DASH;
  const peso = parada.total_weight != null ? `${parada.total_weight} kg` : DASH;
  const volumen = parada.total_volume != null ? `${parada.total_volume} m³` : DASH;

  const tieneCoords = parada.delivery_latitude != null && parada.delivery_longitude != null;
  const filas: [string, string][] = [
    [t('planning.stopNumber'), `#${parada.stop_order}`],
    [t('planning.customer'), parada.customer_name || DASH],
    [t('planning.orderNumber'), parada.order_number || DASH],
    [t('planning.location'), ubicacion],
    [t('planning.coordinates'), coords],
    [t('planning.weight'), peso],
    [t('planning.volume'), volumen],
  ];
  if (parada.prioridad != null) {
    const etiqueta = parada.prioridad === 1 ? t('planning.priorityFalla') : t('planning.priorityRegular');
    filas.push([t('planning.priority'), `${parada.prioridad} · ${etiqueta}`]);
  }
  if (parada.observaciones) {
    filas.push([t('planning.observations'), parada.observaciones]);
  }

  return (
    <AdminModal title={t('planning.stopDetail')} onClose={onClose}>
      {parada.stop_type === 'collection' && (
        <div className="px-6 pt-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-violet-100 text-violet-800 border border-violet-300">
            <i className="ri-arrow-go-back-line"></i>{t('planning.collection')}
            {parada.return_reason && <span className="font-normal"> · {parada.return_reason}</span>}
          </span>
        </div>
      )}
      {parada.es_cliente_retira && (
        <div className="px-6 pt-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-300">
            <i className="ri-store-2-line"></i>{t('planning.clientePickup')}
          </span>
        </div>
      )}
      <dl className="px-6 py-4 space-y-3">
        {filas.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <dt className="text-slate-500 shrink-0">{label}</dt>
            <dd className="text-slate-800 font-medium text-right break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {tieneCoords && (
        <div className="px-6 pb-4">
          <TripMapa
            paradas={[{
              id: parada.order_id,
              delivery_latitude: parada.delivery_latitude as number,
              delivery_longitude: parada.delivery_longitude as number,
              stop_number: parada.stop_order,
            }]}
            alturaClase="h-[180px]"
          />
        </div>
      )}

      <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t('planning.close')}
        </Button>
      </div>
    </AdminModal>
  );
}
