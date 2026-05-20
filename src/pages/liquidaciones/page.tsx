import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/feature/Header';
import Sidebar from '../../components/feature/Sidebar';
import Badge from '../../components/base/Badge';
import SettlementModal from './components/SettlementModal';

export default function LiquidacionesPage() {
  const { appUser } = useAuth();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Datos para filtros
  const [carriers, setCarriers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  // KPIs
  const [kpis, setKpis] = useState({
    totalLiquidado: 0,
    pendiente: 0,
    aprobado: 0,
    enRevision: 0
  });

  useEffect(() => {
    if (appUser?.organization_id) {
      loadSettlements();
      loadFilters();
    }
  }, [appUser, statusFilter, carrierFilter, driverFilter, dateFrom, dateTo]);

  const loadSettlements = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('settlements')
        .select(`
          *,
          routes(route_number, route_date, stores(name)),
          carriers(name),
          drivers(name, document)
        `)
        .eq('organization_id', appUser?.organization_id)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (carrierFilter) {
        query = query.eq('carrier_id', carrierFilter);
      }
      if (driverFilter) {
        query = query.eq('driver_id', driverFilter);
      }
      if (dateFrom) {
        query = query.gte('settlement_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('settlement_date', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      setSettlements(data || []);
      calculateKPIs(data || []);
    } catch (error) {
      console.error('Error loading settlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFilters = async () => {
    try {
      const [carriersRes, driversRes] = await Promise.all([
        supabase
          .from('carriers')
          .select('id, name')
          .eq('organization_id', appUser?.organization_id)
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('drivers')
          .select('id, name')
          .eq('organization_id', appUser?.organization_id)
          .eq('status', 'active')
          .order('name')
      ]);

      if (carriersRes.data) setCarriers(carriersRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  };

  const calculateKPIs = (data: any[]) => {
    const totalLiquidado = data.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const pendiente = data
      .filter(s => s.status === 'Borrador' || s.status === 'En Revisión')
      .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const aprobado = data
      .filter(s => s.status === 'Aprobado' || s.status === 'Pagado')
      .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const enRevision = data
      .filter(s => s.status === 'En Revisión')
      .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);

    setKpis({
      totalLiquidado,
      pendiente,
      aprobado,
      enRevision
    });
  };

  const handleEdit = (settlement: any) => {
    setSelectedSettlement(settlement);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta tarifa?')) return;

    try {
      const { error } = await supabase
        .from('settlements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      loadSettlements();
    } catch (error) {
      console.error('Error deleting settlement:', error);
      alert('Error al eliminar la tarifa');
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedSettlement(null);
  };

  const handleModalSuccess = () => {
    loadSettlements();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setCarrierFilter('');
    setDriverFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      'Borrador': { variant: 'default', icon: 'ri-draft-line' },
      'En Revisión': { variant: 'warning', icon: 'ri-time-line' },
      'Aprobado': { variant: 'success', icon: 'ri-checkbox-circle-line' },
      'Pagado': { variant: 'info', icon: 'ri-money-dollar-circle-line' },
      'Rechazado': { variant: 'danger', icon: 'ri-close-circle-line' }
    };

    const config = statusConfig[status] || { variant: 'default', icon: 'ri-question-line' };
    return (
      <Badge variant={config.variant as any}>
        <i className={`${config.icon} mr-1`}></i>
        {status}
      </Badge>
    );
  };

  const filteredSettlements = settlements.filter(settlement => {
    const matchesSearch = 
      settlement.settlement_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      settlement.routes?.route_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      settlement.drivers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      settlement.carriers?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
                    <i className="ri-money-dollar-circle-line text-white text-2xl"></i>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">Tarifas</h1>
                    <p className="text-sm text-gray-600">Gestión de tarifas de viajes</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl whitespace-nowrap"
                >
                  <i className="ri-add-line text-lg"></i>
                  Nueva Tarifa
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <i className="ri-money-dollar-circle-line text-teal-600 text-xl"></i>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  ${kpis.totalLiquidado.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-600">Total Liquidado</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <i className="ri-time-line text-amber-600 text-xl"></i>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  ${kpis.pendiente.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-600">Pendiente</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <i className="ri-checkbox-circle-line text-green-600 text-xl"></i>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  ${kpis.aprobado.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-600">Aprobado</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="ri-file-list-3-line text-blue-600 text-xl"></i>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  ${kpis.enRevision.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-600">En Revisión</div>
              </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <i className="ri-filter-3-line text-teal-600"></i>
                  Filtros
                </h2>
                {(searchTerm || statusFilter || carrierFilter || driverFilter || dateFrom || dateTo) && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 whitespace-nowrap"
                  >
                    <i className="ri-close-circle-line"></i>
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buscar
                  </label>
                  <div className="relative">
                    <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Número, ruta, conductor..."
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="">Todos</option>
                    <option value="Borrador">Borrador</option>
                    <option value="En Revisión">En Revisión</option>
                    <option value="Aprobado">Aprobado</option>
                    <option value="Pagado">Pagado</option>
                    <option value="Rechazado">Rechazado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transportista
                  </label>
                  <select
                    value={carrierFilter}
                    onChange={(e) => setCarrierFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="">Todos</option>
                    {carriers.map((carrier) => (
                      <option key={carrier.id} value={carrier.id}>
                        {carrier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Conductor
                  </label>
                  <select
                    value={driverFilter}
                    onChange={(e) => setDriverFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="">Todos</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Número
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ruta
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Transportista
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Conductor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Detalles
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Monto Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center">
                          <div className="flex items-center justify-center gap-2 text-gray-500">
                            <i className="ri-loader-4-line animate-spin text-xl"></i>
                            <span>Cargando tarifas...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredSettlements.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-2 text-gray-500">
                            <i className="ri-file-list-3-line text-4xl"></i>
                            <p className="font-medium">No hay tarifas</p>
                            <p className="text-sm">Crea tu primera tarifa para comenzar</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredSettlements.map((settlement) => (
                        <tr key={settlement.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <i className="ri-file-text-line text-teal-600"></i>
                              <span className="text-sm font-medium text-gray-900">
                                {settlement.settlement_number}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{settlement.routes?.route_number}</div>
                            <div className="text-xs text-gray-500">{settlement.routes?.stores?.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {new Date(settlement.settlement_date).toLocaleDateString('es-CL')}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{settlement.carriers?.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{settlement.drivers?.name}</div>
                            <div className="text-xs text-gray-500">{settlement.drivers?.document}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3 text-xs text-gray-600">
                              <div className="flex items-center gap-1">
                                <i className="ri-map-pin-line"></i>
                                <span>{settlement.total_distance} km</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <i className="ri-checkbox-circle-line"></i>
                                <span>{settlement.total_deliveries}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <i className="ri-arrow-go-back-line"></i>
                                <span>{settlement.total_returns}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-teal-600">
                              ${parseFloat(settlement.total_amount).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(settlement.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(settlement)}
                                className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <i className="ri-edit-line"></i>
                              </button>
                              <button
                                onClick={() => handleDelete(settlement.id)}
                                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      <SettlementModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        settlement={selectedSettlement}
      />
    </div>
  );
}