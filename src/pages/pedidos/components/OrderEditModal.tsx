import { useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { supabase } from '../../../lib/supabase';

interface OrderEditModalProps {
  order: { id: string; order_number: string; status: string; priority: string; delivery_date: string | null; notes: string | null };
  onClose: () => void;
  onSaved: () => void;
}

// Edita solo los campos OPERATIVOS de un pedido ya existente (estado,
// prioridad, fecha de entrega, notas). La creación de pedidos es vía
// "Importar Pedidos" (ver page.tsx) - este modal no recrea el registro
// completo (cliente/tienda/dirección/montos vienen del WMS).
export default function OrderEditModal({ order, onClose, onSaved }: OrderEditModalProps) {
  const [formData, setFormData] = useState({
    status: order.status || 'pending',
    priority: order.priority || 'normal',
    delivery_date: order.delivery_date ? order.delivery_date.slice(0, 10) : '',
    notes: order.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('orders')
        .update({
          status: formData.status,
          priority: formData.priority,
          delivery_date: formData.delivery_date || null,
          notes: formData.notes || null,
        })
        .eq('id', order.id);
      if (err) throw new Error(err.message);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Editar Pedido — {order.order_number}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            aria-label="Cerrar"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
            <Select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
              <option value="pending">Pendiente</option>
              <option value="assigned">Asignado</option>
              <option value="in_route">En Ruta</option>
              <option value="delivered">Entregado</option>
              <option value="cancelled">Cancelado</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Prioridad</label>
            <Select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
              <option value="high">Alta</option>
              <option value="normal">Normal</option>
              <option value="low">Baja</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de entrega</label>
            <Input
              type="date"
              value={formData.delivery_date}
              onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
