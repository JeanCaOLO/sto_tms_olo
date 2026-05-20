import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface VehicleTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicleType?: any;
  organizationId: string;
}

const ICON_OPTIONS = [
  { value: 'ri-truck-line', label: 'Camión' },
  { value: 'ri-car-line', label: 'Auto' },
  { value: 'ri-bus-line', label: 'Bus/Van' },
  { value: 'ri-motorbike-line', label: 'Moto' },
  { value: 'ri-taxi-line', label: 'Camioneta' },
  { value: 'ri-ship-line', label: 'Barco' },
  { value: 'ri-flight-takeoff-line', label: 'Avión' },
];

const VehicleTypeModal = ({ isOpen, onClose, onSuccess, vehicleType, organizationId }: VehicleTypeModalProps) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'ri-truck-line',
    status: 'activo',
  });

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (vehicleType) {
        setFormData({
          name: vehicleType.name || '',
          description: vehicleType.description || '',
          icon: vehicleType.icon || 'ri-truck-line',
          status: vehicleType.status || 'activo',
        });
      } else {
        setFormData({ name: '', description: '', icon: 'ri-truck-line', status: 'activo' });
      }
    }
  }, [isOpen, vehicleType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!organizationId) {
      setErrorMsg('No se pudo identificar la organización. Recarga la página e intenta de nuevo.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        organization_id: organizationId,
        name: formData.name,
        description: formData.description || null,
        icon: formData.icon,
        status: formData.status,
        updated_at: new Date().toISOString(),
      };

      if (vehicleType) {
        const { error } = await supabase.from('vehicle_types').update(payload).eq('id', vehicleType.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vehicle_types').insert([payload]);
        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error:', error);
      const msg = error?.message || JSON.stringify(error);
      if (msg.includes('42501') || msg.includes('row-level security')) {
        setErrorMsg('Sin permisos para realizar esta acción. Verifica que tu sesión esté activa.');
      } else {
        setErrorMsg('Error al guardar el tipo de vehículo. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {vehicleType ? 'Editar Tipo de Vehículo' : 'Nuevo Tipo de Vehículo'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Camión, Furgón, Van..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              rows={2}
              placeholder="Descripción opcional..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ícono
            </label>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg">
                <i className={`${formData.icon} text-xl text-teal-600`}></i>
              </div>
              <Select
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                options={ICON_OPTIONS}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado *
            </label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
              options={[
                { value: 'activo', label: 'Activo' },
                { value: 'inactivo', label: 'Inactivo' },
              ]}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Guardando...' : vehicleType ? 'Actualizar' : 'Crear Tipo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleTypeModal;
