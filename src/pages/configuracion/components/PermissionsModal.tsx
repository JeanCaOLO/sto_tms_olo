import { Fragment, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import {
  getPermissionCatalog, getRolePermissions, putRolePermissions, listCountries,
  type AdminRole, type PermAction, type PermissionCatalog, type Option,
} from '../admin/admin-api';
import AdminModal from './AdminModal';

interface Props {
  role: AdminRole;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const ACTION_LABEL: Record<PermAction, string> = {
  view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar', export: 'Exportar',
};
const GROUP_LABEL: Record<string, string> = {
  oms: 'OMS', catalogos: 'Catálogos', '': 'General',
};

// Estado de la matriz: por módulo, un Set de acciones marcadas.
type Matrix = Record<string, Set<PermAction>>;

export default function PermissionsModal({ role, onClose, onSaved }: Props) {
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [allCountries, setAllCountries] = useState(true);
  const [countryIds, setCountryIds] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false); // rol administrador: todo marcado, no editable

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getPermissionCatalog(), getRolePermissions(role.id), listCountries()])
      .then(([cat, perms, ctries]) => {
        if (cancelled) return;
        setCatalog(cat);
        setCountries(ctries);
        const next: Matrix = {};
        for (const mod of cat.modules) {
          next[mod.key] = new Set(perms.modules[mod.key] ?? []);
        }
        setMatrix(next);
        setAllCountries(perms.all_countries);
        setCountryIds(new Set(perms.country_ids));
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role.id]);

  const grouped = useMemo(() => {
    const groups: Record<string, PermissionCatalog['modules']> = {};
    for (const mod of catalog?.modules ?? []) {
      const g = mod.group ?? '';
      (groups[g] ??= []).push(mod);
    }
    return groups;
  }, [catalog]);

  const actions = catalog?.actions ?? [];

  const toggle = (moduleKey: string, action: PermAction) => {
    if (locked) return;
    setMatrix((prev) => {
      const set = new Set(prev[moduleKey]);
      if (set.has(action)) set.delete(action);
      else set.add(action);
      return { ...prev, [moduleKey]: set };
    });
  };

  const toggleRow = (moduleKey: string) => {
    if (locked) return;
    setMatrix((prev) => {
      const current = prev[moduleKey] ?? new Set();
      const full = current.size === actions.length;
      return { ...prev, [moduleKey]: full ? new Set() : new Set(actions) };
    });
  };

  const toggleColumn = (action: PermAction) => {
    if (locked || !catalog) return;
    const allOn = catalog.modules.every((m) => matrix[m.key]?.has(action));
    setMatrix((prev) => {
      const next: Matrix = {};
      for (const m of catalog.modules) {
        const set = new Set(prev[m.key]);
        if (allOn) set.delete(action);
        else set.add(action);
        next[m.key] = set;
      }
      return next;
    });
  };

  const toggleCountry = (id: string) => {
    setCountryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const modules: Record<string, PermAction[]> = {};
    for (const [key, set] of Object.entries(matrix)) {
      if (set.size > 0) modules[key] = [...set];
    }
    try {
      await putRolePermissions(role.id, {
        modules,
        all_countries: allCountries,
        country_ids: allCountries ? [] : [...countryIds],
      });
      onSaved(`Permisos de ${role.name} actualizados`);
    } catch (err) {
      const message = (err as Error).message;
      // 409: rol administrador (tiene todo por código). Bloqueamos y marcamos todo.
      if (/administrador|admin/i.test(message)) {
        setLocked(true);
        if (catalog) {
          const full: Matrix = {};
          for (const m of catalog.modules) full[m.key] = new Set(actions);
          setMatrix(full);
        }
        setAllCountries(true);
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`Permisos · ${role.name}`} onClose={onClose} wide>
      <div className="p-6 space-y-5">
        {error && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-sm">
            <i className="ri-information-line text-lg"></i>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        ) : (
          <>
            {/* Matriz módulos × acciones */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Módulo</th>
                    {actions.map((action) => (
                      <th key={action} className="px-3 py-2 font-semibold text-slate-700 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleColumn(action)}
                          disabled={locked}
                          className="hover:text-teal-600 cursor-pointer disabled:cursor-default"
                          title={`Marcar/desmarcar toda la columna ${ACTION_LABEL[action]}`}
                        >
                          {ACTION_LABEL[action]}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([group, mods]) => (
                    <Fragment key={`g-${group}`}>
                      <tr className="bg-slate-100/60">
                        <td colSpan={actions.length + 1} className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {GROUP_LABEL[group] ?? group}
                        </td>
                      </tr>
                      {mods.map((mod) => (
                        <tr key={mod.key} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleRow(mod.key)}
                              disabled={locked}
                              className="text-slate-700 hover:text-teal-600 cursor-pointer disabled:cursor-default text-left"
                              title="Marcar/desmarcar toda la fila"
                            >
                              {mod.key}
                            </button>
                          </td>
                          {actions.map((action) => (
                            <td key={action} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={matrix[mod.key]?.has(action) ?? false}
                                onChange={() => toggle(mod.key, action)}
                                disabled={locked}
                                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:cursor-default"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Países que puede ver */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Países que puede ver</h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" checked={allCountries} onChange={() => setAllCountries(true)}
                    disabled={locked} className="text-teal-600 focus:ring-teal-500" />
                  Todos los países
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" checked={!allCountries} onChange={() => setAllCountries(false)}
                    disabled={locked} className="text-teal-600 focus:ring-teal-500" />
                  Solo algunos
                </label>
              </div>
              {!allCountries && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {countries.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={countryIds.has(c.id)} onChange={() => toggleCountry(c.id)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                  {countries.length === 0 && <p className="text-xs text-slate-400">No hay países.</p>}
                </div>
              )}
            </div>

            {locked && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <i className="ri-lock-2-line"></i>
                Rol administrador: tiene todos los permisos por código y no se puede editar.
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cerrar</Button>
              <Button type="button" onClick={handleSave} disabled={saving || locked} className="flex-1">
                <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}></i>
                <span>{saving ? 'Guardando...' : 'Guardar Permisos'}</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}
