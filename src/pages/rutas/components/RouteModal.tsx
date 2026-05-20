import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';

interface RouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  route?: any;
}

export default function RouteModal({ isOpen, onClose, onSuccess, route }: RouteModalProps) {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [routeTypes, setRouteTypes] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    route_number: '',
    route_type_id: '',
    status: 'active'
  });

  useEffect(() => {
    if (isOpen && appUser?.organization_id) {
      loadRouteTypes();
    }
  }, [isOpen, appUser?.organization_id]);

  useEffect(() => {
    if (route) {
      setFormData({
        route_number: route.route_number || '',
        route_type_id: route.route_type_id || '',
        status: route.status || 'active'
      });
    } else {
      setFormData({
        route_number: '',
        route_type_id: '',
        status: 'active'
      });
    }
  }, [route]);

  const loadRouteTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('route_types')
        .select('*')
        .eq('organization_id', appUser?.organization_id)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setRouteTypes(data || []);
    } catch (error) {
      console.error('Error loading route types:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.organization_id) return;

    setLoading(true);
    try {
      const dataToSave = {
        route_number: formData.route_number,
        route_type_id: formData.route_type_id,
        status: formData.status,
        organization_id: appUser.organization_id
      };

      if (route) {
        const { error } = await supabase
          .from('routes')
          .update(dataToSave)
          .eq('id', route.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('routes')
          .insert([dataToSave]);

        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving route:', error);
      alert('Error al guardar la ruta');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {route ? 'Editar Ruta' : 'Nueva Ruta'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Nombre de Ruta"
            value={formData.route_number}
            onChange={(e) => setFormData({ ...formData, route_number: e.target.value })}
            placeholder="Ej: Ruta 1"
            required
          />

          <Select
            label="Tipo de Ruta"
            value={formData.route_type_id}
            onChange={(e) => setFormData({ ...formData, route_type_id: e.target.value })}
            required
          >
            <option value="">Seleccionar tipo</option>
            {routeTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>

          <Select
            label="Estado"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            required
          >
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </Select>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading}
            >
              {loading ? 'Guardando...' : route ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}