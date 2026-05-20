import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface ReturnModalProps {
  returnItem: any;
  onClose: () => void;
  onSave: () => void;
}

export default function ReturnModal({ returnItem, onClose, onSave }: ReturnModalProps) {
  const [formData, setFormData] = useState({
    order_id: '',
    return_type: 'total',
    reason: '',
    product_code: '',
    product_name: '',
    quantity: 1,
    notes: '',
    status: 'pending'
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);

  useEffect(() => {
    fetchOrders();
    if (returnItem) {
      setIsViewMode(true);
      setFormData({
        order_id: returnItem.order_id || '',
        return_type: returnItem.return_type || 'total',
        reason: returnItem.reason || '',
        product_code: returnItem.product_code || '',
        product_name: returnItem.product_name || '',
        quantity: returnItem.quantity || 1,
        notes: returnItem.notes || '',
        status: returnItem.status || 'pending'
      });
    }
  }, [returnItem]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer:customers(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const returnNumber = `DEV-${Date.now().toString().slice(-8)}`;
      const returnData = {
        ...formData,
        return_number: returnNumber,
        return_date: new Date().toISOString(),
        organization_id: '00000000-0000-0000-0000-000000000000'
      };

      const { error } = await supabase
        .from('returns')
        .insert([returnData]);

      if (error) throw error;

      onSave();
    } catch (error) {
      console.error('Error al guardar devolución:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {isViewMode ? 'Detalle de Devolución' : 'Nueva Devolución'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* Información del pedido */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Pedido relacionado *
              </label>
              <Select
                value={formData.order_id}
                onChange={(e) => setFormData({ ...formData, order_id: e.target.value })}
                required
                disabled={isViewMode}
              >
                <option value="">Seleccionar pedido</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} - {order.customer?.name || 'Sin cliente'}
                  </option>
                ))}
              </Select>
            </div>

            {/* Tipo de devolución */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tipo de devolución *
              </label>
              <Select
                value={formData.return_type}
                onChange={(e) => setFormData({ ...formData, return_type: e.target.value })}
                required
                disabled={isViewMode}
              >
                <option value="total">Devolución total</option>
                <option value="partial">Devolución parcial</option>
                <option value="damaged">Producto dañado</option>
                <option value="wrong_item">Producto incorrecto</option>
              </Select>
            </div>

            {/* Información del producto */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Código de producto
                </label>
                <Input
                  type="text"
                  value={formData.product_code}
                  onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                  placeholder="SKU-001"
                  disabled={isViewMode}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Cantidad
                </label>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  min="1"
                  disabled={isViewMode}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nombre del producto *
              </label>
              <Input
                type="text"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="Nombre del producto devuelto"
                required
                disabled={isViewMode}
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Motivo de la devolución *
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                rows={3}
                placeholder="Describe el motivo de la devolución..."
                required
                disabled={isViewMode}
              />
            </div>

            {/* Notas adicionales */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Notas adicionales
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                rows={3}
                placeholder="Información adicional sobre la devolución..."
                disabled={isViewMode}
              />
            </div>

            {/* Estado (solo en modo vista) */}
            {isViewMode && returnItem && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Estado actual
                </label>
                <div className="px-4 py-2 bg-gray-50 rounded-lg text-sm text-gray-900">
                  {returnItem.status === 'pending' && 'Pendiente'}
                  {returnItem.status === 'approved' && 'Aprobada'}
                  {returnItem.status === 'rejected' && 'Rechazada'}
                  {returnItem.status === 'completed' && 'Completada'}
                </div>
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={onClose}>
              {isViewMode ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!isViewMode && (
              <Button type="submit" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Devolución'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
