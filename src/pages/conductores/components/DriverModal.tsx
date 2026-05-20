import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface Driver {
  id?: string;
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
}

interface Carrier {
  id: string;
  name: string;
  code: string;
}

interface DriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: Driver | null;
  onSave: () => void;
}

export default function DriverModal({ isOpen, onClose, driver, onSave }: DriverModalProps) {
  const [formData, setFormData] = useState<Driver>({
    code: '',
    full_name: '',
    document: '',
    phone: '',
    email: '',
    license_number: '',
    license_type: 'B',
    license_expiry: '',
    carrier_id: '',
    photo_url: '',
    status: 'active',
    notes: ''
  });
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadCarriers();
      if (driver) {
        setFormData(driver);
      } else {
        generateCode();
      }
    }
  }, [isOpen, driver]);

  const loadCarriers = async () => {
    const { data } = await supabase
      .from('carriers')
      .select('id, name, code')
      .eq('status', 'active')
      .order('name');
    
    if (data) setCarriers(data);
  };

  const generateCode = async () => {
    const { count } = await supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true });
    
    const newCode = `DRV-${String((count || 0) + 1).padStart(3, '0')}`;
    setFormData(prev => ({ ...prev, code: newCode }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { data: userData } = await supabase
        .from('app_users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const driverData = {
        ...formData,
        organization_id: userData?.organization_id,
        updated_at: new Date().toISOString()
      };

      if (driver?.id) {
        const { error: updateError } = await supabase
          .from('drivers')
          .update(driverData)
          .eq('id', driver.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('drivers')
          .insert([{ ...driverData, created_at: new Date().toISOString() }]);

        if (insertError) throw insertError;
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {driver ? 'Editar Conductor' : 'Nuevo Conductor'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
              disabled
            />

            <Input
              label="Nombre Completo"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />

            <Input
              label="RUT/Documento"
              value={formData.document}
              onChange={(e) => setFormData({ ...formData, document: e.target.value })}
              placeholder="12.345.678-9"
              required
            />

            <Input
              label="Teléfono"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+56 9 1234 5678"
              required
            />

            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="conductor@ejemplo.com"
            />

            <Input
              label="Número de Licencia"
              value={formData.license_number}
              onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
              placeholder="A12345678"
              required
            />

            <Select
              label="Tipo de Licencia"
              value={formData.license_type}
              onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
              required
              options={[
                { value: 'B', label: 'Clase B - Automóviles' },
                { value: 'A2', label: 'Clase A2 - Camiones hasta 3.5 ton' },
                { value: 'A4', label: 'Clase A4 - Camiones sobre 3.5 ton' },
                { value: 'A5', label: 'Clase A5 - Articulados' },
              ]}
            />

            <Input
              label="Vencimiento Licencia"
              type="date"
              value={formData.license_expiry}
              onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
              required
            />

            <Select
              label="Transportista"
              value={formData.carrier_id}
              onChange={(e) => setFormData({ ...formData, carrier_id: e.target.value })}
              required
              options={[
                { value: '', label: 'Seleccionar transportista' },
                ...carriers.map(carrier => ({
                  value: carrier.id,
                  label: `${carrier.name} (${carrier.code})`
                }))
              ]}
            />

            <Select
              label="Estado"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
              options={[
                { value: 'active', label: 'Activo' },
                { value: 'inactive', label: 'Inactivo' },
                { value: 'on_leave', label: 'En Licencia' },
              ]}
            />

            <Input
              label="URL Foto"
              value={formData.photo_url || ''}
              onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
              placeholder="https://ejemplo.com/foto.jpg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observaciones
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Notas adicionales sobre el conductor..."
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Guardando...' : driver ? 'Actualizar' : 'Crear Conductor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}