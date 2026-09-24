import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import VehicleModal from './components/VehicleModal';
import VehicleTypeModal from './components/VehicleTypeModal';
import VehicleTypeDeleteModal from './components/VehicleTypeDeleteModal';
import CsvImportModal from '../../components/feature/CsvImportModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

type Tab = 'vehiculos' | 'tipos';

const VehiculosPage = () => {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('vehiculos');

  // --- Vehículos ---
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, maintenance: 0, inactive: 0 });

  // --- Tipos de Vehículo ---
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isTypeDeleteModalOpen, setIsTypeDeleteModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<any>(null);
  const { canCreate, canEdit, canDelete } = useModulePermissions('vehiculos');
  const { t } = useTranslation();

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
      case 'activo': return t('vehicles.statusActive');
      case 'mantenimiento': return t('vehicles.statusMaintenance');
      case 'inactivo': return t('vehicles.statusInactive');
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

  const vehicleColumns: DataTableColumn<any>[] = [
    {
      key: 'plate',
      header: t('vehicles.colVehicle'),
      accessor: (v) => v.plate,
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg">
            <i className={`${getVehicleTypeIcon(v.vehicle_type)} text-xl text-teal-600`}></i>
          </div>
          <div>
            <div className="font-medium text-gray-900">{v.plate}</div>
            <div className="text-sm text-gray-600">{v.brand} {v.model} ({v.year})</div>
          </div>
        </div>
      ),
    },
    {
      key: 'vehicle_type',
      header: t('vehicles.colType'),
      accessor: (v) => getVehicleTypeName(v.vehicle_type),
      sortable: true,
      filterable: true,
    },
    {
      key: 'carrier',
      header: t('vehicles.colCarrier'),
      accessor: (v) => v.carrier?.name ?? '',
      sortable: true,
      filterable: true,
    },
    {
      key: 'capacity',
      header: t('vehicles.colCapacity'),
      accessor: (v) => v.capacity_weight,
      render: (v) => (
        <>
          <div className="text-sm text-gray-900">{v.capacity_weight} kg</div>
          <div className="text-sm text-gray-600">{v.capacity_volume} m³</div>
        </>
      ),
    },
    {
      key: 'status',
      header: t('vehicles.colStatus'),
      accessor: (v) => getStatusLabel(v.status),
      filterable: true,
      render: (v) => <Badge className={getStatusColor(v.status)}>{getStatusLabel(v.status)}</Badge>,
    },
  ];

  const typeColumns: DataTableColumn<any>[] = [
    {
      key: 'name',
      header: t('vehicles.colType'),
      accessor: (row) => row.name,
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg">
            <i className={`${row.icon || 'ri-truck-line'} text-xl text-teal-600`}></i>
          </div>
          <span className="font-medium text-gray-900">{row.name}</span>
        </div>
      ),
    },
    { key: 'description', header: t('vehicles.colDescription'), accessor: (row) => row.description ?? '—' },
    {
      key: 'count',
      header: t('vehicles.colVehicles'),
      accessor: (row) => vehicles.filter((v) => v.vehicle_type === row.id).length,
      sortable: true,
      render: (row) => {
        const count = vehicles.filter((v) => v.vehicle_type === row.id).length;
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
            {t('vehicles.count', { count })}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('vehicles.colStatus'),
      accessor: (row) => (row.status === 'activo' ? t('vehicles.typeActive') : t('vehicles.typeInactive')),
      filterable: true,
      render: (row) => (
        <Badge className={row.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
          {row.status === 'activo' ? t('vehicles.typeActive') : t('vehicles.typeInactive')}
        </Badge>
      ),
    },
  ];

  // ---- RENDER ----
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('vehicles.title')}</h1>
          <p className="text-sm text-gray-600 mt-1">{t('vehicles.subtitle')}</p>
        </div>
        {canCreate && (activeTab === 'vehiculos' ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCsvModalOpen(true)}
              className="px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 flex items-center gap-2 whitespace-nowrap"
            >
              <i className="ri-file-excel-line"></i>
              {t('vehicles.importCsv')}
            </Button>
            <Button
              onClick={() => { setSelectedVehicle(null); setIsModalOpen(true); }}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2 whitespace-nowrap"
            >
              <i className="ri-add-line"></i>
              {t('vehicles.new')}
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => { setSelectedType(null); setIsTypeModalOpen(true); }}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            {t('vehicles.newType')}
          </Button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('vehiculos')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'vehiculos'
              ? 'bg-white text-teal-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <i className="ri-truck-line mr-2"></i>
          {t('vehicles.tabVehicles')}
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
          {t('vehicles.tabTypes')}
        </button>
      </div>

      {/* ===== TAB: VEHÍCULOS ===== */}
      {activeTab === 'vehiculos' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('vehicles.kpiTotal')}</p>
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
                  <p className="text-sm text-gray-600">{t('vehicles.kpiActive')}</p>
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
                  <p className="text-sm text-gray-600">{t('vehicles.kpiMaintenance')}</p>
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
                  <p className="text-sm text-gray-600">{t('vehicles.kpiInactive')}</p>
                  <p className="text-2xl font-bold text-gray-600 mt-1">{stats.inactive}</p>
                </div>
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                  <i className="ri-close-circle-line text-2xl text-gray-600"></i>
                </div>
              </div>
            </Card>
          </div>

          <DataTable
            data={vehicles}
            columns={vehicleColumns}
            getRowId={(v) => v.id}
            loading={loadingVehicles}
            searchPlaceholder={t('vehicles.search')}
            exportFileName="vehiculos"
            emptyMessage={t('vehicles.empty')}
            actions={(v) => (
              <>
                {canEdit && (
                  <button onClick={() => { setSelectedVehicle(v); setIsModalOpen(true); }} className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer">
                    <i className="ri-edit-line"></i>
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => handleDeleteVehicle(v.id)} className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg cursor-pointer">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                )}
              </>
            )}
          />
        </>
      )}

      {/* ===== TAB: TIPOS DE VEHÍCULO ===== */}
      {activeTab === 'tipos' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('vehicles.kpiTotalTypes')}</p>
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
                  <p className="text-sm text-gray-600">{t('vehicles.kpiActive')}</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{vehicleTypes.filter(vt => vt.status === 'activo').length}</p>
                </div>
                <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-lg">
                  <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('vehicles.kpiInactive')}</p>
                  <p className="text-2xl font-bold text-gray-600 mt-1">{vehicleTypes.filter(vt => vt.status === 'inactivo').length}</p>
                </div>
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                  <i className="ri-close-circle-line text-2xl text-gray-600"></i>
                </div>
              </div>
            </Card>
          </div>

          <DataTable
            data={vehicleTypes}
            columns={typeColumns}
            getRowId={(row) => row.id}
            loading={loadingTypes}
            searchPlaceholder={t('vehicles.searchTypes')}
            exportFileName="tipos_vehiculo"
            emptyMessage={t('vehicles.emptyTypes')}
            actions={(row) => (
              <>
                {canEdit && (
                  <button
                    onClick={() => { setSelectedType(row); setIsTypeModalOpen(true); }}
                    className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => { setSelectedType(row); setIsTypeDeleteModalOpen(true); }}
                    className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                )}
              </>
            )}
          />
        </>
      )}

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
        onImportComplete={loadVehicles}
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
