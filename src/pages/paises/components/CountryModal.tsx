import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface CountryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (country: any) => void;
  country?: any;
  organizationId: string;
}

const TABS = [
  { id: 'general', label: 'General', icon: 'ri-global-line' },
  { id: 'config', label: 'Configuración', icon: 'ri-settings-3-line' },
  { id: 'notas', label: 'Notas', icon: 'ri-file-text-line' },
];

const TIMEZONES = [
  { value: '', label: 'Seleccionar zona horaria' },
  { value: 'America/Santiago', label: 'America/Santiago (Chile)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'America/Buenos_Aires (Argentina)' },
  { value: 'America/Lima', label: 'America/Lima (Perú)' },
  { value: 'America/Bogota', label: 'America/Bogota (Colombia)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (México)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (Brasil)' },
  { value: 'America/Caracas', label: 'America/Caracas (Venezuela)' },
  { value: 'America/Montevideo', label: 'America/Montevideo (Uruguay)' },
  { value: 'America/La_Paz', label: 'America/La_Paz (Bolivia)' },
  { value: 'America/Guayaquil', label: 'America/Guayaquil (Ecuador)' },
  { value: 'America/Asuncion', label: 'America/Asuncion (Paraguay)' },
  { value: 'America/Panama', label: 'America/Panama (Panamá)' },
  { value: 'America/Costa_Rica', label: 'America/Costa_Rica (Costa Rica)' },
  { value: 'America/Guatemala', label: 'America/Guatemala (Guatemala)' },
];

const CURRENCIES = [
  { value: '', label: 'Seleccionar moneda' },
  { value: 'CLP', label: 'CLP - Peso Chileno' },
  { value: 'ARS', label: 'ARS - Peso Argentino' },
  { value: 'PEN', label: 'PEN - Sol Peruano' },
  { value: 'COP', label: 'COP - Peso Colombiano' },
  { value: 'MXN', label: 'MXN - Peso Mexicano' },
  { value: 'BRL', label: 'BRL - Real Brasileño' },
  { value: 'VES', label: 'VES - Bolívar Venezolano' },
  { value: 'UYU', label: 'UYU - Peso Uruguayo' },
  { value: 'BOB', label: 'BOB - Boliviano' },
  { value: 'USD', label: 'USD - Dólar Americano' },
  { value: 'EUR', label: 'EUR - Euro' },
];

const emptyForm = {
  name: '',
  code: '',
  iso_code: '',
  currency: '',
  timezone: '',
  phone_code: '',
  flag_emoji: '',
  capital: '',
  language: '',
  notes: '',
  status: 'active',
};

export default function CountryModal({ isOpen, onClose, onSave, country, organizationId }: CountryModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setActiveTab('general');
      setErrors({});
      if (country) {
        setFormData({
          name: country.name || '',
          code: country.code || '',
          iso_code: country.iso_code || '',
          currency: country.currency || '',
          timezone: country.timezone || '',
          phone_code: country.phone_code || '',
          flag_emoji: country.flag_emoji || '',
          capital: country.capital || '',
          language: country.language || '',
          notes: country.notes || '',
          status: country.status || 'active',
        });
      } else {
        setFormData({ ...emptyForm });
      }
    }
  }, [country, isOpen]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    if (!formData.code.trim()) newErrors.code = 'El código es requerido';
    if (!formData.iso_code.trim()) newErrors.iso_code = 'El código ISO es requerido';
    if (!formData.currency) newErrors.currency = 'La moneda es requerida';
    if (!formData.timezone) newErrors.timezone = 'La zona horaria es requerida';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      setActiveTab('general');
      return;
    }
    onSave({ ...formData, organization_id: organizationId, id: country?.id });
  };

  const set = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <i className="ri-global-line text-teal-600 text-lg"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {country ? 'Editar País' : 'Nuevo País'}
              </h2>
              <p className="text-xs text-slate-400">{country ? `Modificando: ${country.name}` : 'Completa la información del país'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px ${
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
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del País <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="Ej: Chile"
                    />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código (2 letras) <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.code}
                      onChange={(e) => set('code', e.target.value.toUpperCase())}
                      placeholder="Ej: CL"
                      maxLength={2}
                    />
                    {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código ISO (3 letras) <span className="text-red-500">*</span></label>
                    <Input
                      type="text"
                      value={formData.iso_code}
                      onChange={(e) => set('iso_code', e.target.value.toUpperCase())}
                      placeholder="Ej: CHL"
                      maxLength={3}
                    />
                    {errors.iso_code && <p className="text-xs text-red-500 mt-1">{errors.iso_code}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Capital</label>
                    <Input
                      type="text"
                      value={formData.capital}
                      onChange={(e) => set('capital', e.target.value)}
                      placeholder="Ej: Santiago"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Idioma Principal</label>
                    <Input
                      type="text"
                      value={formData.language}
                      onChange={(e) => set('language', e.target.value)}
                      placeholder="Ej: Español"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Emoji Bandera</label>
                    <Input
                      type="text"
                      value={formData.flag_emoji}
                      onChange={(e) => set('flag_emoji', e.target.value)}
                      placeholder="Ej: 🇨🇱"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado <span className="text-red-500">*</span></label>
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
              </>
            )}

            {/* Tab: Configuración */}
            {activeTab === 'config' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda <span className="text-red-500">*</span></label>
                  <Select
                    value={formData.currency}
                    onChange={(e) => set('currency', e.target.value)}
                    options={CURRENCIES}
                  />
                  {errors.currency && <p className="text-xs text-red-500 mt-1">{errors.currency}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código Telefónico</label>
                  <Input
                    type="text"
                    value={formData.phone_code}
                    onChange={(e) => set('phone_code', e.target.value)}
                    placeholder="Ej: +56"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Zona Horaria <span className="text-red-500">*</span></label>
                  <Select
                    value={formData.timezone}
                    onChange={(e) => set('timezone', e.target.value)}
                    options={TIMEZONES}
                  />
                  {errors.timezone && <p className="text-xs text-red-500 mt-1">{errors.timezone}</p>}
                </div>

                {/* Preview */}
                {(formData.currency || formData.timezone || formData.phone_code) && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Vista previa</p>
                    <div className="flex flex-wrap gap-3">
                      {formData.flag_emoji && (
                        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200">
                          <span className="text-2xl">{formData.flag_emoji}</span>
                          <span className="text-sm font-semibold text-slate-700">{formData.name || 'País'}</span>
                        </div>
                      )}
                      {formData.currency && (
                        <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                          <i className="ri-money-dollar-circle-line text-teal-500"></i>
                          <span className="text-sm font-semibold text-slate-700">{formData.currency}</span>
                        </div>
                      )}
                      {formData.phone_code && (
                        <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                          <i className="ri-phone-line text-teal-500"></i>
                          <span className="text-sm text-slate-700">{formData.phone_code}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Notas */}
            {activeTab === 'notas' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Información adicional, restricciones operativas, observaciones..."
                  rows={6}
                  maxLength={500}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{formData.notes.length}/500</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <div className="flex gap-1">
              {TABS.map((tab, i) => (
                <div key={tab.id} className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-teal-600' : 'bg-slate-300'}`}></div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="primary">
                <i className={country ? 'ri-save-line' : 'ri-add-line'}></i>
                {country ? 'Actualizar' : 'Crear'} País
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
