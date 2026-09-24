import Button from '../../../components/base/Button';
import type { AdminRole } from '../admin/admin-api';
import { useRolePermissions } from '../admin/use-role-permissions';
import AdminModal from './AdminModal';
import PermissionsMatrix from './PermissionsMatrix';
import CountriesPicker from './CountriesPicker';

interface Props {
  role: AdminRole;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function PermissionsModal({ role, onClose, onSaved }: Props) {
  const p = useRolePermissions(role.id);

  const handleSave = async () => {
    if (await p.save()) onSaved(`Permisos de ${role.name} actualizados`);
  };

  return (
    <AdminModal title={`Permisos · ${role.name}`} onClose={onClose} wide>
      <div className="p-6 space-y-5">
        {p.error && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-sm">
            <i className="ri-information-line text-lg"></i>
            <span>{p.error}</span>
          </div>
        )}

        {p.loading ? (
          <div className="flex items-center justify-center py-10">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        ) : (
          <>
            <PermissionsMatrix
              grouped={p.grouped}
              actions={p.actions}
              matrix={p.matrix}
              locked={p.locked}
              onToggle={p.toggle}
              onToggleRow={p.toggleRow}
              onToggleColumn={p.toggleColumn}
            />

            <CountriesPicker
              countries={p.countries}
              allCountries={p.allCountries}
              countryIds={p.countryIds}
              locked={p.locked}
              onAllChange={p.setAllCountries}
              onToggleCountry={p.toggleCountry}
            />

            {p.locked && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <i className="ri-lock-2-line"></i>
                Rol administrador: tiene todos los permisos por código y no se puede editar.
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cerrar</Button>
              <Button type="button" onClick={handleSave} disabled={p.saving || p.locked} className="flex-1">
                <i className={p.saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}></i>
                <span>{p.saving ? 'Guardando...' : 'Guardar Permisos'}</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}
