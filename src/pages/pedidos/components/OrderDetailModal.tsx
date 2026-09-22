import Badge from '../../../components/base/Badge';

interface OrderDetail {
  order_number: string;
  invoice_number: string | null;
  delivery_address: string;
  delivery_city: string | null;
  delivery_zone: string | null;
  delivery_date: string | null;
  order_date: string;
  total_weight: number | null;
  total_volume: number | null;
  total_items: number | null;
  total_amount: number | null;
  priority: string;
  status: string;
  notes: string | null;
  customer?: { name: string; code: string };
  store?: { name: string; code: string };
}

interface OrderDetailModalProps {
  order: OrderDetail;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'default' | 'success' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'Pendiente' },
  assigned: { variant: 'info', label: 'Asignado' },
  in_route: { variant: 'default', label: 'En Ruta' },
  delivered: { variant: 'success', label: 'Entregado' },
  cancelled: { variant: 'danger', label: 'Cancelado' },
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-ES') : '—');

// Vista de SOLO LECTURA de un pedido (tabla `orders`). El ojo abre esta;
// el lápiz abre OrderEditModal. Antes ninguno de los dos botones tenía
// onClick (ver historial) - se agregan acá.
export default function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  const statusConfig = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">{order.order_number}</h2>
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
          <div className="flex justify-between"><span className="text-slate-500">Cliente</span><span className="text-slate-900 font-medium">{order.customer?.name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tienda</span><span className="text-slate-900">{order.store?.name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Factura</span><span className="text-slate-900">{order.invoice_number ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Prioridad</span><span className="text-slate-900 capitalize">{order.priority}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha pedido</span><span className="text-slate-900">{fmtDate(order.order_date)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha entrega</span><span className="text-slate-900">{fmtDate(order.delivery_date)}</span></div>
          <div className="flex justify-between col-span-2"><span className="text-slate-500">Dirección</span><span className="text-slate-900 text-right">{order.delivery_address}{order.delivery_city ? `, ${order.delivery_city}` : ''}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Peso</span><span className="text-slate-900">{order.total_weight ?? 0} kg</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Volumen</span><span className="text-slate-900">{order.total_volume ?? 0} m³</span></div>
          <div className="flex justify-between"><span className="text-slate-500">N.º artículos</span><span className="text-slate-900">{order.total_items ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Monto</span><span className="text-slate-900">{(order.total_amount ?? 0).toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}</span></div>
          {order.notes && (
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <span className="text-slate-500 block mb-1">Notas</span>
              <span className="text-slate-700">{order.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
