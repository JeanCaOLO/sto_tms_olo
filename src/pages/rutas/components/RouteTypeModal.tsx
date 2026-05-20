import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';

interface RouteTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  routeType?: any;
}

export default function RouteTypeModal({ isOpen, onClose, onSuccess, routeType }: RouteTypeModalProps) {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    status: 'active'
  });

  useEffect(() => {
    if (routeType) {
      setFormData({
        name: routeType.name || '',
        status: routeType.status || 'active'
      });
    } else {
      setFormData({
        name: '',
        status: 'active'
      });
    }
  }, [routeType, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!appUser?.organization_id) {
      alert('No se encontró la organización');
      return;
    }

    setLoading(true);

    try {
      if (routeType) {
        const { error } = await supabase
          .from('route_types')
          .update({
            name: formData.name,
            status: formData.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', routeType.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('route_types')
          .insert({
            name: formData.name,
            status: formData.status,
            organization_id: appUser.organization_id
          });

        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error al guardar tipo de ruta:', error);
      alert(error.message || 'Error al guardar el tipo de ruta');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {routeType ? 'Editar Tipo de Ruta' : 'Nuevo Tipo de Ruta'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Nombre del Tipo de Ruta"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Ej: GAM, Zona Norte, Zona Sur"
          />

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
              {loading ? 'Guardando...' : routeType ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}