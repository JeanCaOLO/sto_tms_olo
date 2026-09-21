import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/feature/StatCard';
import Badge from '../../components/base/Badge';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import ReturnModal from './components/ReturnModal';

interface Return {
  id: string;
  return_number: string;
  order_id: string;
  return_type: string;
  return_date: string;
  reason: string;
  product_name: string;
  quantity: number;
  status: string;
  created_at: string;
  order?: {
    order_number: string;
    customer?: {
      name: string;
    };
  };
}

const statusVariants: Record<string, 'warning' | 'success' | 'danger' | 'info'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  completed: 'info'
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  completed: 'Completada'
};

export default function DevolucionesPage() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  useEffect(() => {
    fetchReturns();
  }, []);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('returns')
        .select(`
          *,
          order:orders(
            order_number,
            customer:customers(name)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReturns(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error('Error al cargar devoluciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: Return[]) => {
    setStats({
      total: data.length,
      pending: data.filter(r => r.status === 'pending').length,
      approved: data.filter(r => r.status === 'approved').length,
      rejected: data.filter(r => r.status === 'rejected').length
    });
  };

  const dateFilteredReturns = returns.filter((ret) => {
    if (!dateFilter) return true;
    const returnDate = new Date(ret.return_date || ret.created_at).toISOString().split('T')[0];
    return returnDate === dateFilter;
  });

  const handleStatusChange = async (returnId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('returns')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', returnId);

      if (error) throw error;

      await fetchReturns();
    } catch (error) {
      console.error('Error al actualizar estado:', error);
    }
  };

  const handleViewDetail = (returnItem: Return) => {
    setSelectedReturn(returnItem);
    setIsModalOpen(true);
  };

  const columns: DataTableColumn<Return>[] = [
    {
      key: 'return_number',
      header: 'Número',
      accessor: (r) => r.return_number,
      sortable: true,
      render: (r) => <span className="text-sm font-medium text-gray-900">{r.return_number}</span>,
    },
    { key: 'order', header: 'Pedido', accessor: (r) => r.order?.order_number ?? '', sortable: true },
    { key: 'customer', header: 'Cliente', accessor: (r) => r.order?.customer?.name ?? '', sortable: true, filterable: true },
    {
      key: 'product',
      header: 'Producto',
      accessor: (r) => r.product_name ?? '',
      render: (r) => (
        <>
          <div className="text-sm text-gray-900">{r.product_name || '-'}</div>
          <div className="text-xs text-gray-500">Cant: {r.quantity || 0}</div>
        </>
      ),
    },
    { key: 'reason', header: 'Motivo', accessor: (r) => r.reason ?? '' },
    {
      key: 'return_date',
      header: 'Fecha',
      accessor: (r) => r.return_date || r.created_at,
      sortable: true,
      render: (r) => new Date(r.return_date || r.created_at).toLocaleDateString('es-ES'),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (r) => statusLabels[r.status] || r.status,
      filterable: true,
      render: (r) => <Badge variant={statusVariants[r.status] || 'default'}>{statusLabels[r.status] || r.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Devoluciones</h1>
          <p className="text-sm text-gray-600 mt-1">Gestiona las devoluciones de productos y pedidos</p>
        </div>
        <Button onClick={() => { setSelectedReturn(null); setIsModalOpen(true); }}>
          <i className="ri-add-line mr-2"></i>
          Nueva Devolución
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Total Devoluciones" value={stats.total.toString()} icon="ri-arrow-go-back-line" />
          <StatCard title="Pendientes" value={stats.pending.toString()} icon="ri-time-line" />
          <StatCard title="Aprobadas" value={stats.approved.toString()} icon="ri-checkbox-circle-line" />
          <StatCard title="Rechazadas" value={stats.rejected.toString()} icon="ri-close-circle-line" />
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 flex items-center gap-3">
          <div className="w-48">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              label="Filtrar por fecha exacta"
            />
          </div>
          {dateFilter && (
            <Button variant="secondary" onClick={() => setDateFilter('')} className="mt-6">
              <i className="ri-close-line mr-2"></i>
              Limpiar fecha
            </Button>
          )}
        </div>

        <DataTable
          data={dateFilteredReturns}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          searchPlaceholder="Buscar por número de devolución, pedido o cliente..."
          exportFileName="devoluciones"
          emptyMessage="No hay devoluciones"
          actions={(returnItem) => (
            <>
              <button
                onClick={() => handleViewDetail(returnItem)}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                title="Ver detalle"
              >
                <i className="ri-eye-line text-base"></i>
              </button>
              {returnItem.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleStatusChange(returnItem.id, 'approved')}
                    className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                    title="Aprobar"
                  >
                    <i className="ri-checkbox-circle-line text-base"></i>
                  </button>
                  <button
                    onClick={() => handleStatusChange(returnItem.id, 'rejected')}
                    className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Rechazar"
                  >
                    <i className="ri-close-circle-line text-base"></i>
                  </button>
                </>
              )}
              {returnItem.status === 'approved' && (
                <button
                  onClick={() => handleStatusChange(returnItem.id, 'completed')}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                  title="Completar"
                >
                  <i className="ri-check-double-line text-base"></i>
                </button>
              )}
            </>
          )}
        />

      {/* Modal */}
      {isModalOpen && (
        <ReturnModal
          returnItem={selectedReturn}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedReturn(null);
          }}
          onSave={() => {
            fetchReturns();
            setIsModalOpen(false);
            setSelectedReturn(null);
          }}
        />
      )}
    </div>
  );
}
