import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

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
}

interface CustomerModalProps {
  customer: Customer | null;
  countries: Country[];
  onClose: () => void;
  onSave: () => void;
}

export default function CustomerModal({ customer, countries, onClose, onSave }: CustomerModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    document_number: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: '',
    postal_code: '',
    country_id: '',
    latitude: '',
    longitude: '',
    delivery_zone: '',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'location' | 'coordinates' | 'contact'>('general');

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name,
        code: customer.code,
        document_number: customer.document_number,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        region: customer.region,
        postal_code: customer.postal_code,
        country_id: customer.country_id,
        latitude: customer.latitude?.toString() || '',
        longitude: customer.longitude?.toString() || '',
        delivery_zone: customer.delivery_zone,
        is_active: customer.is_active
      });
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dataToSave = {
        name: formData.name,
        code: formData.code,
        document_number: formData.document_number,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        region: formData.region,
        postal_code: formData.postal_code,
        country_id: formData.country_id,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        delivery_zone: formData.delivery_zone,
        is_active: formData.is_active
      };

      if (customer) {
        const { error } = await supabase
          .from('customers')
          .update(dataToSave)
          .eq('id', customer.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([dataToSave]);

        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Error al guardar el cliente');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">
            {customer ? 'Editar Cliente' : 'Nuevo Cliente'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-slate-200">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'general'
                  ? 'bg-teal-50 text-teal-600 border-b-2 border-teal-600'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <i className="ri-user-line mr-2"></i>
              General
            </button>
            <button
              onClick={() => setActiveTab('location')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'location'
                  ? 'bg-teal-50 text-teal-600 border-b-2 border-teal-600'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <i className="ri-map-pin-line mr-2"></i>
              Ubicación
            </button>
            <button
              onClick={() => setActiveTab('coordinates')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'coordinates'
                  ? 'bg-teal-50 text-teal-600 border-b-2 border-teal-600'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <i className="ri-compass-line mr-2"></i>
              Coordenadas
            </button>
            <button
              onClick={() => setActiveTab('contact')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'contact'
                  ? 'bg-teal-50 text-teal-600 border-b-2 border-teal-600'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <i className="ri-contacts-line mr-2"></i>
              Contacto
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre del Cliente *
                    </label>
                    <Input
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Ej: Supermercado Central"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Código *
                    </label>
                    <Input
                      name="code"
                      value={formData.code}
                      onChange={handleChange}
                      placeholder="Ej: CLI-001"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      RUT / Documento *
                    </label>
                    <Input
                      name="document_number"
                      value={formData.document_number}
                      onChange={handleChange}
                      placeholder="Ej: 12.345.678-9"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      País *
                    </label>
                    <Select
                      name="country_id"
                      value={formData.country_id}
                      onChange={handleChange}
                      required
                      options={[
                        { value: '', label: 'Seleccionar país' },
                        ...countries.map(country => ({
                          value: country.id,
                          label: country.name
                        }))
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Zona de Entrega *
                  </label>
                  <Input
                    name="delivery_zone"
                    value={formData.delivery_zone}
                    onChange={handleChange}
                    placeholder="Ej: Zona Norte, Centro, Sur"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                    className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500 cursor-pointer"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-slate-700 cursor-pointer">
                    Cliente activo
                  </label>
                </div>
              </div>
            )}

            {/* Location Tab */}
            {activeTab === 'location' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Dirección Completa *
                  </label>
                  <Input
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Ej: Av. Libertador 1234"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Ciudad *
                    </label>
                    <Input
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="Ej: Santiago"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Región / Estado *
                    </label>
                    <Input
                      name="region"
                      value={formData.region}
                      onChange={handleChange}
                      placeholder="Ej: Región Metropolitana"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Código Postal
                  </label>
                  <Input
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    placeholder="Ej: 8320000"
                  />
                </div>
              </div>
            )}

            {/* Coordinates Tab */}
            {activeTab === 'coordinates' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Coordenadas Geográficas</p>
                      <p className="text-xs text-blue-600 mt-1">
                        Las coordenadas permiten ubicar con precisión al cliente en el mapa para optimizar las rutas de entrega.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Latitud
                    </label>
                    <Input
                      name="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={handleChange}
                      placeholder="Ej: -33.4489"
                    />
                    <p className="text-xs text-slate-500 mt-1">Formato: -33.4489</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Longitud
                    </label>
                    <Input
                      name="longitude"
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={handleChange}
                      placeholder="Ej: -70.6693"
                    />
                    <p className="text-xs text-slate-500 mt-1">Formato: -70.6693</p>
                  </div>
                </div>

                {formData.latitude && formData.longitude && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-teal-700">
                      <i className="ri-map-pin-line text-lg"></i>
                      <span className="text-sm font-medium">
                        Ubicación: {formData.latitude}, {formData.longitude}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email *
                  </label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Ej: contacto@cliente.com"
                    required
                    icon={<i className="ri-mail-line text-slate-400"></i>}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Teléfono *
                  </label>
                  <Input
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Ej: +56 9 1234 5678"
                    required
                    icon={<i className="ri-phone-line text-slate-400"></i>}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-line mr-2"></i>
                  {customer ? 'Actualizar' : 'Crear'} Cliente
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}