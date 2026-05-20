import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import Badge from '../../components/base/Badge';
import Card from '../../components/base/Card';
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
  countries?: {
    name: string;
    code: string;
  };
  driver_count?: number;
  vehicle_count?: number;
}

export default function TransportistasPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [filteredCarriers, setFilteredCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  useEffect(() => {
    loadCarriers();
    loadCountries();
  }, []);

  useEffect(() => {
    filterCarriers();
  }, [carriers, searchTerm, statusFilter, countryFilter]);

  const loadCarriers = async () => {
    setLoading(true);
    const { data, error } = await supabase
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

  const loadCountries = async () => {
    const { data } = await supabase
      .from('countries')
      .select('id, name, code')
      .eq('status', 'active')
      .order('name');
    
    if (data) setCountries(data);
  };

  const filterCarriers = () => {
    let filtered = [...carriers];

    if (searchTerm) {
      filtered = filtered.filter(carrier =>
        carrier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        carrier.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        carrier.tax_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        carrier.contact_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(carrier => carrier.status === statusFilter);
    }

    if (countryFilter !== 'all') {
      filtered = filtered.filter(carrier => carrier.country_id === countryFilter);
    }

    setFilteredCarriers(filtered);
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
      : <Badge variant="error">Inactivo</Badge>;
  };

  const stats = {
    total: carriers.length,
    active: carriers.filter(c => c.status === 'active').length,
    inactive: carriers.filter(c => c.status === 'inactive').length,
    totalDrivers: carriers.reduce((sum, c) => sum + (c.driver_count || 0), 0)
  };

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

      <Card>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nombre, código, RUT o contacto..."
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
          </Select>
          <Select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          >
            <option value="all">Todos los países</option>
            {countries.map(country => (
              <option key={country.id} value={country.id}>{country.name}</option>
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
            {filteredCarriers.map((carrier) => (
              <div key={carrier.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                      <i className="ri-building-line text-xl"></i>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{carrier.name}</h3>
                      <p className="text-sm text-gray-500">{carrier.code}</p>
                    </div>
                  </div>
                  {getStatusBadge(carrier.status)}
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <i className="ri-id-card-line w-4 h-4 flex items-center justify-center"></i>
                    <span className="truncate">RUT: {carrier.tax_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-user-line w-4 h-4 flex items-center justify-center"></i>
                    <span className="truncate">{carrier.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-mail-line w-4 h-4 flex items-center justify-center"></i>
                    <span className="truncate">{carrier.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-phone-line w-4 h-4 flex items-center justify-center"></i>
                    <span className="truncate">{carrier.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-map-pin-line w-4 h-4 flex items-center justify-center"></i>
                    <span className="truncate">{carrier.countries?.name || 'Sin país'}</span>
                  </div>
                </div>

                <div className="flex gap-2 mb-4 pt-4 border-t">
                  <div className="flex-1 bg-teal-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-teal-600">{carrier.driver_count || 0}</div>
                    <div className="text-xs text-gray-600 mt-1">Conductores</div>
                  </div>
                  <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{carrier.vehicle_count || 0}</div>
                    <div className="text-xs text-gray-600 mt-1">Vehículos</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedCarrier(carrier); setIsModalOpen(true); }}
                    className="flex-1 px-3 py-2 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <i className="ri-edit-line mr-1"></i>
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(carrier.id)}
                    className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Transportista</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">RUT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Contacto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">País</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Conductores</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Vehículos</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCarriers.map((carrier) => (
                  <tr key={carrier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                          <i className="ri-building-line"></i>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{carrier.name}</div>
                          <div className="text-sm text-gray-500">{carrier.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{carrier.tax_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{carrier.contact_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{carrier.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{carrier.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{carrier.countries?.name || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 text-teal-600 rounded-full text-sm font-semibold">
                        {carrier.driver_count || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-amber-100 text-amber-600 rounded-full text-sm font-semibold">
                        {carrier.vehicle_count || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(carrier.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedCarrier(carrier); setIsModalOpen(true); }}
                          className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(carrier.id)}
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

        {filteredCarriers.length === 0 && (
          <div className="text-center py-12">
            <i className="ri-building-line text-6xl text-gray-300 mb-4"></i>
            <p className="text-gray-500">No se encontraron transportistas</p>
          </div>
        )}
      </Card>

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