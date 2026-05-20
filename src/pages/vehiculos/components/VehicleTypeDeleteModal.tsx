import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';

interface VehicleTypeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicleType: any;
}

const VehicleTypeDeleteModal = ({ isOpen, onClose, onSuccess, vehicleType }: VehicleTypeDeleteModalProps) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('vehicle_types')
        .delete()
        .eq('id', vehicleType.id);
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar el tipo de vehículo');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-full">
            <i className="ri-delete-bin-line text-xl text-red-600"></i>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Eliminar Tipo</h2>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          ¿Estás seguro de eliminar el tipo <strong>{vehicleType?.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VehicleTypeDeleteModal;
