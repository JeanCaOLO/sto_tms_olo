import { Fragment } from 'react';
import type { PermAction, PermissionCatalog } from '../admin/admin-api';
import type { Matrix } from '../admin/use-role-permissions';

const ACTION_LABEL: Record<PermAction, string> = {
  view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar', export: 'Exportar',
};
const GROUP_LABEL: Record<string, string> = {
  oms: 'OMS', catalogos: 'Catálogos', '': 'General',
};

interface Props {
  grouped: Record<string, PermissionCatalog['modules']>;
  actions: PermAction[];
  matrix: Matrix;
  locked: boolean;
  onToggle: (moduleKey: string, action: PermAction) => void;
  onToggleRow: (moduleKey: string) => void;
  onToggleColumn: (action: PermAction) => void;
}

// Grilla módulos (filas, agrupadas) × acciones (columnas). Solo presentación:
// el estado y los toggles viven en useRolePermissions.
export default function PermissionsMatrix({
  grouped, actions, matrix, locked, onToggle, onToggleRow, onToggleColumn,
}: Props) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 font-semibold text-slate-700">Módulo</th>
            {actions.map((action) => (
              <th key={action} className="px-3 py-2 font-semibold text-slate-700 text-center whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onToggleColumn(action)}
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
                      onClick={() => onToggleRow(mod.key)}
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
                        onChange={() => onToggle(mod.key, action)}
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
  );
}
