import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Card from '../../components/base/Card';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import DriverModal from './components/DriverModal';
import CsvImportModal from '../../components/feature/CsvImportModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

interface Driver {
  id: string;
  code: string;
  full_name: string;
  document: string;
  phone: string;
  email: string;
  license_number: string;
  license_type: string;
  license_expiry: string;
  carrier_id: string;
  photo_url?: string;
  status: string;
  notes?: string;
  carriers?: {
    name: string;
    code: string;
  };
}

export default function ConductoresPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const { canCreate, canEdit, canDelete } = useModulePermissions('conductores');
  const { t } = useTranslation();

  useEffect(() => {
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('drivers')
        .select(`
          *,
          carriers (
            name,
            code
          )
        `)
        .order('created_at', { ascending: false });

      if (data) {
        setDrivers(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este conductor?')) return;

    const { error } = await supabase
      .from('drivers')
      .delete()
      .eq('id', id);

    if (!error) {
      loadDrivers();
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'danger'> = {
      active: 'success',
      inactive: 'danger',
      on_leave: 'warning'
    };
    const labels: Record<string, string> = {
      active: t('drivers.active'),
      inactive: t('drivers.inactive'),
      on_leave: t('drivers.onLeave')
    };
    return <Badge variant={variants[status] || 'success'}>{labels[status] || status}</Badge>;
  };

  const isLicenseExpiringSoon = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isLicenseExpired = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const today = new Date();
    return expiry < today;
  };

  const stats = {
    total: drivers.length,
    active: drivers.filter(d => d.status === 'active').length,
    inactive: drivers.filter(d => d.status === 'inactive').length,
    expiringSoon: drivers.filter(d => isLicenseExpiringSoon(d.license_expiry)).length
  };

  const columns: DataTableColumn<Driver>[] = [
    {
      key: 'full_name',
      header: t('drivers.colDriver'),
      accessor: (d) => d.full_name,
      sortable: true,
      render: (d) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {d.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <div className="font-medium text-gray-900">{d.full_name}</div>
            <div className="text-sm text-gray-500">{d.code}</div>
          </div>
        </div>
      ),
    },
    { key: 'document', header: t('drivers.colDocument'), accessor: (d) => d.document, sortable: true },
    {
      key: 'contact',
      header: t('drivers.colContact'),
      accessor: (d) => d.phone,
      render: (d) => (
        <>
          <div className="text-sm text-gray-600">{d.phone}</div>
          <div className="text-xs text-gray-500">{d.email}</div>
        </>
      ),
    },
    {
      key: 'license',
      header: t('drivers.colLicense'),
      accessor: (d) => d.license_type,
      filterable: true,
      render: (d) => (
        <>
          <div className="text-sm text-gray-900 font-medium">{t('drivers.licenseClass', { type: d.license_type })}</div>
          <div className="text-xs text-gray-500">{d.license_number}</div>
        </>
      ),
    },
    {
      key: 'license_expiry',
      header: t('drivers.colExpiry'),
      accessor: (d) => d.license_expiry,
      sortable: true,
      render: (d) => (
        <>
          <div className={`text-sm ${isLicenseExpired(d.license_expiry) ? 'text-red-600 font-semibold' : isLicenseExpiringSoon(d.license_expiry) ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
            {new Date(d.license_expiry).toLocaleDateString('es-CL')}
          </div>
          {isLicenseExpired(d.license_expiry) && <div className="text-xs text-red-600 font-medium">{t('drivers.expired')}</div>}
          {isLicenseExpiringSoon(d.license_expiry) && !isLicenseExpired(d.license_expiry) && (
            <div className="text-xs text-amber-600 font-medium">{t('drivers.expiringSoon')}</div>
          )}
        </>
      ),
    },
    {
      key: 'carrier',
      header: t('drivers.colCarrier'),
      accessor: (d) => d.carriers?.name ?? '',
      sortable: true,
      filterable: true,
    },
    {
      key: 'status',
      header: t('drivers.colStatus'),
      accessor: (d) => ({ active: t('drivers.active'), inactive: t('drivers.inactive'), on_leave: t('drivers.onLeave') }[d.status] ?? d.status),
      filterable: true,
      render: (d) => getStatusBadge(d.status),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('drivers.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('drivers.title')}</h1>
          <p className="text-gray-600 mt-1">{t('drivers.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsCsvModalOpen(true)}
            >
              <i className="ri-file-excel-line mr-2"></i>
              {t('drivers.importCsv')}
            </Button>
            <Button onClick={() => { setSelectedDriver(null); setIsModalOpen(true); }}>
              <i className="ri-add-line mr-2"></i>
              {t('drivers.new')}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('drivers.kpiTotal')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-user-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('drivers.kpiActive')}</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('drivers.kpiInactive')}</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.inactive}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i className="ri-close-circle-line text-2xl text-red-600"></i>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('drivers.kpiExpiring')}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.expiringSoon}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <i className="ri-alarm-warning-line text-2xl text-amber-600"></i>
            </div>
          </div>
        </Card>
      </div>

      <DataTable
        data={drivers}
        columns={columns}
        getRowId={(d) => d.id}
        searchPlaceholder={t('drivers.search')}
        exportFileName="conductores"
        emptyMessage={t('drivers.empty')}
        actions={(canEdit || canDelete) ? (d) => (
          <>
            {canEdit && (
              <button
                onClick={() => { setSelectedDriver(d); setIsModalOpen(true); }}
                className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                title="Editar"
              >
                <i className="ri-edit-line"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(d.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            )}
          </>
        ) : undefined}
      />

      <DriverModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedDriver(null); }}
        driver={selectedDriver}
        onSave={loadDrivers}
      />

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        tableName="drivers"
        templateFileName="plantilla_conductores.csv"
        fields={[
          { key: 'full_name', label: 'Nombre Completo', required: true, type: 'text' },
          { key: 'document', label: 'Documento', required: true, type: 'text' },
          { key: 'document_type', label: 'Tipo Documento', required: true, type: 'text' },
          { key: 'license_number', label: 'Número Licencia', required: true, type: 'text' },
          { key: 'license_type', label: 'Tipo Licencia', required: true, type: 'text' },
          { key: 'license_expiry', label: 'Vencimiento Licencia (YYYY-MM-DD)', required: true, type: 'text' },
          { key: 'phone', label: 'Teléfono', required: true, type: 'text' },
          { key: 'email', label: 'Email', required: true, type: 'email' },
          { key: 'carrier_code', label: 'Código Transportista', required: true, type: 'text' },
          { key: 'status', label: 'Estado (active/inactive/on_leave)', required: true, type: 'text' },
          { key: 'notes', label: 'Notas', required: false, type: 'text' }
        ]}
        transformRow={async (row: any) => {
          // Resolver carrier_code -> carrier_id
          const { data: carrier } = await supabase
            .from('carriers')
            .select('id')
            .eq('code', row.carrier_code)
            .maybeSingle();

          if (!carrier) {
            throw new Error(`Transportista con código "${row.carrier_code}" no encontrado`);
          }

          // Obtener organization_id del usuario actual
          const { data: { user } } = await supabase.auth.getUser();
          const { data: appUser } = await supabase
            .from('app_users')
            .select('organization_id')
            .eq('id', user?.id)
            .maybeSingle();

          // Generar código automático si no existe
          const code = `DRV-${Date.now().toString().slice(-6)}`;

          return {
            code,
            full_name: row.full_name,
            document: row.document,
            document_type: row.document_type,
            license_number: row.license_number,
            license_type: row.license_type,
            license_expiry: row.license_expiry,
            phone: row.phone,
            email: row.email,
            carrier_id: carrier.id,
            status: row.status,
            notes: row.notes || '',
            organization_id: appUser?.organization_id
          };
        }}
        onImportComplete={loadDrivers}
      />
    </div>
  );
}
