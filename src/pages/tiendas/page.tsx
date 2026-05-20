import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import StoreModal from './components/StoreModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import CsvImportModal from '../../components/feature/CsvImportModal';

interface Country {
  id: string;
  name: string;
  code: string;
  flag_emoji: string;
}

interface Store {
  id: string;
  name: string;
  code: string;
  country_id: string;
  store_type: string;
  manager_name: string;
  status: string;
  is_origin: boolean;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  opening_hours: string;
  capacity: number | null;
  area_m2: number | null;
  delivery_zone: string;
  notes: string;
  phone: string;
  email: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  created_at: string;
  countries?: { id: string; name: string; code: string; flag_emoji: string };
}

const STORE_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  store: { label: 'Tienda', icon: 'ri-store-2-line', color: 'text-teal-600', bg: 'bg-teal-50' },
  warehouse: { label: 'Bodega', icon: 'ri-building-line', color: 'text-amber-600', bg: 'bg-amber-50' },
  distribution_center: { label: 'C. Distribución', icon: 'ri-truck-line', color: 'text-violet-600', bg: 'bg-violet-50' },
};

export default function TiendasPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => { fetchOrganizationAndData(); }, []);
  useEffect(() => { filterStores(); }, [stores, searchTerm, statusFilter, countryFilter, typeFilter]);

  const fetchOrganizationAndData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userData } = await supabase
        .from('app_users').select('organization_id').eq('auth_user_id', user.id).maybeSingle();
      if (userData) {
        setOrganizationId(userData.organization_id);
        await Promise.all([
          fetchStores(userData.organization_id),
          fetchCountries(userData.organization_id),
        ]);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async (orgId: string) => {
    const { data, error } = await supabase
      .from('stores')
      .select('*, countries(id, name, code, flag_emoji)')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    if (!error) setStores(data || []);
  };

  const fetchCountries = async (orgId: string) => {
    const { data } = await supabase
      .from('countries').select('id, name, code, flag_emoji')
      .eq('organization_id', orgId).eq('status', 'active').order('name');
    setCountries(data || []);
  };

  const filterStores = () => {
    let filtered = [...stores];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term) ||
        s.city?.toLowerCase().includes(term) ||
        s.manager_name?.toLowerCase().includes(term) ||
        s.delivery_zone?.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') filtered = filtered.filter(s => s.status === statusFilter);
    if (countryFilter !== 'all') filtered = filtered.filter(s => s.country_id === countryFilter);
    if (typeFilter !== 'all') filtered = filtered.filter(s => s.store_type === typeFilter);
    setFilteredStores(filtered);
  };

  const handleSaveStore = async (storeData: any) => {
    try {
      const payload = {
        name: storeData.name, code: storeData.code, country_id: storeData.country_id,
        address: storeData.address, city: storeData.city, state: storeData.state,
        postal_code: storeData.postal_code, latitude: storeData.latitude, longitude: storeData.longitude,
        phone: storeData.phone, email: storeData.email, store_type: storeData.store_type,
        manager_name: storeData.manager_name, status: storeData.status, is_origin: storeData.is_origin,
        opening_hours: storeData.opening_hours, capacity: storeData.capacity, area_m2: storeData.area_m2,
        delivery_zone: storeData.delivery_zone, notes: storeData.notes,
        contact_name: storeData.contact_name, contact_phone: storeData.contact_phone,
        contact_email: storeData.contact_email, updated_at: new Date().toISOString(),
      };
      if (storeData.id) {
        const { error } = await supabase.from('stores').update(payload).eq('id', storeData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('stores').insert([{ ...payload, organization_id: organizationId }]);
        if (error) throw error;
      }
      await fetchStores(organizationId);
      setIsModalOpen(false);
      setSelectedStore(null);
    } catch (error) {
      console.error('Error al guardar tienda:', error);
    }
  };

  const handleDeleteStore = async () => {
    if (!storeToDelete) return;
    try {
      const { error } = await supabase.from('stores').delete().eq('id', storeToDelete.id);
      if (error) throw error;
      await fetchStores(organizationId);
      setIsDeleteModalOpen(false);
      setStoreToDelete(null);
    } catch (error) {
      console.error('Error al eliminar tienda:', error);
    }
  };

  const openEdit = (store: Store) => { setSelectedStore(store); setIsModalOpen(true); };
  const openDelete = (store: Store) => { setStoreToDelete(store); setIsDeleteModalOpen(true); };

  const activeCount = stores.filter(s => s.status === 'active').length;
  const warehouseCount = stores.filter(s => s.store_type === 'warehouse').length;
  const originCount = stores.filter(s => s.is_origin).length;
  const dcCount = stores.filter(s => s.store_type === 'distribution_center').length;

  const csvFields = [
    { key: 'name', label: 'name', required: true, type: 'text' as const },
    { key: 'code', label: 'code', required: true, type: 'text' as const },
    { key: 'country_code', label: 'country_code', required: true, type: 'text' as const },
    { key: 'store_type', label: 'store_type', required: true, type: 'text' as const },
    { key: 'address', label: 'address', required: true, type: 'text' as const },
    { key: 'city', label: 'city', required: true, type: 'text' as const },
    { key: 'state', label: 'state', required: false, type: 'text' as const },
    { key: 'postal_code', label: 'postal_code', required: false, type: 'text' as const },
    { key: 'latitude', label: 'latitude', required: false, type: 'number' as const },
    { key: 'longitude', label: 'longitude', required: false, type: 'number' as const },
    { key: 'opening_hours', label: 'opening_hours', required: false, type: 'text' as const },
    { key: 'capacity', label: 'capacity', required: false, type: 'number' as const },
    { key: 'area_m2', label: 'area_m2', required: false, type: 'number' as const },
    { key: 'delivery_zone', label: 'delivery_zone', required: false, type: 'text' as const },
    { key: 'phone', label: 'phone', required: false, type: 'text' as const },
    { key: 'email', label: 'email', required: false, type: 'email' as const },
    { key: 'manager_name', label: 'manager_name', required: false, type: 'text' as const },
    { key: 'status', label: 'status', required: true, type: 'text' as const },
    { key: 'is_origin', label: 'is_origin', required: false, type: 'boolean' as const },
  ];

  const transformStoreRow = async (row: any) => {
    // Resolver country_code → country_id
    const { data: country } = await supabase
      .from('countries')
      .select('id')
      .eq('code', row.country_code)
      .eq('organization_id', organizationId)
      .single();

    if (!country) {
      throw new Error(`País con código "${row.country_code}" no encontrado`);
    }

    const transformed = { ...row };
    transformed.country_id = country.id;
    delete transformed.country_code;

    return transformed;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-2 text-slate-600 text-sm">Cargando puntos de entrega...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Puntos de Entrega</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona los puntos de entrega, bodegas y centros de distribución</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setIsCsvImportOpen(true)}
            icon={<i className="ri-file-upload-line"></i>}
          >
            Importar CSV
          </Button>
          <Button
            variant="primary"
            onClick={() => { setSelectedStore(null); setIsModalOpen(true); }}
            icon={<i className="ri-add-line"></i>}
          >
            Nuevo Punto de Entrega
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Ubicaciones', value: stores.length, icon: 'ri-store-2-line', color: 'bg-teal-50 text-teal-600', border: 'border-teal-100' },
          { label: 'Activas', value: activeCount, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
          { label: 'Bodegas', value: warehouseCount, icon: 'ri-building-line', color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
          { label: 'Puntos de Origen', value: originCount, icon: 'ri-map-pin-2-line', color: 'bg-violet-50 text-violet-600', border: 'border-violet-100' },
        ].map((kpi) => (
          <div key={kpi.label} className={`bg-white rounded-xl border ${kpi.border} p-4 flex items-center gap-4`}>
            <div className={`w-11 h-11 flex items-center justify-center rounded-lg ${kpi.color}`}>
              <i className={`${kpi.icon} text-xl`}></i>
            </div>
            <div>
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 flex-wrap">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Input
                type="text"
                placeholder="Buscar por nombre, código, ciudad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon="ri-search-line"
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'Todos los países' },
                  ...countries.map(c => ({ value: c.id, label: `${c.flag_emoji || ''} ${c.name}`.trim() })),
                ]}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'Todos los tipos' },
                  { value: 'store', label: 'Tienda' },
                  { value: 'warehouse', label: 'Bodega' },
                  { value: 'distribution_center', label: 'C. Distribución' },
                ]}
              />
            </div>
            <div className="w-full sm:w-40">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'Todos los estados' },
                  { value: 'active', label: 'Activos' },
                  { value: 'inactive', label: 'Inactivos' },
                ]}
              />
            </div>
          </div>
          {/* Toggle vista */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <i className="ri-list-check text-base"></i>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${viewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <i className="ri-layout-grid-line text-base"></i>
            </button>
          </div>
        </div>

        {/* Contador */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
          <span className="text-xs text-slate-500">
            {filteredStores.length} ubicación{filteredStores.length !== 1 ? 'es' : ''} encontrada{filteredStores.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Vista Tabla */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ubicación</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">País / Ciudad</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Dirección</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Capacidad</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Responsable</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <i className="ri-store-2-line text-5xl text-slate-200"></i>
                        <p className="text-slate-400 font-medium">No se encontraron puntos de entrega</p>
                        <p className="text-slate-400 text-sm">Intenta ajustar los filtros o crea un nuevo punto de entrega</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStores.map((store) => {
                    const typeConf = STORE_TYPE_CONFIG[store.store_type] || STORE_TYPE_CONFIG.store;
                    return (
                      <tr key={store.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeConf.bg}`}>
                              <i className={`${typeConf.icon} text-lg ${typeConf.color}`}></i>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 text-sm">{store.name}</span>
                                {store.is_origin && (
                                  <span className="inline-flex items-center gap-0.5 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                                    <i className="ri-map-pin-2-fill text-xs"></i> Origen
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">{store.code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${typeConf.bg} ${typeConf.color}`}>
                            <i className={typeConf.icon}></i>
                            {typeConf.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-slate-700">
                            {store.countries?.flag_emoji} {store.countries?.name}
                          </div>
                          <div className="text-xs text-slate-400">{store.city}{store.state ? `, ${store.state}` : ''}</div>
                        </td>
                        <td className="px-5 py-4 max-w-[200px]">
                          <div className="text-sm text-slate-700 truncate">{store.address || <span className="text-slate-300">—</span>}</div>
                          {store.delivery_zone && (
                            <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <i className="ri-map-pin-line"></i>{store.delivery_zone}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {store.capacity ? (
                            <div>
                              <div className="text-sm font-semibold text-slate-800">{store.capacity.toLocaleString()}</div>
                              {store.area_m2 && <div className="text-xs text-slate-400">{store.area_m2} m²</div>}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-slate-700">{store.manager_name || <span className="text-slate-300">—</span>}</div>
                          {store.phone && <div className="text-xs text-slate-400">{store.phone}</div>}
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant={store.status === 'active' ? 'success' : 'danger'} size="sm">
                            {store.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(store)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                            <button
                              onClick={() => openDelete(store)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Vista Tarjetas */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredStores.length === 0 ? (
              <div className="col-span-full py-16 text-center">
                <i className="ri-store-2-line text-5xl text-slate-200"></i>
                <p className="mt-2 text-slate-400">No se encontraron puntos de entrega</p>
              </div>
            ) : (
              filteredStores.map((store) => {
                const typeConf = STORE_TYPE_CONFIG[store.store_type] || STORE_TYPE_CONFIG.store;
                return (
                  <div key={store.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-all group">
                    {/* Card header */}
                    <div className={`h-1.5 w-full ${store.store_type === 'warehouse' ? 'bg-amber-400' : store.store_type === 'distribution_center' ? 'bg-violet-400' : 'bg-teal-400'}`}></div>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${typeConf.bg}`}>
                          <i className={`${typeConf.icon} text-xl ${typeConf.color}`}></i>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={store.status === 'active' ? 'success' : 'danger'} size="sm">
                            {store.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Badge>
                          {store.is_origin && (
                            <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                              <i className="ri-map-pin-2-fill text-xs"></i> Origen
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm leading-tight mb-0.5">{store.name}</h3>
                      <p className="text-xs font-mono text-slate-400 mb-3">{store.code}</p>

                      <div className="space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <i className="ri-global-line text-slate-400 w-3.5"></i>
                          <span>{store.countries?.flag_emoji} {store.countries?.name}</span>
                        </div>
                        {store.city && (
                          <div className="flex items-center gap-1.5">
                            <i className="ri-map-pin-line text-slate-400 w-3.5"></i>
                            <span className="truncate">{store.city}{store.state ? `, ${store.state}` : ''}</span>
                          </div>
                        )}
                        {store.manager_name && (
                          <div className="flex items-center gap-1.5">
                            <i className="ri-user-line text-slate-400 w-3.5"></i>
                            <span className="truncate">{store.manager_name}</span>
                          </div>
                        )}
                        {store.capacity && (
                          <div className="flex items-center gap-1.5">
                            <i className="ri-archive-line text-slate-400 w-3.5"></i>
                            <span>{store.capacity.toLocaleString()} uds{store.area_m2 ? ` · ${store.area_m2} m²` : ''}</span>
                          </div>
                        )}
                        {store.opening_hours && (
                          <div className="flex items-center gap-1.5">
                            <i className="ri-time-line text-slate-400 w-3.5"></i>
                            <span className="truncate">{store.opening_hours}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeConf.bg} ${typeConf.color}`}>
                          {typeConf.label}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(store)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                          >
                            <i className="ri-edit-line text-sm"></i>
                          </button>
                          <button
                            onClick={() => openDelete(store)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <StoreModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedStore(null); }}
        onSave={handleSaveStore}
        store={selectedStore}
        organizationId={organizationId}
        countries={countries}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setStoreToDelete(null); }}
        onConfirm={handleDeleteStore}
        title="Eliminar Punto de Entrega"
        description={`¿Estás seguro de que deseas eliminar el punto de entrega "${storeToDelete?.name}"? Esta acción no se puede deshacer.`}
      />

      <CsvImportModal
        isOpen={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
        onImportComplete={() => fetchStores(organizationId)}
        fields={csvFields}
        tableName="stores"
        templateFileName="plantilla_tiendas.csv"
        organizationId={organizationId}
        transformRow={transformStoreRow}
        title="Importar Puntos de Entrega desde CSV"
      />
    </div>
  );
}
