import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';

interface Pais {
  id: string;
  name: string;
}

interface LicenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  licencia?: any;
}

// Catálogo `driver_license_types`. Columnas en español: `code, name, orden,
// activo, country_id`. Una licencia pertenece a un país (todas las actuales,
// Costa Rica). El conductor referencia la licencia por `code` (ver DriverModal).
export default function LicenciaModal({ isOpen, onClose, onSuccess, licencia }: LicenciaModalProps) {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [formData, setFormData] = useState({ code: '', name: '', description: '', country_id: '', orden: 0, activo: true });

  useEffect(() => {
    if (!isOpen) return;
    loadPaises();
    setFormData({
      code: licencia?.code || '',
      name: licencia?.name || '',
      description: licencia?.description || '',
      country_id: licencia?.country_id || '',
      orden: licencia?.orden ?? 0,
      activo: licencia?.activo ?? true,
    });
  }, [licencia, isOpen]);

  const loadPaises = async () => {
    if (!appUser?.organization_id) return;
    const { data } = await supabase
      .from('countries')
      .select('id, name')
      .eq('organization_id', appUser.organization_id)
      .order('name');
    if (data) setPaises(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        code: formData.code,
        name: formData.name,
        description: formData.description || null,
        country_id: formData.country_id || null,
        orden: Number(formData.orden) || 0,
        activo: formData.activo,
      };
      if (licencia) {
        const { error } = await supabase.from('driver_license_types').update(payload).eq('id', licencia.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('driver_license_types').insert(payload);
        if (error) throw error;
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error al guardar licencia:', error);
      alert(error.message || 'Error al guardar la licencia');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{licencia ? 'Editar Licencia' : 'Nueva Licencia'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Código"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            required
            placeholder="Ej: B, A2, A4, A5"
          />
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Ej: B1 - Vehículo liviano"
          />
          <Input
            label="Descripción"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detalle o restricción (opcional)"
          />
          <Select
            label="País"
            value={formData.country_id}
            onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
            required
            options={[
              { value: '', label: 'Seleccionar país' },
              ...paises.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Input
            label="Orden"
            type="number"
            value={String(formData.orden)}
            onChange={(e) => setFormData({ ...formData, orden: Number(e.target.value) })}
          />
          <Select
            label="Estado"
            value={formData.activo ? 'true' : 'false'}
            onChange={(e) => setFormData({ ...formData, activo: e.target.value === 'true' })}
            required
            options={[
              { value: 'true', label: 'Activo' },
              { value: 'false', label: 'Inactivo' },
            ]}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Guardando...' : licencia ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
