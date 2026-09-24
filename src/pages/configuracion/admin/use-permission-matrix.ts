import { useMemo, useState } from 'react';
import type { PermAction, PermissionCatalog } from './admin-api';

// Estado de la matriz: por módulo, un Set de acciones marcadas.
export type Matrix = Record<string, Set<PermAction>>;

// Estado puro de la grilla de permisos (matriz + países) y sus toggles. No habla
// con transporte: la carga/guardado vive en useRolePermissions.
export function usePermissionMatrix(catalog: PermissionCatalog | null, locked: boolean) {
  const [matrix, setMatrix] = useState<Matrix>({});
  const [allCountries, setAllCountries] = useState(true);
  const [countryIds, setCountryIds] = useState<Set<string>>(new Set());

  const actions = catalog?.actions ?? [];

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

  return {
    matrix, setMatrix, allCountries, setAllCountries, countryIds, setCountryIds,
    actions, grouped, toggle, toggleRow, toggleColumn, toggleCountry,
  };
}
