import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface Country {
  id: string;
  name: string;
  code: string;
  flag_emoji: string;
}

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (store: any) => void;
  store?: any;
  organizationId: string;
  countries?: Country[];
}

const TABS = [
  { id: 'general', label: 'General', icon: 'ri-store-2-line' },
  { id: 'ubicacion', label: 'Ubicación', icon: 'ri-map-pin-line' },
  { id: 'operacion', label: 'Operación', icon: 'ri-settings-3-line' },
  { id: 'contacto', label: 'Contacto', icon: 'ri-contacts-line' },
];

const STORE_TYPES = [
  { value: 'store', label: 'Tienda', icon: 'ri-store-2-line' },
  { value: 'warehouse', label: 'Bodega', icon: 'ri-building-line' },
  { value: 'distribution_center', label: 'Centro de Distribución', icon: 'ri-truck-line' },
];

const emptyForm = {
  name: '',
  code: '',
  country_id: '',
  store_type: 'store',
  manager_name: '',
  status: 'active',
  is_origin: false,
  address: '',
  city: '',
  state: '',
  postal_code: '',
  latitude: '',
  longitude: '',
  opening_hours: '',
  capacity: '',
  area_m2: '',
  delivery_zone: '',
  notes: '',
  phone: '',
  email: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
};

