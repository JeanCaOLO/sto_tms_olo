import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import CustomerModal from './components/CustomerModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

interface Country {
  id: string;
  name: string;
  code: string;
}

interface Customer {
  id: string;
  name: string;
  code: string;
  document_number: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  postal_code: string;
  country_id: string;
  latitude: number | null;
  longitude: number | null;
  delivery_zone: string;
  is_active: boolean;
  created_at: string;
  countries?: {
    name: string;
    code: string;
  };
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const { canCreate, canEdit, canDelete } = useModulePermissions('clientes');
  const { t } = useTranslation();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [customersResult, countriesResult] = await Promise.all([
        supabase
          .from('customers')
          .select('*, countries(name, code)')
          .order('created_at', { ascending: false }),
        supabase
          .from('countries')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name')
      ]);

      if (customersResult.data) setCustomers(customersResult.data);
      if (countriesResult.data) setCountries(countriesResult.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error al eliminar el cliente');
    }
  };

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.is_active).length;
  const inactiveCustomers = customers.filter(c => !c.is_active).length;

  const countryFlag = (code?: string) => (code === 'CL' ? '🇨🇱' : code === 'AR' ? '🇦🇷' : code === 'PE' ? '🇵🇪' : '🌎');

  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: t('customers.colCustomer'),
      accessor: (c) => c.name,
      sortable: true,
      render: (c) => (
        <div>
          <p className="font-medium text-slate-800">{c.name}</p>
          <p className="text-xs text-slate-500">{c.code}</p>
        </div>
      ),
    },
    { key: 'document_number', header: t('customers.colDocument'), accessor: (c) => c.document_number, sortable: true },
    {
      key: 'contact',
      header: t('customers.colContact'),
      accessor: (c) => c.email,
      render: (c) => (
        <div className="space-y-1">
          <p className="text-sm text-slate-700 flex items-center gap-1">
            <i className="ri-mail-line text-slate-400 w-4 h-4 flex items-center justify-center"></i>
            {c.email}
          </p>
          <p className="text-sm text-slate-700 flex items-center gap-1">
            <i className="ri-phone-line text-slate-400 w-4 h-4 flex items-center justify-center"></i>
            {c.phone}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: t('customers.colLocation'),
      accessor: (c) => c.city ?? '',
      sortable: true,
      render: (c) => (
        <div>
          <p className="text-sm text-slate-700">{c.city}</p>
          <p className="text-xs text-slate-500">{c.address}</p>
          {c.latitude && c.longitude && (
            <p className="text-xs text-slate-400 mt-1">
              <i className="ri-map-pin-line w-3 h-3 flex items-center justify-center"></i>
              {c.latitude.toFixed(6)}, {c.longitude.toFixed(6)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'delivery_zone',
      header: t('customers.colZone'),
      accessor: (c) => c.delivery_zone ?? '',
      filterable: true,
      render: (c) => <Badge variant="info">{c.delivery_zone}</Badge>,
    },
    {
      key: 'country',
      header: t('customers.colCountry'),
      accessor: (c) => c.countries?.name ?? '',
      sortable: true,
      filterable: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">{countryFlag(c.countries?.code)}</span>
          <span className="text-sm text-slate-700">{c.countries?.name}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('customers.colStatus'),
      accessor: (c) => (c.is_active ? t('customers.active') : t('customers.inactive')),
      filterable: true,
      render: (c) => <Badge variant={c.is_active ? 'success' : 'default'}>{c.is_active ? t('customers.active') : t('customers.inactive')}</Badge>,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-3xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('customers.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('customers.subtitle')}</p>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setSelectedCustomer(null);
              setIsModalOpen(true);
            }}
          >
            <i className="ri-add-line mr-2"></i>
            {t('customers.new')}
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('customers.kpiTotal')}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{totalCustomers}</p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-teal-100 rounded-lg">
              <i className="ri-user-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('customers.kpiActive')}</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{activeCustomers}</p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-teal-100 rounded-lg">
              <i className="ri-user-check-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('customers.kpiInactive')}</p>
              <p className="text-2xl font-bold text-slate-400 mt-1">{inactiveCustomers}</p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-lg">
              <i className="ri-user-unfollow-line text-2xl text-slate-400"></i>
            </div>
          </div>
        </Card>
      </div>

      <DataTable
        data={customers}
        columns={columns}
        getRowId={(c) => c.id}
        searchPlaceholder={t('customers.search')}
        exportFileName="clientes"
        emptyMessage={t('customers.empty')}
        actions={(canEdit || canDelete) ? (c) => (
          <>
            {canEdit && (
              <button
                onClick={() => {
                  setSelectedCustomer(c);
                  setIsModalOpen(true);
                }}
                className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                title="Editar"
              >
                <i className="ri-edit-line"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(c.id)}
                className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            )}
          </>
        ) : undefined}
      />

      {/* Modal */}
      {isModalOpen && (
        <CustomerModal
          customer={selectedCustomer}
          countries={countries}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedCustomer(null);
          }}
          onSave={() => {
            setIsModalOpen(false);
            setSelectedCustomer(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
