import { useTranslation } from 'react-i18next';
import type { PlanStop } from '../planes-types';

// Etiquetas compactas de una parada en la tarjeta del viaje: recolecta de devolución
// y cliente retira.
export default function StopBadges({ stop }: { stop: PlanStop }) {
  const { t } = useTranslation();
  return (
    <>
      {stop.stop_type === 'collection' && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800" title={t('planning.collection')}>
          <i className="ri-arrow-go-back-line"></i>{t('planning.collectionShort')}
        </span>
      )}
      {stop.es_cliente_retira && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title={t('planning.clientePickup')}>
          <i className="ri-store-2-line"></i>{t('planning.clientePickupShort')}
        </span>
      )}
    </>
  );
}
