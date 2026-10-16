import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/base/Modal';
import DetalleDia from './DetalleDia';
import { hayPendientesCarca, viajesDeCelda, viajesDeFecha } from '../calendario';
import { fechaAlistamiento, tiempoViajeDias } from '../tiempo-cluster';
import { useZonasNombre } from '../use-zonas-nombre';
import type { RoutePlan } from '../planes-types';

interface Props {
  planes: RoutePlan[];
  fechaISO: string;
  zonaCodigo: string | null; // null = todos los viajes del día
  onClose: () => void;
  onRecargar?: () => void | Promise<void>;
}

function fmtFecha(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "EEEE d 'de' MMMM, yyyy", { locale: es });
}

function fmtCorta(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'EEE d MMM', { locale: es });
}

// Modal de detalle de una celda (día+zona) o de un día completo. El ancho se
// ajusta a cuántos viajes hay (uno centrado y cómodo; varios con aire al lado).
export default function DetalleModal({ planes, fechaISO, zonaCodigo, onClose, onRecargar }: Props) {
  const { t } = useTranslation();
  const { nombreDe } = useZonasNombre();
  const viajes = zonaCodigo ? viajesDeCelda(planes, fechaISO, zonaCodigo) : viajesDeFecha(planes, fechaISO);
  const ancho = viajes.length <= 1 ? 'max-w-xl' : viajes.length === 2 ? 'max-w-3xl' : 'max-w-5xl';
  const titulo = `${fmtFecha(fechaISO)}${zonaCodigo ? ` · ${nombreDe(zonaCodigo)}` : ''}`;

  return (
    <Modal isOpen onClose={onClose} title={titulo} widthClass={ancho} zClass="z-[1000]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 capitalize">{titulo}</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          aria-label={t('planning.close')}
        >
          <i className="ri-close-line text-xl"></i>
        </button>
      </div>
      <div className="p-5">
        {viajes.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-1.5">
            {hayPendientesCarca(viajes) && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <i className="ri-error-warning-line"></i>{t('planning.carcaWarning')}
              </p>
            )}
            {viajes.map((v) => (
              <p key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">
                  <i className="ri-route-line text-teal-600"></i> {t('planning.tripNumber')} {v.numero_viaje ?? '—'}
                </span>
                <span>
                  <i className="ri-calendar-check-line"></i> {t('planning.readyBy')}{' '}
                  {fmtCorta(fechaAlistamiento(fechaISO, v.delivery_zone))}
                  <span className="ml-1 text-slate-400">({t('planning.leadTime', { days: tiempoViajeDias(v.delivery_zone) })})</span>
                </span>
              </p>
            ))}
          </div>
        )}
        <DetalleDia planes={planes} fechaISO={fechaISO} zonaCodigo={zonaCodigo} onRecargar={onRecargar} />
      </div>
    </Modal>
  );
}
