import Button from '../../../../components/base/Button';
import Badge from '../../../../components/base/Badge';
import type { PartyVariable } from '../../../../lib/tarifas/types';

interface Props {
  variables: PartyVariable[];
  loading: boolean;
  canEdit: boolean;
  onEdit: (variable: PartyVariable) => void;
  onToggle: (variable: PartyVariable) => void;
}

function VariableRow({ variable, canEdit, onEdit, onToggle }: Omit<Props, 'variables' | 'loading'> & { variable: PartyVariable }) {
  return (
    <tr className={variable.active ? '' : 'bg-slate-50/60'}>
      <td className="px-3 py-2 font-mono text-xs text-slate-600">{variable.key}</td>
      <td className="px-3 py-2 text-slate-800">{variable.label}</td>
      <td className="px-3 py-2 text-slate-600">
        {variable.kind === 'NUMBER' ? 'Número' : 'Texto'}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {variable.origin === 'CONSTANT' ? 'Constante' : 'Por viaje'}
      </td>
      <td className="px-3 py-2 text-slate-600">
        {variable.defaultValue ?? '—'}
        {variable.unit ? <span className="text-xs text-slate-400"> {variable.unit}</span> : null}
      </td>
      <td className="px-3 py-2">
        <Badge variant={variable.active ? 'success' : 'default'} size="sm">
          {variable.active ? 'Activa' : 'De baja'}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(variable)} disabled={!canEdit} title={canEdit ? 'Editar' : 'Tu rol no puede editar variables'}>
            <i className="ri-edit-line"></i>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(variable)}
            disabled={!canEdit}
            title={!canEdit ? 'Tu rol no puede editar variables' : variable.active ? 'Dar de baja' : 'Reactivar'}
          >
            <i className={variable.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Lista de variables de la compañía: cargando, vacía o tabla con sus acciones. */
export function VariablesTable({ variables, loading, canEdit, onEdit, onToggle }: Props) {
  if (loading) {
    return <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>;
  }
  if (variables.length === 0) {
    return (
      <div className="text-center py-8">
        <i className="ri-code-box-line text-3xl text-slate-300"></i>
        <p className="mt-2 text-sm text-slate-600 font-medium">Esta compañía no tiene variables propias</p>
        <p className="text-xs text-slate-500">
          Agregá una solo si esta compañía calcula con algo que el sistema no trae de fábrica.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
            <th className="px-3 py-2">Clave</th>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Origen</th>
            <th className="px-3 py-2">Valor</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {variables.map((variable) => (
            <VariableRow key={variable.id} variable={variable} canEdit={canEdit} onEdit={onEdit} onToggle={onToggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
