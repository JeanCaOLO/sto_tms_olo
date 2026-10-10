// Permisos por módulo del backend simulado (`backend/tarifas/src/app.py`: `tarifas` liquida, `tarifas.config` configura).

import type { Table } from './schema';
import { HttpFail } from './errors';

export type MockRole = 'admin' | 'liquidar' | 'configurar';
type Action = 'view' | 'create' | 'edit' | 'delete';

export const MODULE = 'tarifas';
export const CONFIG_MODULE = 'tarifas.config';
// Lo único que escribe quien liquida; todo lo demás es configuración (`app.LIQUIDATION_TABLES`).
const LIQUIDATION_TABLES = new Set(['tarifas_settlements', 'tarifas_audit_log', 'tarifas_trip_order_marks']);
const ACTION_OF = { insert: 'create', update: 'edit', delete: 'delete' } as const;

const GRANTS: Record<MockRole, Record<string, Action[]> | 'all'> = {
  admin: 'all',
  liquidar: { [MODULE]: ['view', 'create', 'edit'], [CONFIG_MODULE]: ['view'] },
  configurar: { [MODULE]: ['view'], [CONFIG_MODULE]: ['view', 'create', 'edit', 'delete'] },
};

export function permissionsFor(role: () => MockRole) {
  const can = (module: string, action: Action) => {
    const grants = GRANTS[role()];
    return grants === 'all' || (grants[module]?.includes(action) ?? false);
  };
  const needs = (module: string, action: Action) => {
    if (!can(module, action)) throw new HttpFail(403, `Tu rol no tiene permiso para "${action}" en "${module}".`);
  };
  return {
    /** Leer exige poder liquidar o poder configurar. */
    reader() {
      if (!(can(MODULE, 'view') || can(CONFIG_MODULE, 'view'))) needs(MODULE, 'view');
    },
    /** Entidades externas y bitácora no se escriben; el resto exige el módulo que corresponda. */
    writer(t: Table, op: keyof typeof ACTION_OF) {
      if (t.readOnly) throw new HttpFail(405, `${t.label}: es un dato del TMS y el liquidador solo lo lee.`);
      if (t.appendOnly && op !== 'insert') throw new HttpFail(405, `${t.label}: es append-only, no admite ${op}.`);
      needs(LIQUIDATION_TABLES.has(t.name) ? MODULE : CONFIG_MODULE, ACTION_OF[op]);
    },
  };
}
