import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import Badge from '../../components/base/Badge';
import CustomerModal from './components/CustomerModal';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.document_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCountry = selectedCountry === 'all' || customer.country_id === selectedCountry;
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'active' && customer.is_active) ||
      (selectedStatus === 'inactive' && !customer.is_active);

    return matchesSearch && matchesCountry && matchesStatus;
  });

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.is_active).length;
  const inactiveCustomers = customers.filter(c => !c.is_active).length;

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
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona la información de tus clientes</p>
        </div>
        <Button
          onClick={() => {
            setSelectedCustomer(null);
            setIsModalOpen(true);
          }}
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Cliente
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Clientes</p>
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
              <p className="text-sm text-slate-500">Clientes Activos</p>
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
              <p className="text-sm text-slate-500">Clientes Inactivos</p>
              <p className="text-2xl font-bold text-slate-400 mt-1">{inactiveCustomers}</p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-lg">
              <i className="ri-user-unfollow-line text-2xl text-slate-400"></i>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <Input
              placeholder="Buscar por nombre, código, RUT o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<i className="ri-search-line text-slate-400"></i>}
            />
          </div>
          <Select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            <option value="all">Todos los países</option>
            {countries.map(country => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </Select>
          <Select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Documento
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Ubicación
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Zona
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  País
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <i className="ri-user-line text-4xl mb-2 block"></i>
                    No se encontraron clientes
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-800">{customer.name}</p>
                        <p className="text-xs text-slate-500">{customer.code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{customer.document_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm text-slate-700 flex items-center gap-1">
                          <i className="ri-mail-line text-slate-400 w-4 h-4 flex items-center justify-center"></i>
                          {customer.email}
                        </p>
                        <p className="text-sm text-slate-700 flex items-center gap-1">
                          <i className="ri-phone-line text-slate-400 w-4 h-4 flex items-center justify-center"></i>
                          {customer.phone}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-slate-700">{customer.city}</p>
                        <p className="text-xs text-slate-500">{customer.address}</p>
                        {customer.latitude && customer.longitude && (
                          <p className="text-xs text-slate-400 mt-1">
                            <i className="ri-map-pin-line w-3 h-3 flex items-center justify-center"></i>
                            {customer.latitude.toFixed(6)}, {customer.longitude.toFixed(6)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{customer.delivery_zone}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{customer.countries?.code === 'CL' ? '🇨🇱' : customer.countries?.code === 'AR' ? '🇦🇷' : customer.countries?.code === 'PE' ? '🇵🇪' : '🌎'}</span>
                        <span className="text-sm text-slate-700">{customer.countries?.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={customer.is_active ? 'success' : 'default'}>
                        {customer.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setIsModalOpen(true);
                          }}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(customer.id)}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
      </Card>

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