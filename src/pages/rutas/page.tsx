import { useState, useEffect } from 'react';
import Header from '../../components/feature/Header';
import Sidebar from '../../components/feature/Sidebar';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
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

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
                <p className="mt-4 text-gray-600">Cargando catálogo de rutas...</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Catálogo de Rutas</h1>
                <p className="text-gray-600 mt-1">Gestiona las rutas y tipos de ruta de tu organización</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200">
                <div className="flex items-center justify-between px-6 py-4">
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
              </div>

              {activeTab === 'routes' ? (
                <div className="overflow-x-auto">
                  {routes.length === 0 ? (
                    <div className="text-center py-12">
                      <i className="ri-route-line text-5xl text-gray-300 mb-4"></i>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No hay rutas</h3>
                      <p className="text-gray-600 mb-6">Comienza creando tu primera ruta</p>
                      <Button onClick={() => setIsModalOpen(true)}>
                        <i className="ri-add-line mr-2"></i>
                        Nueva Ruta
                      </Button>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Nombre
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Tipo de Ruta
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
                        {routes.map((route) => (
                          <tr key={route.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg mr-3">
                                  <i className="ri-route-line text-teal-600 text-lg"></i>
                                </div>
                                <div className="font-medium text-gray-900">{route.route_number}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {route.route_types?.name || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={route.status === 'active' ? 'success' : 'default'}>
                                {route.status === 'active' ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handleEdit(route)}
                                className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors mr-2 inline-flex cursor-pointer"
                              >
                                <i className="ri-edit-line"></i>
                              </button>
                              <button
                                onClick={() => handleDelete(route.id)}
                                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex cursor-pointer"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {routeTypes.length === 0 ? (
                    <div className="text-center py-12">
                      <i className="ri-list-check text-5xl text-gray-300 mb-4"></i>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No hay tipos de ruta</h3>
                      <p className="text-gray-600 mb-6">Comienza creando tu primer tipo de ruta</p>
                      <Button onClick={() => setIsTypeModalOpen(true)}>
                        <i className="ri-add-line mr-2"></i>
                        Nuevo Tipo
                      </Button>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Nombre
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
                        {routeTypes.map((type) => (
                          <tr key={type.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-10 h-10 flex items-center justify-center bg-purple-100 rounded-lg mr-3">
                                  <i className="ri-list-check text-purple-600 text-lg"></i>
                                </div>
                                <div className="font-medium text-gray-900">{type.name}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={type.status === 'active' ? 'success' : 'default'}>
                                {type.status === 'active' ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handleEditType(type)}
                                className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors mr-2 inline-flex cursor-pointer"
                              >
                                <i className="ri-edit-line"></i>
                              </button>
                              <button
                                onClick={() => handleDeleteType(type)}
                                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex cursor-pointer"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

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