import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Header from '../../components/feature/Header';
import StatCard from '../../components/feature/StatCard';
import Badge from '../../components/base/Badge';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
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

const statusColors: Record<string, 'amber' | 'green' | 'red' | 'teal'> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  completed: 'teal'
};

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
  const [filteredReturns, setFilteredReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);

  // KPIs
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  useEffect(() => {
    fetchReturns();
  }, []);

  useEffect(() => {
    filterReturns();
  }, [returns, searchTerm, statusFilter, dateFilter]);

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

  const filterReturns = () => {
    let filtered = [...returns];

    // Filtro de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(ret =>
        ret.return_number?.toLowerCase().includes(term) ||
        ret.order?.order_number?.toLowerCase().includes(term) ||
        ret.order?.customer?.name?.toLowerCase().includes(term)
      );
    }

    // Filtro de estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(ret => ret.status === statusFilter);
    }

    // Filtro de fecha
    if (dateFilter) {
      filtered = filtered.filter(ret => {
        const returnDate = new Date(ret.return_date || ret.created_at).toISOString().split('T')[0];
        return returnDate === dateFilter;
      });
    }

    setFilteredReturns(filtered);
  };

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

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Devoluciones</h1>
            <p className="text-sm text-gray-600 mt-1">Gestiona las devoluciones de productos y pedidos</p>
          </div>
          <Button onClick={() => { setSelectedReturn(null); setIsModalOpen(true); }}>
            <i className="ri-add-line mr-2"></i>
            Nueva Devolución
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Devoluciones"
            value={stats.total.toString()}
            icon="ri-arrow-go-back-line"
          />
          <StatCard
            title="Pendientes"
            value={stats.pending.toString()}
            icon="ri-time-line"
          />
          <StatCard
            title="Aprobadas"
            value={stats.approved.toString()}
            icon="ri-checkbox-circle-line"
          />
          <StatCard
            title="Rechazadas"
            value={stats.rejected.toString()}
            icon="ri-close-circle-line"
          />
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[280px]">
              <Input
                type="text"
                placeholder="Buscar por número de devolución, pedido o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<i className="ri-search-line text-gray-400"></i>}
              />
            </div>
            <div className="w-48">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobada</option>
                <option value="rejected">Rechazada</option>
                <option value="completed">Completada</option>
              </Select>
            </div>
            <div className="w-48">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
            {(searchTerm || statusFilter !== 'all' || dateFilter) && (
              <Button variant="secondary" onClick={clearFilters}>
                <i className="ri-close-line mr-2"></i>
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="text-center py-16">
              <i className="ri-inbox-line text-6xl text-gray-300 mb-4"></i>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay devoluciones</h3>
              <p className="text-sm text-gray-600 mb-6">
                {searchTerm || statusFilter !== 'all' || dateFilter
                  ? 'No se encontraron resultados con los filtros aplicados'
                  : 'Comienza registrando tu primera devolución'}
              </p>
              {(searchTerm || statusFilter !== 'all' || dateFilter) && (
                <Button variant="secondary" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Pedido
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Producto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Motivo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReturns.map((returnItem) => (
                    <tr key={returnItem.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {returnItem.return_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {returnItem.order?.order_number || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {returnItem.order?.customer?.name || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{returnItem.product_name || '-'}</div>
                        <div className="text-xs text-gray-500">Cant: {returnItem.quantity || 0}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900 line-clamp-2">
                          {returnItem.reason || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {new Date(returnItem.return_date || returnItem.created_at).toLocaleDateString('es-ES')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={statusVariants[returnItem.status] || 'default'}>
                          {statusLabels[returnItem.status] || returnItem.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
