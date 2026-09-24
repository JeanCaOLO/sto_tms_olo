import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import OrderDetailModal from './components/OrderDetailModal';
import OrderEditModal from './components/OrderEditModal';

export default function Pedidos() {
  const { t } = useTranslation();
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
      pending: { variant: 'warning', label: t('orders.statusPending') },
      assigned: { variant: 'info', label: t('orders.statusAssigned') },
      in_route: { variant: 'default', label: t('orders.statusInRoute') },
      delivered: { variant: 'success', label: t('orders.statusDelivered') },
      cancelled: { variant: 'danger', label: t('orders.statusCancelled') }
    };
    const config = statusMap[status] || statusMap.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { variant: any; label: string }> = {
      high: { variant: 'danger', label: t('orders.priorityHigh') },
      normal: { variant: 'default', label: t('orders.priorityNormal') },
      low: { variant: 'info', label: t('orders.priorityLow') }
    };
    const config = priorityMap[priority] || priorityMap.normal;
    return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
  };

  const statusLabel = (status: string) =>
    ({ pending: t('orders.statusPending'), assigned: t('orders.statusAssigned'), in_route: t('orders.statusInRoute'), delivered: t('orders.statusDelivered'), cancelled: t('orders.statusCancelled') }[status] ?? status);
  const priorityLabel = (priority: string) => ({ high: t('orders.priorityHigh'), normal: t('orders.priorityNormal'), low: t('orders.priorityLow') }[priority] ?? priority);

  const columns: DataTableColumn<any>[] = [
    {
      key: 'order_number',
      header: t('orders.colOrder'),
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
      header: t('orders.colCustomer'),
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
    { key: 'store', header: t('orders.colStore'), accessor: (o) => o.store?.name ?? '', sortable: true, filterable: true },
    {
      key: 'delivery_date',
      header: t('orders.colDeliveryDate'),
      accessor: (o) => o.delivery_date,
      sortable: true,
      render: (o) => new Date(o.delivery_date).toLocaleDateString('es-CL'),
    },
    {
      key: 'weight_volume',
      header: t('orders.colWeightVolume'),
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
      header: t('orders.colAmount'),
      accessor: (o) => o.total_amount ?? 0,
      sortable: true,
      render: (o) => <span className="text-sm font-medium text-slate-900">${o.total_amount?.toLocaleString('es-CL')}</span>,
    },
    {
      key: 'priority',
      header: t('orders.colPriority'),
      accessor: (o) => priorityLabel(o.priority),
      filterable: true,
      render: (o) => getPriorityBadge(o.priority),
    },
    {
      key: 'status',
      header: t('orders.colStatus'),
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
          <h1 className="text-2xl font-bold text-slate-900">{t('orders.title')}</h1>
          <p className="text-sm text-slate-600 mt-1">{t('orders.subtitle')}</p>
        </div>
        <Button icon={<i className="ri-add-line"></i>}>
          {t('orders.import')}
        </Button>
      </div>

      <DataTable
        data={orders}
        columns={columns}
        getRowId={(o) => o.id}
        searchPlaceholder={t('orders.search')}
        exportFileName="pedidos"
        emptyMessage={t('orders.empty')}
        actions={(order) => (
          <>
            <button
              onClick={() => setDetailOrder(order)}
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title={t('orders.actionView')}
            >
              <i className="ri-eye-line text-slate-600 w-4 h-4 flex items-center justify-center"></i>
            </button>
            <button
              onClick={() => setEditOrder(order)}
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title={t('orders.actionEdit')}
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
