import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import OrderDetailModal from './components/OrderDetailModal';
import OrderEditModal from './components/OrderEditModal';

export default function Pedidos() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [editOrder, setEditOrder] = useState<any | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(name, code),
          store:stores(name, code)
        `)
        .order('created_at', { ascending: false });

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

  const statusLabel = (status: string) =>
    ({ pending: 'Pendiente', assigned: 'Asignado', in_route: 'En Ruta', delivered: 'Entregado', cancelled: 'Cancelado' }[status] ?? status);
  const priorityLabel = (priority: string) => ({ high: 'Alta', normal: 'Normal', low: 'Baja' }[priority] ?? priority);

  const columns: DataTableColumn<any>[] = [
    {
      key: 'order_number',
      header: 'Pedido',
      accessor: (o) => o.order_number,
      sortable: true,
      render: (o) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{o.order_number}</p>
          <p className="text-xs text-slate-500">{o.invoice_number}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      accessor: (o) => o.customer?.name ?? '',
      sortable: true,
      filterable: true,
      render: (o) => (
        <div>
          <p className="text-sm text-slate-900">{o.customer?.name}</p>
          <p className="text-xs text-slate-500">{o.delivery_city}</p>
        </div>
      ),
    },
    { key: 'store', header: 'Tienda', accessor: (o) => o.store?.name ?? '', sortable: true, filterable: true },
    {
      key: 'delivery_date',
      header: 'Fecha Entrega',
      accessor: (o) => o.delivery_date,
      sortable: true,
      render: (o) => new Date(o.delivery_date).toLocaleDateString('es-CL'),
    },
    {
      key: 'weight_volume',
      header: 'Peso/Volumen',
      accessor: (o) => o.total_weight,
      sortable: true,
      render: (o) => (
        <div className="text-sm text-slate-700">
          <p>{o.total_weight} kg</p>
          <p className="text-xs text-slate-500">{o.total_volume} m³</p>
        </div>
      ),
    },
    {
      key: 'total_amount',
      header: 'Monto',
      accessor: (o) => o.total_amount ?? 0,
      sortable: true,
      render: (o) => <span className="text-sm font-medium text-slate-900">${o.total_amount?.toLocaleString('es-CL')}</span>,
    },
    {
      key: 'priority',
      header: 'Prioridad',
      accessor: (o) => priorityLabel(o.priority),
      filterable: true,
      render: (o) => getPriorityBadge(o.priority),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (o) => statusLabel(o.status),
      filterable: true,
      render: (o) => getStatusBadge(o.status),
    },
  ];

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

      <DataTable
        data={orders}
        columns={columns}
        getRowId={(o) => o.id}
        searchPlaceholder="Buscar por número de pedido o cliente..."
        exportFileName="pedidos"
        emptyMessage="No hay pedidos"
        actions={(order) => (
          <>
            <button
              onClick={() => setDetailOrder(order)}
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Ver detalle"
            >
              <i className="ri-eye-line text-slate-600 w-4 h-4 flex items-center justify-center"></i>
            </button>
            <button
              onClick={() => setEditOrder(order)}
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Editar"
            >
              <i className="ri-edit-line text-slate-600 w-4 h-4 flex items-center justify-center"></i>
            </button>
          </>
        )}
      />

      {detailOrder && (
        <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />
      )}

      {editOrder && (
        <OrderEditModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); loadOrders(); }}
        />
      )}
    </div>
  );
}