export default function StoreModal({ isOpen, onClose, onSave, store, organizationId, countries: countriesProp }: StoreModalProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && organizationId) {
      if (countriesProp && countriesProp.length > 0) {
        setCountries(countriesProp);
      } else {
        fetchCountries();
      }
    }
  }, [isOpen, organizationId, countriesProp]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('general');
      setErrors({});
      if (store) {
        setFormData({
          name: store.name || '',
          code: store.code || '',
          country_id: store.country_id || '',
          store_type: store.store_type || 'store',
          manager_name: store.manager_name || '',
          status: store.status || 'active',
          is_origin: store.is_origin || false,
          address: store.address || '',
          city: store.city || '',
          state: store.state || '',
          postal_code: store.postal_code || '',
          latitude: store.latitude?.toString() || '',
          longitude: store.longitude?.toString() || '',
          opening_hours: store.opening_hours || '',
          capacity: store.capacity?.toString() || '',
          area_m2: store.area_m2?.toString() || '',
          delivery_zone: store.delivery_zone || '',
          notes: store.notes || '',
          phone: store.phone || '',
          email: store.email || '',
          contact_name: store.contact_name || '',
          contact_phone: store.contact_phone || '',
          contact_email: store.contact_email || '',
        });
      } else {
        setFormData({ ...emptyForm });
      }
    }
  }, [store, isOpen]);

  const fetchCountries = async () => {
    const { data } = await supabase
      .from('countries')
      .select('id, name, code, flag_emoji')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('name');
    setCountries(data || []);
  };

  const set = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    if (!formData.code.trim()) newErrors.code = 'El código es requerido';
    if (!formData.country_id) newErrors.country_id = 'El país es requerido';
    if (!formData.address.trim()) newErrors.address = 'La dirección es requerida';
    if (!formData.city.trim()) newErrors.city = 'La ciudad es requerida';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      setActiveTab('general');
      return;
    }
    onSave({
      ...formData,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      capacity: formData.capacity ? parseInt(formData.capacity) : null,
      area_m2: formData.area_m2 ? parseFloat(formData.area_m2) : null,
      organization_id: organizationId,
      id: store?.id,
    });
  };

  if (!isOpen) return null;

  const selectedCountry = countries.find(c => c.id === formData.country_id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <i className="ri-store-2-line text-teal-600 text-lg"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {store ? 'Editar Punto de Entrega' : 'Nuevo Punto de Entrega'}
              </h2>
              <p className="text-xs text-slate-400">
                {store ? `Modificando: ${store.name}` : 'Completa la información del punto de entrega'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">

            {/* Tab: General */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* Tipo de tienda */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Ubicación <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-3">
                    {STORE_TYPES.map(type => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => set('store_type', type.value)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                          formData.store_type === type.value
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <i className={`${type.icon} text-2xl`}></i>
                        <span className="text-xs font-medium">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="Ej: Punto de Entrega Central Santiago"
                    />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.code}
                      onChange={(e) => set('code', e.target.value.toUpperCase())}
                      placeholder="Ej: BCN-001"
                    />
                    {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">País <span className="text-red-500">*</span></label>
                    <Select
                      value={formData.country_id}
                      onChange={(e) => set('country_id', e.target.value)}
                      options={[
                        { value: '', label: 'Seleccionar país' },
                        ...countries.map(c => ({ value: c.id, label: `${c.flag_emoji || ''} ${c.name}`.trim() })),
                      ]}
                    />
                    {errors.country_id && <p className="text-xs text-red-500 mt-1">{errors.country_id}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Responsable</label>
                    <Input
                      type="text"
                      value={formData.manager_name}
                      onChange={(e) => set('manager_name', e.target.value)}
                      placeholder="Nombre del responsable"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                    <Select
                      value={formData.status}
                      onChange={(e) => set('status', e.target.value)}
                      options={[
                        { value: 'active', label: 'Activo' },
                        { value: 'inactive', label: 'Inactivo' },
                      ]}
                    />
                  </div>
                </div>

                {/* Es origen */}
                <div
                  onClick={() => set('is_origin', !formData.is_origin)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.is_origin ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                    formData.is_origin ? 'bg-teal-600 border-teal-600' : 'border-slate-300'
                  }`}>
                    {formData.is_origin && <i className="ri-check-line text-white text-xs"></i>}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Usar como punto de origen</p>
                    <p className="text-xs text-slate-500">Este punto será el origen para las rutas de despacho</p>
                  </div>
                  <div className="ml-auto">
                    <i className="ri-map-pin-2-line text-teal-500 text-xl"></i>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Ubicación */}
            {activeTab === 'ubicacion' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dirección <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.address}
                      onChange={(e) => set('address', e.target.value)}
                      placeholder="Calle, número, piso, oficina..."
                    />
                    {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.city}
                      onChange={(e) => set('city', e.target.value)}
                      placeholder="Ciudad"
                    />
                    {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Región / Estado</label>
                    <Input
                      type="text"
                      value={formData.state}
                      onChange={(e) => set('state', e.target.value)}
                      placeholder="Región o estado"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código Postal</label>
                    <Input
                      type="text"
                      value={formData.postal_code}
                      onChange={(e) => set('postal_code', e.target.value)}
                      placeholder="Código postal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zona de Entrega</label>
                    <Input
                      type="text"
                      value={formData.delivery_zone}
                      onChange={(e) => set('delivery_zone', e.target.value)}
                      placeholder="Ej: Zona Norte, Sector 3"
                    />
                  </div>
                </div>

                {/* Coordenadas */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="ri-map-pin-2-line text-teal-600"></i>
                    <h4 className="text-sm font-semibold text-slate-700">Coordenadas GPS</h4>
                    <span className="text-xs text-slate-400">(para optimización de rutas)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Latitud</label>
                      <Input
                        type="text"
                        value={formData.latitude}
                        onChange={(e) => set('latitude', e.target.value)}
                        placeholder="Ej: -33.4489"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Longitud</label>
                      <Input
                        type="text"
                        value={formData.longitude}
                        onChange={(e) => set('longitude', e.target.value)}
                        placeholder="Ej: -70.6693"
                      />
                    </div>
                  </div>
                  {formData.latitude && formData.longitude && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
                      <i className="ri-checkbox-circle-line"></i>
                      <span>Coordenadas configuradas: {formData.latitude}, {formData.longitude}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Operación */}
            {activeTab === 'operacion' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Horario de Operación</label>
                    <Input
                      type="text"
                      value={formData.opening_hours}
                      onChange={(e) => set('opening_hours', e.target.value)}
                      placeholder="Ej: Lun-Vie 08:00-18:00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Capacidad (unidades)</label>
                    <Input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => set('capacity', e.target.value)}
                      placeholder="Ej: 5000"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Área (m²)</label>
                    <Input
                      type="number"
                      value={formData.area_m2}
                      onChange={(e) => set('area_m2', e.target.value)}
                      placeholder="Ej: 1200"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Resumen operacional */}
                {(formData.capacity || formData.area_m2 || formData.opening_hours) && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Resumen Operacional</p>
                    <div className="grid grid-cols-3 gap-3">
                      {formData.capacity && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200 text-center">
                          <i className="ri-archive-line text-teal-500 text-xl mb-1"></i>
                          <p className="text-lg font-bold text-slate-900">{parseInt(formData.capacity).toLocaleString()}</p>
                          <p className="text-xs text-slate-400">Capacidad</p>
                        </div>
                      )}
                      {formData.area_m2 && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200 text-center">
                          <i className="ri-layout-line text-teal-500 text-xl mb-1"></i>
                          <p className="text-lg font-bold text-slate-900">{parseFloat(formData.area_m2).toLocaleString()}</p>
                          <p className="text-xs text-slate-400">m²</p>
                        </div>
                      )}
                      {formData.opening_hours && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200 text-center">
                          <i className="ri-time-line text-teal-500 text-xl mb-1"></i>
                          <p className="text-sm font-bold text-slate-900">{formData.opening_hours}</p>
                          <p className="text-xs text-slate-400">Horario</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Instrucciones de acceso, restricciones, observaciones..."
                    rows={4}
                    maxLength={500}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1 text-right">{formData.notes.length}/500</p>
                </div>
              </div>
            )}

            {/* Tab: Contacto */}
            {activeTab === 'contacto' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <i className="ri-building-line text-teal-500"></i>
                    Contacto Principal del Punto de Entrega
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                      <Input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => set('phone', e.target.value)}
                        placeholder="+56 2 1234 5678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => set('email', e.target.value)}
                        placeholder="tienda@empresa.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <i className="ri-user-line text-teal-500"></i>
                    Contacto de Emergencia / Secundario
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                      <Input
                        type="text"
                        value={formData.contact_name}
                        onChange={(e) => set('contact_name', e.target.value)}
                        placeholder="Nombre del contacto"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                      <Input
                        type="tel"
                        value={formData.contact_phone}
                        onChange={(e) => set('contact_phone', e.target.value)}
                        placeholder="+56 9 8765 4321"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <Input
                        type="email"
                        value={formData.contact_email}
                        onChange={(e) => set('contact_email', e.target.value)}
                        placeholder="contacto@empresa.com"
                      />
                    </div>
                  </div>
                </div>

                {/* Resumen contacto */}
                {(formData.phone || formData.email || formData.contact_name) && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Resumen de Contactos</p>
                    <div className="space-y-2">
                      {formData.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <i className="ri-phone-line text-teal-500 w-4 h-4 flex items-center justify-center"></i>
                          <span>{formData.phone}</span>
                        </div>
                      )}
                      {formData.email && (
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <i className="ri-mail-line text-teal-500 w-4 h-4 flex items-center justify-center"></i>
                          <span>{formData.email}</span>
                        </div>
                      )}
                      {formData.contact_name && (
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <i className="ri-user-line text-teal-500 w-4 h-4 flex items-center justify-center"></i>
                          <span>{formData.contact_name} {formData.contact_phone ? `· ${formData.contact_phone}` : ''}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <div className="flex gap-1">
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-teal-600' : 'bg-slate-300'}`}
                ></div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="primary">
                <i className={store ? 'ri-save-line' : 'ri-add-line'}></i>
                {store ? 'Actualizar' : 'Crear'} Punto de Entrega
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
