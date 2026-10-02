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

interface ZonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zona?: any;
}

// Modal de Zona. Tabla `zones` (antes `route_types`, renombrada por backend en
// sql/09). Una zona pertenece a un país (obligatorio) y tiene un `code` único
// por país (código de ruta del WMS). Alta sin país → 409.
export default function ZonaModal({ isOpen, onClose, onSuccess, zona }: ZonaModalProps) {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [formData, setFormData] = useState({ code: '', name: '', country_id: '', status: 'active' });

  useEffect(() => {
    if (!isOpen) return;
    loadPaises();
    setFormData({
      code: zona?.code || '',
      name: zona?.name || '',
      country_id: zona?.country_id || '',
      status: zona?.status || 'active',
    });
  }, [zona, isOpen]);

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
    if (!appUser?.organization_id) return;
    setLoading(true);
    try {
      const payload = {
        code: formData.code || null,
        name: formData.name,
        country_id: formData.country_id || null,
        status: formData.status,
        updated_at: new Date().toISOString(),
      };
      if (zona) {
        const { error } = await supabase.from('zones').update(payload).eq('id', zona.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('zones')
          .insert({ ...payload, organization_id: appUser.organization_id });
        if (error) throw error;
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error al guardar zona:', error);
      alert(error.message || 'Error al guardar la zona');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{zona ? 'Editar Zona' : 'Nueva Zona'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Código"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            placeholder="Ej: 01, 04, 16 (código de ruta WMS)"
          />

          <Input
            label="Nombre de la Zona"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Ej: GAM, Zona Norte, Guanacaste"
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

          <Select
            label="Estado"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            required
            options={[
              { value: 'active', label: 'Activo' },
              { value: 'inactive', label: 'Inactivo' },
            ]}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Guardando...' : zona ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
