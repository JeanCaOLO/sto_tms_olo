import { useEffect, useMemo, useState } from 'react';
import {
  getPermissionCatalog, getRolePermissions, putRolePermissions, listCountries,
  type PermAction, type PermissionCatalog, type Option,
} from './admin-api';

// Estado de la matriz: por módulo, un Set de acciones marcadas.
export type Matrix = Record<string, Set<PermAction>>;

// Concentra la carga (catálogo + permisos del rol + países) y las operaciones
// de la matriz. El componente solo pinta; toda la lógica de estado vive acá.
export function useRolePermissions(roleId: string) {
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [allCountries, setAllCountries] = useState(true);
  const [countryIds, setCountryIds] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Rol administrador: matriz marcada y bloqueada (el backend lo informa con is_admin).
  const [locked, setLocked] = useState(false);

  const actions = catalog?.actions ?? [];

  const fillAll = (cat: PermissionCatalog): Matrix => {
    const full: Matrix = {};
    for (const mod of cat.modules) full[mod.key] = new Set(cat.actions);
    return full;
  };

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
          setMatrix(fillAll(cat));
          setAllCountries(true);
          return;
        }
        const next: Matrix = {};
        for (const mod of cat.modules) next[mod.key] = new Set(perms.modules[mod.key] ?? []);
        setMatrix(next);
        setAllCountries(perms.all_countries);
        setCountryIds(new Set(perms.country_ids));
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [roleId]);

  const grouped = useMemo(() => {
    const groups: Record<string, PermissionCatalog['modules']> = {};
    for (const mod of catalog?.modules ?? []) {
      (groups[mod.group ?? ''] ??= []).push(mod);
    }
    return groups;
  }, [catalog]);

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
      const full = (prev[moduleKey]?.size ?? 0) === actions.length;
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

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError('');
    const modules: Record<string, PermAction[]> = {};
    for (const [key, set] of Object.entries(matrix)) {
      if (set.size > 0) modules[key] = [...set];
    }
    try {
      await putRolePermissions(roleId, {
        modules,
        all_countries: allCountries,
        country_ids: allCountries ? [] : [...countryIds],
      });
      return true;
    } catch (err) {
      const message = (err as Error).message;
      // Defensa: si igual pega el 409 de rol admin, bloqueamos y marcamos todo.
      if (catalog && /administrador|admin/i.test(message)) {
        setLocked(true);
        setMatrix(fillAll(catalog));
        setAllCountries(true);
      }
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    catalog, grouped, actions, matrix, countries, countryIds, allCountries,
    loading, saving, error, locked,
    setAllCountries, toggle, toggleRow, toggleColumn, toggleCountry, save,
  };
}
