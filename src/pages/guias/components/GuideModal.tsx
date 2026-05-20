import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface GuideModalProps {
  guide?: any;
  onClose: () => void;
}

interface Route {
  id: string;
  route_number: string;
}

interface Driver {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  plate: string;
}

export default function GuideModal({ guide, onClose }: GuideModalProps) {
  const [formData, setFormData] = useState({
    guide_number: '',
    route_id: '',
    driver_id: '',
    vehicle_id: '',
    dispatch_date: new Date().toISOString().split('T')[0],
    total_stops: 0,
    completed_stops: 0,
    delivery_status: 'pending'
  });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
    if (guide) {
      setFormData({
        guide_number: guide.guide_number || '',
        route_id: guide.route_id || '',
        driver_id: guide.driver_id || '',
        vehicle_id: guide.vehicle_id || '',
        dispatch_date: guide.dispatch_date || new Date().toISOString().split('T')[0],
        total_stops: guide.total_stops || 0,
        completed_stops: guide.completed_stops || 0,
        delivery_status: guide.delivery_status || 'pending'
      });
    }
  }, [guide]);

  const fetchData = async () => {
    try {
      const [routesRes, driversRes, vehiclesRes] = await Promise.all([
        supabase.from('routes').select('id, route_number').order('route_number'),
        supabase.from('drivers').select('id, name').order('name'),
        supabase.from('vehicles').select('id, plate').order('plate')
      ]);

      if (routesRes.data) setRoutes(routesRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
      if (vehiclesRes.data) setVehicles(vehiclesRes.data);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (guide) {
        const { error } = await supabase
          .from('dispatch_guides')
          .update(formData)
          .eq('id', guide.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('dispatch_guides')
          .insert([formData]);

        if (error) throw error;
      }

      onClose();
    } catch (error) {
      console.error('Error al guardar guía:', error);
      alert('Error al guardar la guía');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">
            {guide ? 'Editar Guía de Despacho' : 'Nueva Guía de Despacho'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Número de Guía <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.guide_number}
                onChange={(e) => setFormData({ ...formData, guide_number: e.target.value })}
                placeholder="Ej: GD-2024-001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ruta <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.route_id}
                onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                required
              >
                <option value="">Seleccionar ruta</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.route_number}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Conductor <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.driver_id}
                onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                required
              >
                <option value="">Seleccionar conductor</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Vehículo <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.vehicle_id}
                onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                required
              >
                <option value="">Seleccionar vehículo</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Fecha de Despacho <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={formData.dispatch_date}
                onChange={(e) => setFormData({ ...formData, dispatch_date: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Total de Paradas <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                value={formData.total_stops}
                onChange={(e) => setFormData({ ...formData, total_stops: parseInt(e.target.value) || 0 })}
                min="0"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Paradas Completadas
              </label>
              <Input
                type="number"
                value={formData.completed_stops}
                onChange={(e) => setFormData({ ...formData, completed_stops: parseInt(e.target.value) || 0 })}
                min="0"
                max={formData.total_stops}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Estado de Entrega <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.delivery_status}
                onChange={(e) => setFormData({ ...formData, delivery_status: e.target.value })}
                required
              >
                <option value="pending">Pendiente</option>
                <option value="in_transit">En Tránsito</option>
                <option value="delivered">Entregada</option>
                <option value="failed">Con Incidencias</option>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={onClose}>
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
                  {guide ? 'Actualizar' : 'Crear'} Guía
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}