import { useEffect, useState } from 'react';
import {
  getPermissionCatalog, getRolePermissions, putRolePermissions, listCountries,
  type PermAction, type PermissionCatalog, type Option,
} from './admin-api';
import { usePermissionMatrix, type Matrix } from './use-permission-matrix';

const fillAll = (cat: PermissionCatalog): Matrix => {
  const full: Matrix = {};
  for (const mod of cat.modules) full[mod.key] = new Set(cat.actions);
  return full;
};

// Único punto que habla con el transporte de permisos: carga (catálogo + rol +
// países) y guardado. El estado de la grilla lo maneja usePermissionMatrix.
export function useRolePermissions(roleId: string) {
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [countries, setCountries] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false); // rol administrador: matriz bloqueada
  const grid = usePermissionMatrix(catalog, locked);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getPermissionCatalog(), getRolePermissions(roleId), listCountries()])
      .then(([cat, perms, ctries]) => {
        if (cancelled) return;
        setCatalog(cat);
        setCountries(ctries);
        if (perms.is_admin) {
          setLocked(true);
          grid.setMatrix(fillAll(cat));
          grid.setAllCountries(true);
          return;
        }
        const next: Matrix = {};
        for (const mod of cat.modules) next[mod.key] = new Set(perms.modules[mod.key] ?? []);
        grid.setMatrix(next);
        grid.setAllCountries(perms.all_countries);
        grid.setCountryIds(new Set(perms.country_ids));
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [roleId]);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError('');
    const modules: Record<string, PermAction[]> = {};
    for (const [key, set] of Object.entries(grid.matrix)) {
      if (set.size > 0) modules[key] = [...set];
    }
    try {
      await putRolePermissions(roleId, {
        modules,
        all_countries: grid.allCountries,
        country_ids: grid.allCountries ? [] : [...grid.countryIds],
      });
      return true;
    } catch (err) {
      const message = (err as Error).message;
      if (catalog && /administrador|admin/i.test(message)) { // defensa: 409 de admin
        setLocked(true);
        grid.setMatrix(fillAll(catalog));
        grid.setAllCountries(true);
      }
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { catalog, countries, loading, saving, error, locked, save, ...grid };
}
