import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import { saveZoneGroup } from '../../../lib/tarifas/localRulesDataSource';
import { getActorRole } from '../../../lib/tarifas/actor';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { registrarEvento } from '../../../lib/liquidador/auditLog';

interface ZoneGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  group?: any;
  organizationId: string;
  /** País activo del módulo: todo grupo nuevo nace en él. */
  countryId: string;
  /** Zonas del catálogo del país (solo lectura): de ahí se eligen las del grupo. */
  zones: { id: string; code: string; name: string }[];
  usuarioActivo: string;
}

export default function ZoneGroupModal({
  isOpen, onClose, onSuccess, group, organizationId, countryId, zones, usuarioActivo,
}: ZoneGroupModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [zoneCodes, setZoneCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setFormData({ code: group?.code || '', name: group?.name || '' });
    setZoneCodes(Array.isArray(group?.zone_codes) ? group.zone_codes.map(String) : []);
  }, [isOpen, group]);

  const toggleZone = (code: string) => setZoneCodes((prev) => (
    prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
  ));

  const { canCreate, canEdit } = useModulePermissions('tarifas.config');
  const permitido = group ? canEdit : canCreate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!organizationId) {
      setErrorMsg('No se pudo identificar la organización. Recarga la página e intenta de nuevo.');
      return;
    }
    if (!permitido) {
      setErrorMsg(`Tu rol no puede ${group ? 'editar' : 'crear'} grupos de zonas.`);
      return;
    }
    if (!countryId) {
      setErrorMsg('El país es obligatorio.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        country_id: group?.country_id || countryId,
        zone_codes: zoneCodes,
      };

      const { error } = await saveZoneGroup(organizationId, payload, group?.id);
      if (error) {
        setErrorMsg(error.code === '23505' ? error.message : `Error al guardar el grupo: ${error.message}`);
        return;
      }

      await registrarEvento({
        entidad: 'zone_groups',
        entidadId: group?.id || payload.code,
        accion: group ? 'UPDATE' : 'CREATE',
        usuario: usuarioActivo,
        rol: getActorRole(),
        antes: group ?? null,
        despues: payload,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error guardando grupo de zonas:', error);
      setErrorMsg('Error al guardar el grupo. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {group ? 'Editar grupo de zonas' : 'Nuevo grupo de zonas'}
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
            placeholder="Ej: GAM, PERIFERIA"
            required
            disabled={!!group}
          />
          <Input
            label="Nombre *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ej: Gran Área Metropolitana"
            required
          />

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Zonas del grupo</p>
            <p className="text-xs text-gray-500 mb-2">
              Las zonas son del catálogo (solo lectura). Una zona solo puede estar en un grupo por país.
            </p>
            {zones.length === 0 ? (
              <p className="text-xs text-amber-600">No hay zonas en este país.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {zones.map((z) => (
                  <label key={z.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={zoneCodes.includes(z.code)}
                      onChange={() => toggleZone(z.code)}
                    />
                    <span className="font-mono text-teal-700">{z.code}</span>
                    <span className="text-gray-600">{z.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {!permitido && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Tu rol no puede {group ? 'editar' : 'crear'} grupos de zonas.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !permitido}>
              {loading ? 'Guardando...' : group ? 'Actualizar' : 'Crear grupo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
