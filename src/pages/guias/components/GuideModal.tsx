import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { useAuth } from '../../../hooks/useAuth';

interface GuideModalProps {
  guide?: any;
  onClose: () => void;
}

interface Route {
  id: string;
  route_number: string;
}

interface OrderOption {
  id: string;
  order_number: string;
}

// dispatch_guides es una guía POR PARADA (un pedido dentro de una ruta) - no
// tiene driver_id/vehicle_id/total_stops propios, esos viven en la ruta
// (routes) seleccionada. Ver la interfaz DispatchGuide en ../page.tsx.
export default function GuideModal({ guide, onClose }: GuideModalProps) {
  const { appUser } = useAuth();
  const [formData, setFormData] = useState({
    guide_number: '',
    route_id: '',
    order_id: '',
    sequence_number: 1,
    planned_arrival_time: '',
    status: 'pendiente',
    delivery_status: 'pending',
    recipient_name: '',
    notes: '',
  });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (appUser?.organization_id) fetchData();
    if (guide) {
      setFormData({
        guide_number: guide.guide_number || '',
        route_id: guide.route_id || '',
        order_id: guide.order_id || '',
        sequence_number: guide.sequence_number || 1,
        planned_arrival_time: guide.planned_arrival_time ? guide.planned_arrival_time.slice(0, 16) : '',
        status: guide.status || 'pendiente',
        delivery_status: guide.delivery_status || 'pending',
        recipient_name: guide.recipient_name || '',
        notes: guide.notes || '',
      });
    }
  }, [guide, appUser?.organization_id]);

  const fetchData = async () => {
    try {
      const [routesRes, ordersRes] = await Promise.all([
        supabase.from('routes').select('id, route_number').eq('organization_id', appUser!.organization_id).order('route_number'),
        supabase.from('orders').select('id, order_number').eq('organization_id', appUser!.organization_id).order('order_number', { ascending: false }),
      ]);

      if (routesRes.data) setRoutes(routesRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.organization_id) return;
    setLoading(true);

    try {
      const payload = {
        organization_id: appUser.organization_id,
        guide_number: formData.guide_number,
        route_id: formData.route_id,
        order_id: formData.order_id,
        sequence_number: formData.sequence_number,
        planned_arrival_time: formData.planned_arrival_time ? new Date(formData.planned_arrival_time).toISOString() : null,
        status: formData.status,
        delivery_status: formData.delivery_status,
        recipient_name: formData.recipient_name || null,
        notes: formData.notes || null,
      };

      if (guide) {
        const { error } = await supabase
          .from('dispatch_guides')
          .update(payload)
          .eq('id', guide.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('dispatch_guides')
          .insert([payload]);

        if (error) throw error;
      }

      onClose();
    } catch (error) {
      console.error('Error al guardar guía:', error);
      alert('Error al guardar la guía');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">
            {guide ? 'Editar Guía de Despacho' : 'Nueva Guía de Despacho'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Número de Guía <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.guide_number}
                onChange={(e) => setFormData({ ...formData, guide_number: e.target.value })}
                placeholder="Ej: GD-2026-001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ruta <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.route_id}
                onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                required
              >
                <option value="">Seleccionar ruta</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.route_number}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Pedido <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.order_id}
                onChange={(e) => setFormData({ ...formData, order_id: e.target.value })}
                required
              >
                <option value="">Seleccionar pedido</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                N.º de parada en la ruta <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                value={formData.sequence_number}
                onChange={(e) => setFormData({ ...formData, sequence_number: parseInt(e.target.value) || 1 })}
                min="1"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Llegada planificada
              </label>
              <Input
                type="datetime-local"
                value={formData.planned_arrival_time}
                onChange={(e) => setFormData({ ...formData, planned_arrival_time: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Destinatario
              </label>
              <Input
                value={formData.recipient_name}
                onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                placeholder="Quién recibe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Estado de Entrega <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.delivery_status}
                onChange={(e) => setFormData({ ...formData, delivery_status: e.target.value })}
                required
              >
                <option value="pending">Pendiente</option>
                <option value="in_transit">En Tránsito</option>
                <option value="delivered">Entregada</option>
                <option value="failed">Con Incidencias</option>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-line mr-2"></i>
                  {guide ? 'Actualizar' : 'Crear'} Guía
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
