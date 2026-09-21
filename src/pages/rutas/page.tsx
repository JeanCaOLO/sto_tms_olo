import { useState, useEffect } from 'react';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import RouteModal from './components/RouteModal';
import RouteTypeModal from './components/RouteTypeModal';
import RouteTypeDeleteModal from './components/RouteTypeDeleteModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export default function RutasPage() {
  const { appUser } = useAuth();
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeTypes, setRouteTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'routes' | 'types'>('routes');

  useEffect(() => {
    if (appUser?.organization_id) {
      loadData();
    }
  }, [appUser?.organization_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadRoutes(), loadRouteTypes()]);
    } finally {
      setLoading(false);
    }
  };

  const loadRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from('routes')
        .select(`
          *,
          route_types (
            id,
            name
          )
        `)
        .eq('organization_id', appUser?.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRoutes(data || []);
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  };

  const loadRouteTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('route_types')
        .select('*')
        .eq('organization_id', appUser?.organization_id)
        .order('name');

      if (error) throw error;
      setRouteTypes(data || []);
    } catch (error) {
      console.error('Error loading route types:', error);
    }
  };

  const handleEdit = (route: any) => {
    setSelectedRoute(route);
    setIsModalOpen(true);
  };

  const handleEditType = (type: any) => {
    setSelectedType(type);
    setIsTypeModalOpen(true);
  };

  const handleDeleteType = (type: any) => {
    setSelectedType(type);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta ruta?')) return;

    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadRoutes();
    } catch (error) {
      console.error('Error deleting route:', error);
      alert('Error al eliminar la ruta');
    }
  };

  const activeRoutes = routes.filter(r => r.status === 'active');
  const activeTypes = routeTypes.filter(t => t.status === 'active');

  const routeColumns: DataTableColumn<any>[] = [
    {
      key: 'route_number',
      header: 'Nombre',
      accessor: (r) => r.route_number,
      sortable: true,
      render: (r) => (
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg mr-3">
            <i className="ri-route-line text-teal-600 text-lg"></i>
          </div>
          <div className="font-medium text-gray-900">{r.route_number}</div>
        </div>
      ),
    },
    {
      key: 'route_type',
      header: 'Tipo de Ruta',
      accessor: (r) => r.route_types?.name ?? '',
      sortable: true,
      filterable: true,
      render: (r) => <span className="text-sm text-gray-900">{r.route_types?.name || '-'}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (r) => (r.status === 'active' ? 'Activo' : 'Inactivo'),
      filterable: true,
      render: (r) => <Badge variant={r.status === 'active' ? 'success' : 'default'}>{r.status === 'active' ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ];

  const routeTypeColumns: DataTableColumn<any>[] = [
    {
      key: 'name',
      header: 'Nombre',
      accessor: (t) => t.name,
      sortable: true,
      render: (t) => (
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center bg-purple-100 rounded-lg mr-3">
            <i className="ri-list-check text-purple-600 text-lg"></i>
          </div>
          <div className="font-medium text-gray-900">{t.name}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (t) => (t.status === 'active' ? 'Activo' : 'Inactivo'),
      filterable: true,
      render: (t) => <Badge variant={t.status === 'active' ? 'success' : 'default'}>{t.status === 'active' ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-4 text-gray-600">Cargando catálogo de rutas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de Rutas</h1>
          <p className="text-gray-600 mt-1">Gestiona las rutas y tipos de ruta de tu organización</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total de Rutas"
          value={routes.length}
          icon="ri-route-line"
          color="blue"
        />
        <StatCard
          title="Rutas Activas"
          value={activeRoutes.length}
          icon="ri-checkbox-circle-line"
          color="green"
        />
        <StatCard
          title="Tipos de Ruta"
          value={activeTypes.length}
          icon="ri-list-check"
          color="purple"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-full">
          <button
            onClick={() => setActiveTab('routes')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'routes'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Rutas
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'types'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Tipos de Ruta
          </button>
        </div>
        <Button
          onClick={() => {
            if (activeTab === 'routes') {
              setSelectedRoute(null);
              setIsModalOpen(true);
            } else {
              setSelectedType(null);
              setIsTypeModalOpen(true);
            }
          }}
        >
          <i className="ri-add-line mr-2"></i>
          {activeTab === 'routes' ? 'Nueva Ruta' : 'Nuevo Tipo'}
        </Button>
      </div>

      {activeTab === 'routes' ? (
        <DataTable
          data={routes}
          columns={routeColumns}
          getRowId={(r) => r.id}
          searchPlaceholder="Buscar ruta..."
          exportFileName="rutas"
          emptyMessage="No hay rutas"
          actions={(route) => (
            <>
              <button
                onClick={() => handleEdit(route)}
                className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors inline-flex cursor-pointer"
              >
                <i className="ri-edit-line"></i>
              </button>
              <button
                onClick={() => handleDelete(route.id)}
                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex cursor-pointer"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </>
          )}
        />
      ) : (
        <DataTable
          data={routeTypes}
          columns={routeTypeColumns}
          getRowId={(t) => t.id}
          searchPlaceholder="Buscar tipo de ruta..."
          exportFileName="tipos_de_ruta"
          emptyMessage="No hay tipos de ruta"
          actions={(type) => (
            <>
              <button
                onClick={() => handleEditType(type)}
                className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors inline-flex cursor-pointer"
              >
                <i className="ri-edit-line"></i>
              </button>
              <button
                onClick={() => handleDeleteType(type)}
                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex cursor-pointer"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </>
          )}
        />
      )}

      <RouteModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedRoute(null);
        }}
        onSuccess={loadRoutes}
        route={selectedRoute}
      />

      <RouteTypeModal
        isOpen={isTypeModalOpen}
        onClose={() => {
          setIsTypeModalOpen(false);
          setSelectedType(null);
        }}
        onSuccess={loadRouteTypes}
        routeType={selectedType}
      />

      <RouteTypeDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedType(null);
        }}
        onSuccess={loadRouteTypes}
        routeType={selectedType}
      />
    </div>
  );
}