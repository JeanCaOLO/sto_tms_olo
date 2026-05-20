import { useState } from 'react';
import Button from '../../../components/base/Button';
import { supabase } from '../../../lib/supabase';

interface RouteTypeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  routeType: any;
}

export default function RouteTypeDeleteModal({
  isOpen,
  onClose,
  onSuccess,
  routeType
}: RouteTypeDeleteModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!routeType) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('route_types')
        .delete()
        .eq('id', routeType.id);

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error al eliminar tipo de ruta:', error);
      alert(error.message || 'Error al eliminar el tipo de ruta');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
            <i className="ri-alert-line text-2xl text-red-600"></i>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
            ¿Eliminar Tipo de Ruta?
          </h3>

          <p className="text-sm text-gray-600 text-center mb-6">
            ¿Estás seguro de que deseas eliminar el tipo de ruta{' '}
            <strong>"{routeType?.name}"</strong>? Esta acción no se puede deshacer.
          </p>

          <div className="flex gap-3">
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
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {loading ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
