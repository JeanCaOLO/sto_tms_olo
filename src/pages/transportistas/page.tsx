import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Card from '../../components/base/Card';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import CarrierModal from './components/CarrierModal';
import CsvImportModal from '../../components/feature/CsvImportModal';

interface Carrier {
  id: string;
  code: string;
  name: string;
  tax_id: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  country_id: string;
  status: string;
  payment_account: string;
  softland_code: string;
  countries?: {
    name: string;
    code: string;
  };
  driver_count?: number;
  vehicle_count?: number;
}

export default function TransportistasPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  useEffect(() => {
    loadCarriers();
  }, []);

  const loadCarriers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('carriers')
      .select(`
        *,
        countries (
          name,
          code
        )
      `)
      .order('created_at', { ascending: false });

    if (data) {
      const carriersWithCounts = await Promise.all(
        data.map(async (carrier) => {
          const { count: driverCount } = await supabase
            .from('drivers')
            .select('*', { count: 'exact', head: true })
            .eq('carrier_id', carrier.id);

          const { count: vehicleCount } = await supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true })
            .eq('carrier_id', carrier.id);

          return {
            ...carrier,
            driver_count: driverCount || 0,
            vehicle_count: vehicleCount || 0
          };
        })
      );
      setCarriers(carriersWithCounts);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este transportista? Esto puede afectar a conductores y vehículos asociados.')) return;

    const { error } = await supabase
      .from('carriers')
      .delete()
      .eq('id', id);

    if (!error) {
      loadCarriers();
    }
  };

  const getStatusBadge = (status: string) => {
    return status === 'active'
      ? <Badge variant="success">Activo</Badge>
      : <Badge variant="danger">Inactivo</Badge>;
  };

  const stats = {
    total: carriers.length,
    active: carriers.filter(c => c.status === 'active').length,
    inactive: carriers.filter(c => c.status === 'inactive').length,
    totalDrivers: carriers.reduce((sum, c) => sum + (c.driver_count || 0), 0)
  };

  const columns: DataTableColumn<Carrier>[] = [
    {
      key: 'name',
      header: 'Transportista',
      accessor: (c) => c.name,
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <i className="ri-building-line"></i>
          </div>
          <div>
            <div className="font-medium text-slate-900">{c.name}</div>
            <div className="text-sm text-slate-500">{c.code}</div>
          </div>
        </div>
      ),
    },
    { key: 'tax_id', header: 'RUT', accessor: (c) => c.tax_id, sortable: true },
    { key: 'contact_name', header: 'Contacto', accessor: (c) => c.contact_name, sortable: true },
    { key: 'email', header: 'Email', accessor: (c) => c.email, sortable: true },
    { key: 'phone', header: 'Teléfono', accessor: (c) => c.phone },
    { key: 'country', header: 'País', accessor: (c) => c.countries?.name ?? '', sortable: true, filterable: true },
    {
      key: 'payment_account',
      header: 'Cuenta para pagar',
      accessor: (c) => c.payment_account ?? '',
    },
    {
      key: 'softland_code',
      header: 'Código Softland',
      accessor: (c) => c.softland_code ?? '',
    },
    {
      key: 'driver_count',
      header: 'Conductores',
      accessor: (c) => c.driver_count ?? 0,
      sortable: true,
      align: 'center',
      render: (c) => (
        <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 text-teal-600 rounded-full text-sm font-semibold">
          {c.driver_count || 0}
        </span>
      ),
    },
    {
      key: 'vehicle_count',
      header: 'Vehículos',
      accessor: (c) => c.vehicle_count ?? 0,
      sortable: true,
      align: 'center',
      render: (c) => (
        <span className="inline-flex items-center justify-center w-8 h-8 bg-amber-100 text-amber-600 rounded-full text-sm font-semibold">
          {c.vehicle_count || 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (c) => (c.status === 'active' ? 'Activo' : 'Inactivo'),
      filterable: true,
      render: (c) => getStatusBadge(c.status),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando transportistas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transportistas</h1>
          <p className="text-gray-600 mt-1">Gestiona las empresas de transporte</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setIsCsvModalOpen(true)}
            className="bg-white text-teal-600 border-2 border-teal-600 hover:bg-teal-50"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Importar CSV
          </Button>
          <Button onClick={() => { setSelectedCarrier(null); setIsModalOpen(true); }}>
            <i className="ri-add-line mr-2"></i>
            Nuevo Transportista
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Transportistas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-building-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Activos</p>
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
              <p className="text-sm text-gray-600">Inactivos</p>
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
              <p className="text-sm text-gray-600">Total Conductores</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{stats.totalDrivers}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-user-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </Card>
      </div>

      <DataTable
        data={carriers}
        columns={columns}
        getRowId={(c) => c.id}
        searchPlaceholder="Buscar por nombre, código, RUT o contacto..."
        exportFileName="transportistas"
        emptyMessage="No se encontraron transportistas"
        actions={(c) => (
          <>
            <button
              onClick={() => { setSelectedCarrier(c); setIsModalOpen(true); }}
              className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              title="Editar"
            >
              <i className="ri-edit-line"></i>
            </button>
            <button
              onClick={() => handleDelete(c.id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar"
            >
              <i className="ri-delete-bin-line"></i>
            </button>
          </>
        )}
      />

      <CarrierModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedCarrier(null); }}
        carrier={selectedCarrier}
        onSave={loadCarriers}
      />

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        tableName="carriers"
        templateFileName="plantilla_transportistas.csv"
        fields={[
          { name: 'name', label: 'Nombre', required: true, type: 'text' },
          { name: 'code', label: 'Código', required: true, type: 'text' },
          { name: 'tax_id', label: 'RUT/Tax ID', required: true, type: 'text' },
          { name: 'contact_name', label: 'Nombre Contacto', required: true, type: 'text' },
          { name: 'email', label: 'Email', required: true, type: 'email' },
          { name: 'phone', label: 'Teléfono', required: true, type: 'text' },
          { name: 'address', label: 'Dirección', required: false, type: 'text' },
          { name: 'country_code', label: 'Código País', required: true, type: 'text' },
          { name: 'status', label: 'Estado (active/inactive)', required: true, type: 'text' }
        ]}
        transformRow={async (row: any) => {
          // Resolver country_code -> country_id
          const { data: country } = await supabase
            .from('countries')
            .select('id')
            .eq('code', row.country_code)
            .maybeSingle();

          if (!country) {
            throw new Error(`País con código "${row.country_code}" no encontrado`);
          }

          // Obtener organization_id del usuario actual
          const { data: { user } } = await supabase.auth.getUser();
          const { data: appUser } = await supabase
            .from('app_users')
            .select('organization_id')
            .eq('id', user?.id)
            .maybeSingle();

          return {
            name: row.name,
            code: row.code,
            tax_id: row.tax_id,
            contact_name: row.contact_name,
            email: row.email,
            phone: row.phone,
            address: row.address || '',
            country_id: country.id,
            status: row.status,
            organization_id: appUser?.organization_id
          };
        }}
        onSuccess={loadCarriers}
      />
    </div>
  );
}
