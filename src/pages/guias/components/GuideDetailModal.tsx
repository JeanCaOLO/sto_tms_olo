import Badge from '../../../components/base/Badge';

interface GuideDetail {
  guide_number: string;
  sequence_number: number;
  status: string;
  delivery_status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  recipient_name: string | null;
  planned_arrival_time: string | null;
  actual_arrival_time: string | null;
  notes: string | null;
  routes?: {
    route_number: string;
    route_date: string;
    total_stops: number;
    completed_stops: number;
    drivers?: { full_name: string };
    vehicles?: { plate: string };
  };
}

interface GuideDetailModalProps {
  guide: GuideDetail;
  onClose: () => void;
}

const DELIVERY_STATUS_CONFIG = {
  pending: { label: 'Pendiente', variant: 'warning' as const },
  in_transit: { label: 'En Tránsito', variant: 'info' as const },
  delivered: { label: 'Entregada', variant: 'success' as const },
  failed: { label: 'Con Incidencias', variant: 'danger' as const },
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES') : '—');

// Vista de SOLO LECTURA de una guía (una parada de una ruta) - separada del
// formulario de edición (GuideModal). El botón "ojo" abre esta; "editar" abre
// GuideModal. Antes ambos abrían el mismo formulario, lo que confundía "no
// funciona" con "no hay una vista de detalle real".
export default function GuideDetailModal({ guide, onClose }: GuideDetailModalProps) {
  const statusConfig = DELIVERY_STATUS_CONFIG[guide.delivery_status] ?? DELIVERY_STATUS_CONFIG.pending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">{guide.guide_number}</h2>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            aria-label="Cerrar"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div className="flex justify-between col-span-2"><span className="text-slate-500">Ruta</span><span className="text-slate-900 font-medium">{guide.routes?.route_number ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha</span><span className="text-slate-900">{guide.routes?.route_date ? new Date(guide.routes.route_date).toLocaleDateString('es-ES') : '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Parada</span><span className="text-slate-900">{guide.sequence_number} / {guide.routes?.total_stops ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Conductor</span><span className="text-slate-900">{guide.routes?.drivers?.full_name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Vehículo</span><span className="text-slate-900">{guide.routes?.vehicles?.plate ?? '—'}</span></div>
          <div className="flex justify-between col-span-2"><span className="text-slate-500">Destinatario</span><span className="text-slate-900">{guide.recipient_name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Llegada planificada</span><span className="text-slate-900">{fmt(guide.planned_arrival_time)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Llegada real</span><span className="text-slate-900">{fmt(guide.actual_arrival_time)}</span></div>
          {guide.notes && (
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <span className="text-slate-500 block mb-1">Notas</span>
              <span className="text-slate-700">{guide.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
