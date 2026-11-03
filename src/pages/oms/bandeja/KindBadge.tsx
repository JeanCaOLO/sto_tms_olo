import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import type { BandejaOrder } from './bandeja-api';

// Etiqueta del tipo: delivery (pedido) o pickup (devolución, resaltada).
export default function KindBadge({ order }: { order: BandejaOrder }) {
  const { t } = useTranslation();
  return order.kind === 'pickup'
    ? <Badge variant="warning" size="sm"><i className="ri-arrow-go-back-line mr-1"></i>{t('omsBandeja.kindReturn')}</Badge>
    : <Badge size="sm">{t('omsBandeja.kindDelivery')}</Badge>;
}
