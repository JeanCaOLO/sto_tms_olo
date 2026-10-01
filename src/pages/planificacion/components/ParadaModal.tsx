import { useTranslation } from 'react-i18next';
import AdminModal from '../../configuracion/components/AdminModal';
import Button from '../../../components/base/Button';
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

  const filas: [string, string][] = [
    [t('planning.customer'), parada.customer_name || DASH],
    [t('planning.orderNumber'), parada.order_number || DASH],
    [t('planning.location'), ubicacion],
    [t('planning.coordinates'), coords],
    [t('planning.weight'), peso],
    [t('planning.volume'), volumen],
  ];

  return (
    <AdminModal title={t('planning.stopDetail')} onClose={onClose}>
      <dl className="px-6 py-4 space-y-3">
        {filas.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <dt className="text-slate-500 shrink-0">{label}</dt>
            <dd className="text-slate-800 font-medium text-right break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t('planning.close')}
        </Button>
      </div>
    </AdminModal>
  );
}
