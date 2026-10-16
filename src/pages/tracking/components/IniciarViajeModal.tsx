import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/base/Button';
import Modal from '../../../components/base/Modal';
import { notify } from '../../../lib/notify';
import { iniciarViaje, listPlanificados } from '../api';
import type { ViajePlanificado } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStarted: (routeId: string) => void;
}

/** Viajes de planes confirmados que todavía no se han iniciado; "Iniciar" los pasa a seguimiento en vivo. */
export default function IniciarViajeModal({ isOpen, onClose, onStarted }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ViajePlanificado[] | null>(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(await listPlanificados());
    } catch {
      setError(true);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (isOpen) { setItems(null); void load(); }
  }, [isOpen, load]);

  const start = async (planTripId: string) => {
    setStarting(planTripId);
    try {
      const result = await iniciarViaje(planTripId);
      notify(t('tracking.toastStarted'), 'success');
      onStarted(result.route_id);
      onClose();
    } catch (err) {
      notify(err instanceof Error && err.message ? err.message : t('tracking.toastStartError'), 'error');
    } finally {
      setStarting(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('tracking.startTitle')} widthClass="max-w-xl">
      <div className="p-5 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('tracking.startTitle')}</h2>
        {items === null && <p className="text-sm text-slate-500">{t('tracking.loading')}</p>}
        {error && <p className="text-sm text-red-600">{t('tracking.loadError')}</p>}
        {items?.length === 0 && !error && <p className="text-sm text-slate-500">{t('tracking.startNone')}</p>}
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {items?.map((item) => (
            <li key={item.plan_trip_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900 truncate">
                  {item.plan_date} · {item.zone ?? '—'}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {item.driver_name ?? t('tracking.noDriver')} · {item.plate ?? t('tracking.noVehicle')} · {t('tracking.startStops', { count: item.stops })}
                </p>
              </div>
              <Button size="sm" disabled={starting !== null} onClick={() => void start(item.plan_trip_id)}>
                {t('tracking.startAction')}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('tracking.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
