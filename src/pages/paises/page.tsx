import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
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
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryToDelete, setCountryToDelete] = useState<Country | null>(null);
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

  const columns: DataTableColumn<Country>[] = [
    {
      key: 'name',
      header: 'País',
      accessor: (c) => c.name,
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {c.flag_emoji || c.code?.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">{c.name}</div>
            {c.language && <div className="text-xs text-slate-400">{c.language}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'codes',
      header: 'Códigos',
      accessor: (c) => c.code,
      sortable: true,
      render: (c) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded w-fit">{c.code}</span>
          <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded w-fit">{c.iso_code}</span>
        </div>
      ),
    },
    { key: 'capital', header: 'Capital', accessor: (c) => c.capital ?? '', sortable: true },
    {
      key: 'currency',
      header: 'Moneda / Tel.',
      accessor: (c) => c.currency,
      sortable: true,
      filterable: true,
      render: (c) => (
        <>
          <div className="text-sm font-semibold text-slate-900">{c.currency}</div>
          {c.phone_code && <div className="text-xs text-slate-400">{c.phone_code}</div>}
        </>
      ),
    },
    {
      key: 'timezone',
      header: 'Zona Horaria',
      accessor: (c) => c.timezone,
      filterable: true,
      render: (c) => <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{c.timezone}</span>,
    },
    {
      key: 'stores',
      header: 'Tiendas',
      accessor: (c) => storeCounts[c.id] || 0,
      sortable: true,
      render: (c) => (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
          <i className="ri-store-2-line text-teal-500"></i>
          {storeCounts[c.id] || 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (c) => (c.status === 'active' ? 'Activo' : 'Inactivo'),
      filterable: true,
      render: (c) => (
        <Badge variant={c.status === 'active' ? 'success' : 'danger'} size="sm">
          {c.status === 'active' ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ];

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

      <DataTable
        data={countries}
        columns={columns}
        getRowId={(c) => c.id}
        searchPlaceholder="Buscar por nombre, código, capital..."
        exportFileName="paises"
        emptyMessage="No se encontraron países"
        actions={(c) => (
          <>
            <button
              onClick={() => openEdit(c)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
              title="Editar"
            >
              <i className="ri-edit-line"></i>
            </button>
            <button
              onClick={() => openDelete(c)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="Eliminar"
            >
              <i className="ri-delete-bin-line"></i>
            </button>
          </>
        )}
      />

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
