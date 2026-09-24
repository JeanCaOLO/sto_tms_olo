import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface Customer { id: string; code: string; name: string; }
interface Zone { id: string; code: string; name: string; }

export interface DeliveryPointForm {
  id?: string;
  customer_id: string;
  external_code: string;
  name: string;
  delivery_instructions: string;
  zone_id: string;
  route_code: string;
  active: boolean;
  line1: string;
  line2: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
}

interface DeliveryPointModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: DeliveryPointForm) => void;
  point?: any;
  error?: string;
}

const emptyForm: DeliveryPointForm = {
  customer_id: '', external_code: '', name: '', delivery_instructions: '',
  zone_id: '', route_code: '', active: true,
  line1: '', line2: '', city: '', state: '', latitude: '', longitude: '',
};

export default function DeliveryPointModal({ isOpen, onClose, onSave, point, error }: DeliveryPointModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [formData, setFormData] = useState<DeliveryPointForm>({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(point?.id);

  useEffect(() => {
    if (!isOpen) return;
    fetchCatalogs();
    setErrors({});
    if (point) {
      setFormData({
        id: point.id,
        customer_id: point.final_customer?.customer?.id || '',
        external_code: point.external_code || '',
        name: point.name || '',
        delivery_instructions: point.delivery_instructions || '',
        zone_id: point.zone?.id || '',
        route_code: point.route_code || '',
        active: point.active ?? true,
        line1: point.address?.line1 || '',
        line2: point.address?.line2 || '',
        city: point.address?.city || '',
        state: point.address?.state || '',
        latitude: point.address?.latitude?.toString() || '',
        longitude: point.address?.longitude?.toString() || '',
      });
    } else {
      setFormData({ ...emptyForm });
    }
  }, [point, isOpen]);

  const fetchCatalogs = async () => {
    const [{ data: cust }, { data: zn }] = await Promise.all([
      supabase.from('customers').select('id,code,name').order('name'),
      supabase.from('zones').select('id,code,name').order('name'),
    ]);
    setCustomers((cust as Customer[]) || []);
    setZones((zn as Zone[]) || []);
  };

  const set = (field: keyof DeliveryPointForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!editing && !formData.customer_id) e.customer_id = 'El cliente es requerido';
    if (!editing && !formData.external_code.trim()) e.external_code = 'El código es requerido';
    if (!formData.name.trim()) e.name = 'El nombre es requerido';
    // Coordenadas: ambas o ninguna (el backend rechaza una sola).
    if ((formData.latitude !== '') !== (formData.longitude !== '')) {
      e.latitude = 'Latitud y longitud van juntas (ambas o ninguna)';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <i className="ri-map-pin-2-line text-teal-600 text-lg"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editing ? 'Editar Punto de Entrega' : 'Nuevo Punto de Entrega'}
              </h2>
              <p className="text-xs text-slate-400">
                {editing ? `Modificando: ${point.name}` : 'Ligado a un cliente'}
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                <i className="ri-error-warning-line"></i>{error}
              </div>
            )}

            {/* Cliente + identificación */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cliente <span className="text-red-500">*</span></label>
                <Select
                  value={formData.customer_id}
                  onChange={(e) => set('customer_id', e.target.value)}
                  disabled={editing}
                  options={[
                    { value: '', label: 'Seleccionar cliente' },
                    ...customers.map(c => ({ value: c.id, label: `${c.name} (${c.code})` })),
                  ]}
                />
                {editing && <p className="text-xs text-slate-400 mt-1">El cliente no se cambia al editar</p>}
                {errors.customer_id && <p className="text-xs text-red-500 mt-1">{errors.customer_id}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código <span className="text-red-500">*</span></label>
                <Input
                  type="text"
                  value={formData.external_code}
                  onChange={(e) => set('external_code', e.target.value.toUpperCase())}
                  disabled={editing}
                  placeholder="Ej: COF-00123"
                />
                {editing && <p className="text-xs text-slate-400 mt-1">El código no se cambia al editar</p>}
                {errors.external_code && <p className="text-xs text-red-500 mt-1">{errors.external_code}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ej: Sucursal Centro"
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Zona</label>
                <Select
                  value={formData.zone_id}
                  onChange={(e) => set('zone_id', e.target.value)}
                  options={[
                    { value: '', label: 'Sin zona' },
                    ...zones.map(z => ({ value: z.id, label: `${z.name} (${z.code})` })),
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código de Ruta</label>
                <Input
                  type="text"
                  value={formData.route_code}
                  onChange={(e) => set('route_code', e.target.value)}
                  placeholder="Ej: R-01"
                />
              </div>
            </div>

            {/* Dirección */}
            <div className="border-t border-slate-100 pt-4 space-y-4">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <i className="ri-map-pin-line text-teal-500"></i>Dirección
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                  <Input type="text" value={formData.line1} onChange={(e) => set('line1', e.target.value)} placeholder="Calle, número..." />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Referencia / Línea 2</label>
                  <Input type="text" value={formData.line2} onChange={(e) => set('line2', e.target.value)} placeholder="Piso, oficina, referencia..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
                  <Input type="text" value={formData.city} onChange={(e) => set('city', e.target.value)} placeholder="Ciudad" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Provincia / Estado</label>
                  <Input type="text" value={formData.state} onChange={(e) => set('state', e.target.value)} placeholder="Provincia o estado" />
                </div>
              </div>

              {/* Coordenadas */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-map-pin-2-line text-teal-600"></i>
                  <h4 className="text-sm font-semibold text-slate-700">Coordenadas GPS</h4>
                  <span className="text-xs text-slate-400">(ambas o ninguna)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Latitud</label>
                    <Input type="text" value={formData.latitude} onChange={(e) => set('latitude', e.target.value)} placeholder="Ej: 9.9333" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Longitud</label>
                    <Input type="text" value={formData.longitude} onChange={(e) => set('longitude', e.target.value)} placeholder="Ej: -84.0833" />
                  </div>
                </div>
                {errors.latitude && <p className="text-xs text-red-500 mt-2">{errors.latitude}</p>}
              </div>
            </div>

            {/* Instrucciones + estado */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Instrucciones de Entrega</label>
                <textarea
                  value={formData.delivery_instructions}
                  onChange={(e) => set('delivery_instructions', e.target.value)}
                  placeholder="Horario, acceso, contacto en sitio..."
                  rows={3}
                  maxLength={500}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              <div
                onClick={() => set('active', !formData.active)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.active ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                  formData.active ? 'bg-teal-600 border-teal-600' : 'border-slate-300'
                }`}>
                  {formData.active && <i className="ri-check-line text-white text-xs"></i>}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Punto activo</p>
                  <p className="text-xs text-slate-500">Los puntos inactivos no se consideran para planificación</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="primary">
              <i className={editing ? 'ri-save-line' : 'ri-add-line'}></i>
              {editing ? 'Actualizar' : 'Crear'} Punto de Entrega
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
