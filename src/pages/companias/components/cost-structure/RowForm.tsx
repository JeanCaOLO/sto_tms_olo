import Button from '../../../../components/base/Button';
import Input from '../../../../components/base/Input';
import Select from '../../../../components/base/Select';
import type { CostRowInput, CostStructureRow } from '../../../../lib/tarifas/costStructureDataSource';
import type { CostDriver } from '../../../../lib/tarifas/types';

const SIGN_OPTIONS = [{ value: 'ADD', label: 'Suma' }, { value: 'SUBTRACT', label: 'Resta' }];

interface Props {
  editing: CostStructureRow | null;
  newRow: CostRowInput;
  setNewRow: (row: CostRowInput) => void;
  driverOptions: { value: string; label: string }[];
  truckTypes: string[];
  currency: string;
  canEdit: boolean;
  canCreate: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

/** Formulario para agregar un concepto a la estructura o editar uno existente. */
export function RowForm({
  editing, newRow, setNewRow, driverOptions, truckTypes, currency, canEdit, canCreate, onSubmit, onCancel,
}: Props) {
  const blocked = editing ? !canEdit : !canCreate;
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-slate-50 rounded-lg p-3">
      <div className="md:col-span-2">
        <Input
          label={editing ? 'Concepto (editando)' : 'Concepto'}
          value={newRow.label}
          onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
          placeholder="Salario del chofer"
        />
      </div>
      <Select
        label="Cómo se cobra"
        value={newRow.driver}
        disabled={!!editing?.frequency}
        onChange={(e) => setNewRow({ ...newRow, driver: e.target.value as CostDriver })}
        options={driverOptions}
      />
      <Input
        label={`Importe (${currency})`}
        value={newRow.amount}
        disabled={!!editing?.frequency}
        onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })}
      />
      <Select
        label="Efecto"
        value={newRow.sign}
        onChange={(e) => setNewRow({ ...newRow, sign: e.target.value as 'ADD' | 'SUBTRACT' })}
        options={SIGN_OPTIONS}
      />
      <Select
        label="Aplica cuando"
        value={newRow.truckType ?? ''}
        onChange={(e) => setNewRow({ ...newRow, truckType: e.target.value || null })}
        options={[
          { value: '', label: 'Siempre' },
          ...truckTypes.map((t) => ({ value: t, label: `Solo para ${t}` })),
          ...(newRow.truckType && !truckTypes.includes(newRow.truckType)
            ? [{ value: newRow.truckType, label: `Solo para ${newRow.truckType}` }] : []),
        ]}
      />
      <div className="md:col-span-6 flex items-center gap-2">
        <Button variant="secondary" onClick={onSubmit} disabled={blocked} title={blocked ? 'Tu rol no puede modificar costos' : undefined}>
          <i className={`${editing ? 'ri-save-line' : 'ri-add-line'} mr-1`}></i> {editing ? 'Guardar cambios' : 'Agregar'}
        </Button>
        {editing && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}
        {editing?.frequency && (
          <span className="text-xs text-slate-500">
            Esta fila se repite cada cierto tiempo: para cambiar su importe o frecuencia, volvé a subir la plantilla.
          </span>
        )}
      </div>
    </div>
  );
}
