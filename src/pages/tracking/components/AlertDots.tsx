import { useTranslation } from 'react-i18next';
import type { TripAlert } from '../types';
import { ALERT_META } from '../tracking-logic';

/** Alertas de un viaje como puntos con icono; el texto va en el tooltip y en el nombre accesible. */
export default function AlertDots({ alerts, showText = false }: { alerts: TripAlert[]; showText?: boolean }) {
  const { t } = useTranslation();
  if (!alerts.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={t('tracking.alerts')}>
      {alerts.map((alert) => {
        const meta = ALERT_META[alert.code];
        const text = t(meta.key, { count: alert.count ?? 0 });
        return (
          <li key={alert.code} title={text} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${meta.cls}`}>
            <i className={meta.icon} aria-hidden />
            {showText ? text : <span className="sr-only">{text}</span>}
          </li>
        );
      })}
    </ul>
  );
}
