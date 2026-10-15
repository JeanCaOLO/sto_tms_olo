import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/base/Modal';
import DetalleDia from './DetalleDia';
import { viajesDeCelda, viajesDeFecha } from '../calendario';
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
        <DetalleDia planes={planes} fechaISO={fechaISO} zonaCodigo={zonaCodigo} onRecargar={onRecargar} />
      </div>
    </Modal>
  );
}
