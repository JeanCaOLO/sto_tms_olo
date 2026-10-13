import Button from '../../../../components/base/Button';
import Input from '../../../../components/base/Input';
import Select from '../../../../components/base/Select';
import type { PartyVariableInput, VariableErrors } from '../../../../lib/tarifas/partyVariablesDataSource';
import type { CustomVarOrigin } from '../../../../lib/tarifas/types';

const ORIGIN_OPTIONS: { value: CustomVarOrigin; label: string }[] = [
  { value: 'CONSTANT', label: 'Constante de la compañía (mismo valor en todos los viajes)' },
  { value: 'PER_TRIP', label: 'Se carga en cada liquidación' },
];

const KIND_OPTIONS = [
  { value: 'NUMBER', label: 'Número (sirve para multiplicar o contar)' },
  { value: 'TEXT', label: 'Texto (solo sirve para condicionar)' },
];

interface Props {
  form: PartyVariableInput;
  set: <K extends keyof PartyVariableInput>(key: K, value: PartyVariableInput[K]) => void;
  errors: VariableErrors;
  editingId: string | undefined;
  saving: boolean;
  canCreate: boolean;
  canEdit: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** Formulario de alta o edición de una variable de la compañía. */
export function VariableForm({ form, set, errors, editingId, saving, canCreate, canEdit, onSave, onCancel }: Props) {
  const allowed = editingId ? canEdit : canCreate;
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">
        {editingId ? 'Editar variable' : 'Nueva variable'}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Clave *"
          value={form.key}
          onChange={(e) => set('key', e.target.value)}
          placeholder="horas_espera"
          error={errors.key}
          disabled={!!editingId}
        />
        <Input
          label="Nombre visible *"
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Horas de espera"
          error={errors.label}
        />
        <Select
          label="Tipo *"
          value={form.kind}
          onChange={(e) => set('kind', e.target.value as 'NUMBER' | 'TEXT')}
          options={KIND_OPTIONS}
        />
        <Select
          label="¿De dónde sale el valor? *"
          value={form.origin}
          onChange={(e) => set('origin', e.target.value as CustomVarOrigin)}
          options={ORIGIN_OPTIONS}
        />
        <Input
          label={form.origin === 'CONSTANT' ? 'Valor *' : 'Valor por defecto'}
          value={form.defaultValue ?? ''}
          onChange={(e) => set('defaultValue', e.target.value)}
          placeholder={form.kind === 'NUMBER' ? '15' : 'texto'}
          error={errors.defaultValue}
        />
        <Input
          label="Unidad"
          value={form.unit ?? ''}
          onChange={(e) => set('unit', e.target.value)}
          placeholder="horas"
        />
      </div>

      <div className="flex justify-end gap-2">
        {editingId && (
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        )}
        <Button type="button" onClick={onSave} disabled={saving || !allowed} title={!allowed ? 'Tu rol no puede modificar variables' : undefined}>
          <i className="ri-save-line mr-1"></i>
          {editingId ? 'Guardar cambios' : 'Agregar variable'}
        </Button>
      </div>
    </div>
  );
}
