import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/feature/Header';
import Sidebar from '../../components/feature/Sidebar';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import VehicleModal from './components/VehicleModal';
import VehicleTypeModal from './components/VehicleTypeModal';
import VehicleTypeDeleteModal from './components/VehicleTypeDeleteModal';
import CsvImportModal from '../../components/feature/CsvImportModal';

type Tab = 'vehiculos' | 'tipos';

const VehiculosPage = () => {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('vehiculos');

  // --- Vehículos ---
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [filters, setFilters] = useState({ search: '', type: '', status: '', carrier: '' });
  const [stats, setStats] = useState({ total: 0, active: 0, maintenance: 0, inactive: 0 });

  // --- Tipos de Vehículo ---
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isTypeDeleteModalOpen, setIsTypeDeleteModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<any>(null);

  const csvFields = [
    { key: 'plate', label: 'Placa', required: true },
    { key: 'brand', label: 'Marca', required: true },
    { key: 'model', label: 'Modelo', required: true },
    { key: 'year', label: 'Año', required: true },
    { key: 'vehicle_type_id', label: 'ID Tipo de Vehículo', required: true },
    { key: 'capacity_weight', label: 'Capacidad Peso (kg)', required: true },
    { key: 'capacity_volume', label: 'Capacidad Volumen (m³)', required: true },
    { key: 'carrier_code', label: 'Código Transportista', required: true },
    { key: 'status', label: 'Estado (activo/mantenimiento/inactivo)', required: true },
  ];

  const transformVehicleRow = async (row: any) => {
    const { data: carrier } = await supabase
      .from('carriers')
      .select('id')
      .eq('code', row.carrier_code)
      .eq('organization_id', appUser?.organization_id)
      .maybeSingle();

    if (!carrier) throw new Error(`Transportista con código "${row.carrier_code}" no encontrado`);

    return {
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      year: parseInt(row.year),
      vehicle_type: row.vehicle_type_id,
      capacity_weight: parseFloat(row.capacity_weight),
      capacity_volume: parseFloat(row.capacity_volume),
      carrier_id: carrier.id,
      status: row.status,
      organization_id: appUser?.organization_id,
    };
  };

  useEffect(() => {
    if (appUser?.organization_id) {
      loadVehicles();
      loadVehicleTypes();
    }
  }, [appUser]);

  useEffect(() => {
    applyFilters();
  }, [vehicles, filters]);

  // ---- Carga de datos ----
  const loadVehicles = async () => {
    setLoadingVehicles(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, carrier:carriers(id, name)')
        .eq('organization_id', appUser?.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVehicles(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error('Error loading vehicles:', error);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const loadVehicleTypes = async () => {
    setLoadingTypes(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_types')
        .select('*')
        .eq('organization_id', appUser?.organization_id)
        .order('name');
      if (error) throw error;
      setVehicleTypes(data || []);
    } catch (error) {
      console.error('Error loading vehicle types:', error);
    } finally {
      setLoadingTypes(false);
    }
  };

  const calculateStats = (data: any[]) => {
    setStats({
      total: data.length,
      active: data.filter(v => v.status === 'activo').length,
      maintenance: data.filter(v => v.status === 'mantenimiento').length,
      inactive: data.filter(v => v.status === 'inactivo').length,
    });
  };

  const applyFilters = () => {
    let filtered = [...vehicles];
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(v =>
        v.plate?.toLowerCase().includes(s) ||
        v.brand?.toLowerCase().includes(s) ||
        v.model?.toLowerCase().includes(s) ||
        v.carrier?.name?.toLowerCase().includes(s)
      );
    }
    if (filters.type) filtered = filtered.filter(v => v.vehicle_type === filters.type);
    if (filters.status) filtered = filtered.filter(v => v.status === filters.status);
    if (filters.carrier) filtered = filtered.filter(v => v.carrier_id === filters.carrier);
    setFilteredVehicles(filtered);
  };

  // ---- Helpers ----
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'activo': return 'bg-green-100 text-green-800';
      case 'mantenimiento': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'activo': return 'Activo';
      case 'mantenimiento': return 'Mantenimiento';
      case 'inactivo': return 'Inactivo';
      default: return status;
    }
  };

  const getVehicleTypeName = (typeId: string) => {
    const found = vehicleTypes.find(t => t.id === typeId);
    return found ? found.name : typeId;
  };

  const getVehicleTypeIcon = (typeId: string) => {
    const found = vehicleTypes.find(t => t.id === typeId);
    return found?.icon || 'ri-truck-line';
  };

  const uniqueCarriers = Array.from(new Set(vehicles.map(v => v.carrier_id)))
    .map(id => vehicles.find(v => v.carrier_id === id)?.carrier)
    .filter(Boolean);

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!confirm('¿Estás seguro de eliminar este vehículo?')) return;
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
      if (error) throw error;
      loadVehicles();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      alert('Error al eliminar el vehículo');
    }
  };

  // ---- RENDER ----
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {/* Page Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Vehículos</h1>
                <p className="text-sm text-gray-600 mt-1">Gestiona la flota y los tipos de vehículos</p>
              </div>
              {activeTab === 'vehiculos' ? (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => setIsCsvModalOpen(true)}
                    className="px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-file-excel-line"></i>
                    Importar CSV
                  </Button>
                  <Button
                    onClick={() => { setSelectedVehicle(null); setIsModalOpen(true); }}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-add-line"></i>
                    Nuevo Vehículo
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => { setSelectedType(null); setIsTypeModalOpen(true); }}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>
                  Nuevo Tipo
                </Button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
              <button
                onClick={() => setActiveTab('vehiculos')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'vehiculos'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className="ri-truck-line mr-2"></i>
                Vehículos
              </button>
              <button
                onClick={() => setActiveTab('tipos')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'tipos'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className="ri-list-settings-line mr-2"></i>
                Tipos de Vehículo
              </button>
            </div>

            {/* ===== TAB: VEHÍCULOS ===== */}
            {activeTab === 'vehiculos' && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Vehículos</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-teal-100 rounded-lg">
                        <i className="ri-truck-line text-2xl text-teal-600"></i>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Activos</p>
                        <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-lg">
                        <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Mantenimiento</p>
                        <p className="text-2xl font-bold text-amber-600 mt-1">{stats.maintenance}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-amber-100 rounded-lg">
                        <i className="ri-tools-line text-2xl text-amber-600"></i>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Inactivos</p>
                        <p className="text-2xl font-bold text-gray-600 mt-1">{stats.inactive}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                        <i className="ri-close-circle-line text-2xl text-gray-600"></i>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Filters */}
                <Card className="p-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-2">
                      <Input
                        placeholder="Buscar por placa, marca, modelo..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      />
                    </div>
                    <Select
                      value={filters.type}
                      onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                      options={[
                        { value: '', label: 'Todos los tipos' },
                        ...vehicleTypes.map(t => ({ value: t.id, label: t.name })),
                      ]}
                    />
                    <Select
                      value={filters.status}
                      onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                      options={[
                        { value: '', label: 'Todos los estados' },
                        { value: 'activo', label: 'Activo' },
                        { value: 'mantenimiento', label: 'Mantenimiento' },
                        { value: 'inactivo', label: 'Inactivo' },
                      ]}
                    />
                    <Select
                      value={filters.carrier}
                      onChange={(e) => setFilters({ ...filters, carrier: e.target.value })}
                      options={[
                        { value: '', label: 'Todos los transportistas' },
                        ...uniqueCarriers.map((c: any) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      Mostrando {filteredVehicles.length} de {vehicles.length} vehículos
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer ${viewMode === 'grid' ? 'bg-teal-100 text-teal-600' : 'text-gray-400 hover:bg-gray-100'}`}
                      >
                        <i className="ri-grid-line"></i>
                      </button>
                      <button
                        onClick={() => setViewMode('table')}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer ${viewMode === 'table' ? 'bg-teal-100 text-teal-600' : 'text-gray-400 hover:bg-gray-100'}`}
                      >
                        <i className="ri-list-check"></i>
                      </button>
                    </div>
                  </div>
                </Card>

                {/* Vehicle List */}
                {loadingVehicles ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
                      <p className="text-gray-600 mt-2">Cargando vehículos...</p>
                    </div>
                  </div>
                ) : filteredVehicles.length === 0 ? (
                  <Card className="p-12 text-center">
                    <i className="ri-truck-line text-6xl text-gray-300"></i>
                    <h3 className="text-lg font-semibold text-gray-900 mt-4">No hay vehículos</h3>
                    <p className="text-gray-600 mt-2">
                      {filters.search || filters.type || filters.status || filters.carrier
                        ? 'No se encontraron vehículos con los filtros aplicados'
                        : 'Comienza agregando tu primer vehículo'}
                    </p>
                  </Card>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredVehicles.map((vehicle) => (
                      <Card key={vehicle.id} className="p-6 hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 flex items-center justify-center bg-teal-100 rounded-lg">
                              <i className={`${getVehicleTypeIcon(vehicle.vehicle_type)} text-2xl text-teal-600`}></i>
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">{vehicle.plate}</h3>
                              <p className="text-sm text-gray-600">{vehicle.brand} {vehicle.model}</p>
                            </div>
                          </div>
                          <Badge className={getStatusColor(vehicle.status)}>
                            {getStatusLabel(vehicle.status)}
                          </Badge>
                        </div>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Tipo:</span>
                            <span className="font-medium text-gray-900">{getVehicleTypeName(vehicle.vehicle_type)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Año:</span>
                            <span className="font-medium text-gray-900">{vehicle.year}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Transportista:</span>
                            <span className="font-medium text-gray-900">{vehicle.carrier?.name}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Peso máx.:</span>
                            <span className="font-medium text-gray-900">{vehicle.capacity_weight} kg</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Volumen máx.:</span>
                            <span className="font-medium text-gray-900">{vehicle.capacity_volume} m³</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                          <Button
                            onClick={() => { setSelectedVehicle(vehicle); setIsModalOpen(true); }}
                            className="flex-1 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            <i className="ri-edit-line"></i>
                            Editar
                          </Button>
                          <Button
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                            className="px-3 py-2 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 flex items-center justify-center whitespace-nowrap"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehículo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transportista</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredVehicles.map((vehicle) => (
                            <tr key={vehicle.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg">
                                    <i className={`${getVehicleTypeIcon(vehicle.vehicle_type)} text-xl text-teal-600`}></i>
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-900">{vehicle.plate}</div>
                                    <div className="text-sm text-gray-600">{vehicle.brand} {vehicle.model} ({vehicle.year})</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{getVehicleTypeName(vehicle.vehicle_type)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{vehicle.carrier?.name}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{vehicle.capacity_weight} kg</div>
                                <div className="text-sm text-gray-600">{vehicle.capacity_volume} m³</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge className={getStatusColor(vehicle.status)}>{getStatusLabel(vehicle.status)}</Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => { setSelectedVehicle(vehicle); setIsModalOpen(true); }} className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer">
                                    <i className="ri-edit-line"></i>
                                  </button>
                                  <button onClick={() => handleDeleteVehicle(vehicle.id)} className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg cursor-pointer">
                                    <i className="ri-delete-bin-line"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* ===== TAB: TIPOS DE VEHÍCULO ===== */}
            {activeTab === 'tipos' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Tipos</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{vehicleTypes.length}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-teal-100 rounded-lg">
                        <i className="ri-list-settings-line text-2xl text-teal-600"></i>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Activos</p>
                        <p className="text-2xl font-bold text-green-600 mt-1">{vehicleTypes.filter(t => t.status === 'activo').length}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-lg">
                        <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Inactivos</p>
                        <p className="text-2xl font-bold text-gray-600 mt-1">{vehicleTypes.filter(t => t.status === 'inactivo').length}</p>
                      </div>
                      <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                        <i className="ri-close-circle-line text-2xl text-gray-600"></i>
                      </div>
                    </div>
                  </Card>
                </div>

                {loadingTypes ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
                      <p className="text-gray-600 mt-2">Cargando tipos...</p>
                    </div>
                  </div>
                ) : vehicleTypes.length === 0 ? (
                  <Card className="p-12 text-center">
                    <i className="ri-list-settings-line text-6xl text-gray-300"></i>
                    <h3 className="text-lg font-semibold text-gray-900 mt-4">No hay tipos de vehículo</h3>
                    <p className="text-gray-600 mt-2">Crea tu primer tipo para usarlo en los vehículos</p>
                    <Button
                      onClick={() => { setSelectedType(null); setIsTypeModalOpen(true); }}
                      className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <i className="ri-add-line"></i>
                      Nuevo Tipo
                    </Button>
                  </Card>
                ) : (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehículos</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {vehicleTypes.map((type) => {
                            const count = vehicles.filter(v => v.vehicle_type === type.id).length;
                            return (
                              <tr key={type.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg">
                                      <i className={`${type.icon || 'ri-truck-line'} text-xl text-teal-600`}></i>
                                    </div>
                                    <span className="font-medium text-gray-900">{type.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-sm text-gray-600">{type.description || '—'}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                    {count} vehículo{count !== 1 ? 's' : ''}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <Badge className={type.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                                    {type.status === 'activo' ? 'Activo' : 'Inactivo'}
                                  </Badge>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => { setSelectedType(type); setIsTypeModalOpen(true); }}
                                      className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer"
                                    >
                                      <i className="ri-edit-line"></i>
                                    </button>
                                    <button
                                      onClick={() => { setSelectedType(type); setIsTypeDeleteModalOpen(true); }}
                                      className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                    >
                                      <i className="ri-delete-bin-line"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <VehicleModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedVehicle(null); }}
        onSuccess={loadVehicles}
        vehicle={selectedVehicle}
        organizationId={appUser?.organization_id || ''}
        vehicleTypes={vehicleTypes}
      />

      <VehicleTypeModal
        isOpen={isTypeModalOpen}
        onClose={() => { setIsTypeModalOpen(false); setSelectedType(null); }}
        onSuccess={loadVehicleTypes}
        vehicleType={selectedType}
        organizationId={appUser?.organization_id || ''}
      />

      <VehicleTypeDeleteModal
        isOpen={isTypeDeleteModalOpen}
        onClose={() => { setIsTypeDeleteModalOpen(false); setSelectedType(null); }}
        onSuccess={loadVehicleTypes}
        vehicleType={selectedType}
      />

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onSuccess={loadVehicles}
        fields={csvFields}
        tableName="vehicles"
        templateFileName="plantilla_vehiculos.csv"
        transformRow={transformVehicleRow}
        title="Importar Vehículos"
      />
    </div>
  );
};

export default VehiculosPage;
