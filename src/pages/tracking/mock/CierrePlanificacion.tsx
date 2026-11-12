import { useTranslation } from 'react-i18next';
import Button from '../../../components/base/Button';
import { notify } from '../../../lib/notify';
import { simPlanClose } from './sim';

interface Props {
  tripId: string;
  onDone: () => void;
}

/**
 * Solo modo mock (la página lo carga en diferido): simula que Planificación termina o cancela el viaje, para ver
 * cómo lo muestra Tracking. En real esto se hace en Planificación; Tracking solo lo lee.
 */
export default function CierrePlanificacion({ tripId, onDone }: Props) {
  const { t } = useTranslation();
  const close = (as: 'completed' | 'cancelled') => {
    simPlanClose(tripId, as);
    notify(t(as === 'completed' ? 'tracking.mockClosedCompleted' : 'tracking.mockClosedCancelled'), 'success');
    onDone();
  };
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      <p className="mb-2">{t('tracking.mockPlanTitle')}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => close('completed')}>{t('tracking.mockPlanComplete')}</Button>
        <Button size="sm" variant="secondary" onClick={() => close('cancelled')}>{t('tracking.mockPlanCancel')}</Button>
      </div>
    </div>
  );
}
