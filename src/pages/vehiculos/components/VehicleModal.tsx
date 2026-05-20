import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicle?: any;
  organizationId: string;
  vehicleTypes?: any[];
}

const VehicleModal = ({ isOpen, onClose, onSuccess, vehicle, organizationId, vehicleTypes = [] }: VehicleModalProps) => {
  const [loading, setLoading] = useState(false);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    vehicle_type: '',
    capacity_weight: '',
    capacity_volume: '',
    pallets: '',
    fuel_type: 'diesel',
    status: 'activo',
    carrier_id: '',
    image_url: '',
    notes: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadCarriers();
      if (vehicle) {
        setFormData({
          plate: vehicle.plate || '',
          brand: vehicle.brand || '',
          model: vehicle.model || '',
          year: vehicle.year || new Date().getFullYear(),
          vehicle_type: vehicle.vehicle_type || '',
          capacity_weight: vehicle.capacity_weight || '',
          capacity_volume: vehicle.capacity_volume || '',
          pallets: vehicle.pallets || '',
          fuel_type: vehicle.fuel_type || 'diesel',
          status: vehicle.status || 'activo',
          carrier_id: vehicle.carrier_id || '',
          image_url: vehicle.image_url || '',
          notes: vehicle.notes || ''
        });
      } else {
        setFormData({
          plate: '',
          brand: '',
          model: '',
          year: new Date().getFullYear(),
          vehicle_type: '',
          capacity_weight: '',
          capacity_volume: '',
          pallets: '',
          fuel_type: 'diesel',
          status: 'activo',
          carrier_id: '',
          image_url: '',
          notes: ''
        });
      }
    }
  }, [isOpen, vehicle]);

  const loadCarriers = async () => {
    const { data } = await supabase
      .from('carriers')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
    if (data) setCarriers(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const vehicleData = {
        organization_id: organizationId,
        plate: formData.plate,
        brand: formData.brand,
        model: formData.model,
        year: parseInt(formData.year.toString()),
        vehicle_type: formData.vehicle_type,
        capacity_weight: parseFloat(formData.capacity_weight.toString()),
        capacity_volume: parseFloat(formData.capacity_volume.toString()),
        pallets: formData.pallets ? parseInt(formData.pallets.toString()) : null,
        fuel_type: formData.fuel_type,
        status: formData.status,
        carrier_id: formData.carrier_id,
        image_url: formData.image_url || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString()
      };

      if (vehicle) {
        const { error } = await supabase.from('vehicles').update(vehicleData).eq('id', vehicle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vehicles').insert([vehicleData]);
        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar el vehículo');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const activeTypes = vehicleTypes.filter(t => t.status === 'activo');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {vehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Placa/Patente *</label>
              <Input
                value={formData.plate}
                onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
                placeholder="ABC-1234"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transportista *</label>
              <Select
                value={formData.carrier_id}
                onChange={(e) => setFormData({ ...formData, carrier_id: e.target.value })}
                required
                options={[
                  { value: '', label: 'Seleccionar transportista' },
                  ...carriers.map((c) => ({ value: c.id, label: c.name }))
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca *</label>
              <Input
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="Mercedes-Benz"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modelo *</label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="Actros 2546"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Año *</label>
              <Input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                min="1990"
                max={new Date().getFullYear() + 1}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Vehículo *
              </label>
              {activeTypes.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <i className="ri-alert-line"></i>
                  <span>No hay tipos activos. Créalos en la pestaña <strong>Tipos de Vehículo</strong>.</span>
                </div>
              ) : (
                <Select
                  value={formData.vehicle_type}
                  onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                  required
                  options={[
                    { value: '', label: 'Seleccionar tipo' },
                    ...activeTypes.map((t) => ({ value: t.id, label: t.name }))
                  ]}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad Peso (kg) *</label>
              <Input
                type="number"
                value={formData.capacity_weight}
                onChange={(e) => setFormData({ ...formData, capacity_weight: e.target.value })}
                placeholder="5000"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad Volumen (m³) *</label>
              <Input
                type="number"
                value={formData.capacity_volume}
                onChange={(e) => setFormData({ ...formData, capacity_volume: e.target.value })}
                placeholder="30"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número de Pallets</label>
              <Input
                type="number"
                value={formData.pallets}
                onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                placeholder="20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Combustible</label>
              <Select
                value={formData.fuel_type}
                onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                options={[
                  { value: 'diesel', label: 'Diesel' },
                  { value: 'gasolina', label: 'Gasolina' },
                  { value: 'electrico', label: 'Eléctrico' },
                  { value: 'hibrido', label: 'Híbrido' },
                  { value: 'gnc', label: 'GNC' },
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
                options={[
                  { value: 'activo', label: 'Activo' },
                  { value: 'mantenimiento', label: 'En Mantenimiento' },
                  { value: 'inactivo', label: 'Inactivo' },
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL de Imagen</label>
              <Input
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                rows={3}
                placeholder="Notas adicionales sobre el vehículo..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
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
              {loading ? 'Guardando...' : vehicle ? 'Actualizar' : 'Crear Vehículo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleModal;
