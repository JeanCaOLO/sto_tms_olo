import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import CountryModal from './components/CountryModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import CsvImportModal from '../../components/feature/CsvImportModal';

interface Country {
  id: string;
  name: string;
  code: string;
  iso_code: string;
  currency: string;
  timezone: string;
  phone_code: string;
  flag_emoji: string;
  capital: string;
  language: string;
  notes: string;
  status: string;
  created_at: string;
  store_count?: number;
}

export default function PaisesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryToDelete, setCountryToDelete] = useState<Country | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [storeCounts, setStoreCounts] = useState<Record<string, number>>({});
  const [deleteError, setDeleteError] = useState<string>('');

  const csvFields = [
    { key: 'name', label: 'name', required: true, type: 'text' as const },
    { key: 'code', label: 'code', required: true, type: 'text' as const },
    { key: 'iso_code', label: 'iso_code', required: true, type: 'text' as const },
    { key: 'currency', label: 'currency', required: true, type: 'text' as const },
    { key: 'timezone', label: 'timezone', required: true, type: 'text' as const },
    { key: 'phone_code', label: 'phone_code', required: false, type: 'text' as const },
    { key: 'flag_emoji', label: 'flag_emoji', required: false, type: 'text' as const },
    { key: 'capital', label: 'capital', required: false, type: 'text' as const },
    { key: 'language', label: 'language', required: false, type: 'text' as const },
    { key: 'status', label: 'status', required: true, type: 'text' as const },
  ];

  useEffect(() => {
    fetchOrganizationAndCountries();
  }, []);

  useEffect(() => {
    filterCountries();
  }, [countries, searchTerm, statusFilter]);

  const fetchOrganizationAndCountries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userData } = await supabase
        .from('app_users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (userData) {
        setOrganizationId(userData.organization_id);
        await fetchCountries(userData.organization_id);
        await fetchStoreCounts(userData.organization_id);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCountries = async (orgId: string) => {
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    if (!error) setCountries(data || []);
  };

  const fetchStoreCounts = async (orgId: string) => {
    const { data } = await supabase
      .from('stores')
      .select('country_id')
      .eq('organization_id', orgId);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((s: any) => {
        counts[s.country_id] = (counts[s.country_id] || 0) + 1;
      });
      setStoreCounts(counts);
    }
  };

  const filterCountries = () => {
    let filtered = [...countries];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term) ||
        c.iso_code?.toLowerCase().includes(term) ||
        c.capital?.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    setFilteredCountries(filtered);
  };

  const handleSaveCountry = async (countryData: any) => {
    try {
      const payload = {
        name: countryData.name,
        code: countryData.code,
        iso_code: countryData.iso_code,
        currency: countryData.currency,
        timezone: countryData.timezone,
        phone_code: countryData.phone_code,
        flag_emoji: countryData.flag_emoji,
        capital: countryData.capital,
        language: countryData.language,
        notes: countryData.notes,
        status: countryData.status,
        updated_at: new Date().toISOString(),
      };
      if (countryData.id) {
        const { error } = await supabase.from('countries').update(payload).eq('id', countryData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('countries').insert([{ ...payload, organization_id: organizationId }]);
        if (error) throw error;
      }
      await fetchCountries(organizationId);
      setIsModalOpen(false);
      setSelectedCountry(null);
    } catch (error) {
      console.error('Error al guardar país:', error);
    }
  };

  const handleDeleteCountry = async () => {
    if (!countryToDelete) return;
    setDeleteError('');
    try {
      const { error } = await supabase.from('countries').delete().eq('id', countryToDelete.id);
      if (error) {
        if (error.code === '23503') {
          setDeleteError('No se puede eliminar este país porque tiene registros asociados (transportistas, tiendas u otros). Primero elimina o reasigna esos registros.');
          return;
        }
        throw error;
      }
      await fetchCountries(organizationId);
      setIsDeleteModalOpen(false);
      setCountryToDelete(null);
    } catch (error) {
      console.error('Error al eliminar país:', error);
      setDeleteError('Ocurrió un error inesperado al intentar eliminar el país.');
    }
  };

  const openEdit = (country: Country) => {
    setSelectedCountry(country);
    setIsModalOpen(true);
  };

  const openDelete = (country: Country) => {
    setCountryToDelete(country);
    setIsDeleteModalOpen(true);
  };

  const activeCount = countries.filter(c => c.status === 'active').length;
  const inactiveCount = countries.filter(c => c.status === 'inactive').length;
  const totalStores = Object.values(storeCounts).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-2 text-slate-600 text-sm">Cargando países...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Países</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona los países de operación de tu red logística</p>
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
            onClick={() => { setSelectedCountry(null); setIsModalOpen(true); }}
            icon={<i className="ri-add-line"></i>}
          >
            Nuevo País
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Países', value: countries.length, icon: 'ri-global-line', color: 'bg-teal-50 text-teal-600', border: 'border-teal-100' },
          { label: 'Activos', value: activeCount, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
          { label: 'Inactivos', value: inactiveCount, icon: 'ri-close-circle-line', color: 'bg-red-50 text-red-600', border: 'border-red-100' },
          { label: 'Tiendas Totales', value: totalStores, icon: 'ri-store-2-line', color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
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

      {/* Filtros y controles */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="flex-1 max-w-sm">
              <Input
                type="text"
                placeholder="Buscar por nombre, código, capital..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon="ri-search-line"
              />
            </div>
            <div className="w-full sm:w-44">
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
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
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

        {/* Resultado */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
          <span className="text-xs text-slate-500">{filteredCountries.length} país{filteredCountries.length !== 1 ? 'es' : ''} encontrado{filteredCountries.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Vista Tabla */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">País</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Códigos</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Capital</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Moneda / Tel.</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Zona Horaria</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tiendas</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCountries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <i className="ri-global-line text-5xl text-slate-200"></i>
                        <p className="text-slate-400 font-medium">No se encontraron países</p>
                        <p className="text-slate-400 text-sm">Intenta ajustar los filtros o crea un nuevo país</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCountries.map((country) => (
                    <tr key={country.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            {country.flag_emoji || country.code?.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{country.name}</div>
                            {country.language && <div className="text-xs text-slate-400">{country.language}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded w-fit">{country.code}</span>
                          <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded w-fit">{country.iso_code}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-slate-700">{country.capital || <span className="text-slate-300">—</span>}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-semibold text-slate-900">{country.currency}</div>
                        {country.phone_code && <div className="text-xs text-slate-400">{country.phone_code}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{country.timezone}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                          <i className="ri-store-2-line text-teal-500"></i>
                          {storeCounts[country.id] || 0}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={country.status === 'active' ? 'success' : 'danger'} size="sm">
                          {country.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(country)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                          <button
                            onClick={() => openDelete(country)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
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
        )}

        {/* Vista Tarjetas */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCountries.length === 0 ? (
              <div className="col-span-full py-16 text-center">
                <i className="ri-global-line text-5xl text-slate-200"></i>
                <p className="mt-2 text-slate-400">No se encontraron países</p>
              </div>
            ) : (
              filteredCountries.map((country) => (
                <div key={country.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all group relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 to-teal-600 rounded-t-xl"></div>
                  <div className="flex items-start justify-between mb-3 mt-1">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-xl font-bold shadow-sm">
                      {country.flag_emoji || country.code?.slice(0, 2)}
                    </div>
                    <Badge variant={country.status === 'active' ? 'success' : 'danger'} size="sm">
                      {country.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mb-0.5">{country.name}</h3>
                  {country.capital && <p className="text-xs text-slate-400 mb-3">{country.capital}</p>}
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Código</span>
                      <span className="font-mono font-semibold">{country.code} / {country.iso_code}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Moneda</span>
                      <span className="font-semibold text-slate-800">{country.currency}</span>
                    </div>
                    {country.phone_code && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Tel.</span>
                        <span>{country.phone_code}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Tiendas</span>
                      <span className="font-semibold text-teal-600">{storeCounts[country.id] || 0}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(country)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                    >
                      <i className="ri-edit-line"></i> Editar
                    </button>
                    <button
                      onClick={() => openDelete(country)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <i className="ri-delete-bin-line"></i> Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <CountryModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedCountry(null); }}
        onSave={handleSaveCountry}
        country={selectedCountry}
        organizationId={organizationId}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setCountryToDelete(null); setDeleteError(''); }}
        onConfirm={handleDeleteCountry}
        title="Eliminar País"
        description={`¿Estás seguro de que deseas eliminar el país "${countryToDelete?.name}"? Esta acción no se puede deshacer y podría afectar tiendas asociadas.`}
        errorMessage={deleteError}
      />

      <CsvImportModal
        isOpen={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
        onImportComplete={() => fetchCountries(organizationId)}
        fields={csvFields}
        tableName="countries"
        templateFileName="plantilla_paises.csv"
        organizationId={organizationId}
        title="Importar Países desde CSV"
      />
    </div>
  );
}
