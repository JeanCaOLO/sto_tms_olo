import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';

export default function Pedidos() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    store: 'all'
  });

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customer:customers(name, code),
          store:stores(name, code)
        `)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; label: string }> = {
      pending: { variant: 'warning', label: 'Pendiente' },
      assigned: { variant: 'info', label: 'Asignado' },
      in_route: { variant: 'default', label: 'En Ruta' },
      delivered: { variant: 'success', label: 'Entregado' },
      cancelled: { variant: 'danger', label: 'Cancelado' }
    };
    const config = statusMap[status] || statusMap.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { variant: any; label: string }> = {
      high: { variant: 'danger', label: 'Alta' },
      normal: { variant: 'default', label: 'Normal' },
      low: { variant: 'info', label: 'Baja' }
    };
    const config = priorityMap[priority] || priorityMap.normal;
    return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.order_number.toLowerCase().includes(filters.search.toLowerCase()) ||
                         order.customer?.name.toLowerCase().includes(filters.search.toLowerCase());
    const matchesStatus = filters.status === 'all' || order.status === filters.status;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-600 mt-1">Gestión de pedidos desde WMS</p>
        </div>
        <Button icon={<i className="ri-add-line"></i>}>
          Importar Pedidos
        </Button>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Buscar por número de pedido o cliente..."
              icon={<i className="ri-search-line"></i>}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="w-48">
            <Select
              options={[
                { value: 'all', label: 'Todos los estados' },
                { value: 'pending', label: 'Pendiente' },
                { value: 'assigned', label: 'Asignado' },
                { value: 'in_route', label: 'En Ruta' },
                { value: 'delivered', label: 'Entregado' }
              ]}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            />
          </div>
          <Button variant="secondary" icon={<i className="ri-filter-3-line"></i>}>
            Filtros
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tienda</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha Entrega</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Peso/Volumen</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Monto</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{order.order_number}</p>
                      <p className="text-xs text-slate-500">{order.invoice_number}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-sm text-slate-900">{order.customer?.name}</p>
                      <p className="text-xs text-slate-500">{order.delivery_city}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{order.store?.name}</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    {new Date(order.delivery_date).toLocaleDateString('es-CL')}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm text-slate-700">
                      <p>{order.total_weight} kg</p>
                      <p className="text-xs text-slate-500">{order.total_volume} m³</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-slate-900">
                    ${order.total_amount?.toLocaleString('es-CL')}
                  </td>
                  <td className="py-3 px-4">{getPriorityBadge(order.priority)}</td>
                  <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                        <i className="ri-eye-line text-slate-600 w-4 h-4 flex items-center justify-center"></i>
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                        <i className="ri-edit-line text-slate-600 w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200">
          <p className="text-sm text-slate-600">
            Mostrando {filteredOrders.length} de {orders.length} pedidos
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">Anterior</Button>
            <Button variant="secondary" size="sm">Siguiente</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}