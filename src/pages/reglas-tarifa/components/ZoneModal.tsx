import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { saveZone } from '../../../lib/tarifas/localRulesDataSource';
import { puede } from '../../../lib/liquidador/rbac';
import type { LiquidadorRole } from '../../../lib/liquidador/rbac';
import { registrarEvento } from '../../../lib/liquidador/auditLog';

interface ZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zone?: any;
  organizationId: string;
  countries: { id: string; name: string }[];
  zoneGroups: { id: string; name: string }[];
  rolActivo: LiquidadorRole;
  usuarioActivo: string;
}

export default function ZoneModal({ isOpen, onClose, onSuccess, zone, organizationId, countries, zoneGroups, rolActivo, usuarioActivo }: ZoneModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    country_id: '',
    zone_group_id: '',
    status: 'active',
  });

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (zone) {
        setFormData({
          code: zone.code || '',
          name: zone.name || '',
          country_id: zone.country_id || '',
          zone_group_id: zone.zone_group_id || '',
          status: zone.status || 'active',
        });
      } else {
        setFormData({ code: '', name: '', country_id: countries[0]?.id ?? '', zone_group_id: '', status: 'active' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, zone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!organizationId) {
      setErrorMsg('No se pudo identificar la organización. Recarga la página e intenta de nuevo.');
      return;
    }

    if (!puede(zone ? 'EDITAR_ZONA' : 'CREAR_ZONA', rolActivo)) {
      setErrorMsg('Tu rol simulado actual no tiene permiso para esta acción. Cambiá a "Jefe de transporte" en el selector de rol.');
      return;
    }

    if (!formData.country_id) {
      setErrorMsg('El país es obligatorio.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name,
        country_id: formData.country_id,
        zone_group_id: formData.zone_group_id || null,
        status: formData.status,
      };

      const { error } = await saveZone(organizationId, payload, zone?.id);
      if (error) throw error;

      await registrarEvento({
        entidad: 'zones',
        entidadId: zone?.id || payload.code,
        accion: zone ? 'UPDATE' : 'CREATE',
        usuario: usuarioActivo,
        rol: rolActivo,
        antes: zone ?? null,
        despues: payload,
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error:', error);
      const msg = error?.message || JSON.stringify(error);
      if (msg.includes('42501') || msg.includes('row-level security')) {
        setErrorMsg('Sin permisos para realizar esta acción. Verifica que tu sesión esté activa.');
      } else if (msg.includes('duplicate key') || msg.includes('unique')) {
        setErrorMsg('Ya existe una zona con ese código en esta organización.');
      } else {
        setErrorMsg('Error al guardar la zona. Intenta de nuevo.');
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
            {zone ? 'Editar Zona' : 'Nueva Zona'}
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

          <Input
            label="Código *"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            placeholder="Ej: NORTE, GAM, ZONA-1"
            required
          />
          <p className="text-xs text-gray-500 -mt-3">
            Las reglas de tarifa referencian este código, no el nombre. Usar siempre mayúsculas y sin espacios.
          </p>

          <Input
            label="Nombre *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ej: Zona Norte"
            required
          />

          <Select
            label="País *"
            value={formData.country_id}
            onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
            options={[{ value: '', label: 'Elegir...' }, ...countries.map((c) => ({ value: c.id, label: c.name }))]}
            required
          />

          <Select
            label="Grupo de zona"
            value={formData.zone_group_id}
            onChange={(e) => setFormData({ ...formData, zone_group_id: e.target.value })}
            options={[{ value: '', label: 'Sin grupo' }, ...zoneGroups.map((g) => ({ value: g.id, label: g.name }))]}
          />

          <Select
            label="Estado *"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            required
            options={[
              { value: 'active', label: 'Activo' },
              { value: 'inactive', label: 'Inactivo' },
            ]}
          />

          {!puede(zone ? 'EDITAR_ZONA' : 'CREAR_ZONA', rolActivo) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Tu rol simulado actual ("{rolActivo}") no puede {zone ? 'editar' : 'crear'} zonas — cambiá a "Jefe de transporte".
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !puede(zone ? 'EDITAR_ZONA' : 'CREAR_ZONA', rolActivo)}>
              {loading ? 'Guardando...' : zone ? 'Actualizar' : 'Crear Zona'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
