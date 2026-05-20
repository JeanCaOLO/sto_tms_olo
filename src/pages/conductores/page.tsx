import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import Badge from '../../components/base/Badge';
import Card from '../../components/base/Card';
import DriverModal from './components/DriverModal';
import CsvImportModal from '../../components/feature/CsvImportModal';

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
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  useEffect(() => {
    loadDrivers();
    loadCarriers();
  }, []);

  useEffect(() => {
    filterDrivers();
  }, [drivers, searchTerm, statusFilter, carrierFilter]);

  const loadDrivers = async () => {
    setLoading(true);
    const { data, error } = await supabase
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
    setLoading(false);
  };

  const loadCarriers = async () => {
    const { data } = await supabase
      .from('carriers')
      .select('id, name, code')
      .eq('status', 'active')
      .order('name');
    
    if (data) setCarriers(data);
  };

  const filterDrivers = () => {
    let filtered = [...drivers];

    if (searchTerm) {
      filtered = filtered.filter(driver =>
        driver.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.document.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.license_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(driver => driver.status === statusFilter);
    }

    if (carrierFilter !== 'all') {
      filtered = filtered.filter(driver => driver.carrier_id === carrierFilter);
    }

    setFilteredDrivers(filtered);
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
    const variants: Record<string, 'success' | 'warning' | 'error'> = {
      active: 'success',
      inactive: 'error',
      on_leave: 'warning'
    };
    const labels: Record<string, string> = {
      active: 'Activo',
      inactive: 'Inactivo',
      on_leave: 'En Licencia'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando conductores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conductores</h1>
          <p className="text-gray-600 mt-1">Gestiona los conductores de tu flota</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="secondary"
            onClick={() => setIsCsvModalOpen(true)}
          >
            <i className="ri-file-excel-line mr-2"></i>
            Importar CSV
          </Button>
          <Button onClick={() => { setSelectedDriver(null); setIsModalOpen(true); }}>
            <i className="ri-add-line mr-2"></i>
            Nuevo Conductor
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Conductores</p>
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
              <p className="text-sm text-gray-600">Licencias por Vencer</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.expiringSoon}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <i className="ri-alarm-warning-line text-2xl text-amber-600"></i>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nombre, código, documento o licencia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<i className="ri-search-line"></i>}
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="on_leave">En Licencia</option>
          </Select>
          <Select
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value)}
          >
            <option value="all">Todos los transportistas</option>
            {carriers.map(carrier => (
              <option key={carrier.id} value={carrier.id}>{carrier.name}</option>
            ))}
          </Select>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-lg ${viewMode === 'grid' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-600'}`}
            >
              <i className="ri-grid-line"></i>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 rounded-lg ${viewMode === 'table' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-600'}`}
            >
              <i className="ri-list-check"></i>
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDrivers.map((driver) => (
              <div key={driver.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                    {driver.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{driver.full_name}</h3>
                        <p className="text-sm text-gray-500">{driver.code}</p>
                      </div>
                      {getStatusBadge(driver.status)}
                    </div>

                    <div className="space-y-1 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <i className="ri-id-card-line w-4 h-4 flex items-center justify-center"></i>
                        <span className="truncate">{driver.document}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="ri-phone-line w-4 h-4 flex items-center justify-center"></i>
                        <span className="truncate">{driver.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="ri-building-line w-4 h-4 flex items-center justify-center"></i>
                        <span className="truncate">{driver.carriers?.name || 'Sin transportista'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="ri-bank-card-line w-4 h-4 flex items-center justify-center"></i>
                        <span className="truncate">Licencia {driver.license_type} - {driver.license_number}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="ri-calendar-line w-4 h-4 flex items-center justify-center"></i>
                        <span className={`truncate ${isLicenseExpired(driver.license_expiry) ? 'text-red-600 font-semibold' : isLicenseExpiringSoon(driver.license_expiry) ? 'text-amber-600 font-semibold' : ''}`}>
                          Vence: {new Date(driver.license_expiry).toLocaleDateString('es-CL')}
                          {isLicenseExpired(driver.license_expiry) && ' (VENCIDA)'}
                          {isLicenseExpiringSoon(driver.license_expiry) && !isLicenseExpired(driver.license_expiry) && ' (Próxima a vencer)'}
                        </span>
                      </div>
                    </div>

                    {(isLicenseExpired(driver.license_expiry) || isLicenseExpiringSoon(driver.license_expiry)) && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 ${isLicenseExpired(driver.license_expiry) ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        <i className="ri-alarm-warning-line w-4 h-4 flex items-center justify-center"></i>
                        <span className="text-xs font-medium">
                          {isLicenseExpired(driver.license_expiry) ? 'Licencia vencida' : 'Licencia por vencer'}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSelectedDriver(driver); setIsModalOpen(true); }}
                        className="flex-1 px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium whitespace-nowrap"
                      >
                        <i className="ri-edit-line mr-1"></i>
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(driver.id)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Conductor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Documento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Contacto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Licencia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Transportista</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {driver.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{driver.full_name}</div>
                          <div className="text-sm text-gray-500">{driver.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{driver.document}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-600">{driver.phone}</div>
                      <div className="text-xs text-gray-500">{driver.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 font-medium">Clase {driver.license_type}</div>
                      <div className="text-xs text-gray-500">{driver.license_number}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-sm ${isLicenseExpired(driver.license_expiry) ? 'text-red-600 font-semibold' : isLicenseExpiringSoon(driver.license_expiry) ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                        {new Date(driver.license_expiry).toLocaleDateString('es-CL')}
                      </div>
                      {isLicenseExpired(driver.license_expiry) && (
                        <div className="text-xs text-red-600 font-medium">VENCIDA</div>
                      )}
                      {isLicenseExpiringSoon(driver.license_expiry) && !isLicenseExpired(driver.license_expiry) && (
                        <div className="text-xs text-amber-600 font-medium">Por vencer</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{driver.carriers?.name || '-'}</td>
                    <td className="px-4 py-3">{getStatusBadge(driver.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedDriver(driver); setIsModalOpen(true); }}
                          className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(driver.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredDrivers.length === 0 && (
          <div className="text-center py-12">
            <i className="ri-user-line text-6xl text-gray-300 mb-4"></i>
            <p className="text-gray-500">No se encontraron conductores</p>
          </div>
        )}
      </Card>

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
          { name: 'full_name', label: 'Nombre Completo', required: true, type: 'text' },
          { name: 'document', label: 'Documento', required: true, type: 'text' },
          { name: 'document_type', label: 'Tipo Documento', required: true, type: 'text' },
          { name: 'license_number', label: 'Número Licencia', required: true, type: 'text' },
          { name: 'license_type', label: 'Tipo Licencia', required: true, type: 'text' },
          { name: 'license_expiry', label: 'Vencimiento Licencia (YYYY-MM-DD)', required: true, type: 'text' },
          { name: 'phone', label: 'Teléfono', required: true, type: 'text' },
          { name: 'email', label: 'Email', required: true, type: 'email' },
          { name: 'carrier_code', label: 'Código Transportista', required: true, type: 'text' },
          { name: 'status', label: 'Estado (active/inactive/on_leave)', required: true, type: 'text' },
          { name: 'notes', label: 'Notas', required: false, type: 'text' }
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
        onSuccess={loadDrivers}
      />
    </div>
  );
}