import { useState } from 'react';
import type { PartyVariableInput, VariableErrors } from '../../../lib/tarifas/partyVariablesDataSource';
import type { PartyVariable } from '../../../lib/tarifas/types';

/** Formulario en blanco para dar de alta una variable de la compañía. */
export const emptyVariableForm = (partyId: string): PartyVariableInput => ({
  partyId,
  key: '',
  label: '',
  kind: 'NUMBER',
  origin: 'CONSTANT',
  defaultValue: '',
  unit: '',
  active: true,
});

export function useVariablesForm(initialPartyId: string) {
  const [form, setForm] = useState<PartyVariableInput>(emptyVariableForm(initialPartyId));
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<VariableErrors>({});

  const set = <K extends keyof PartyVariableInput>(key: K, value: PartyVariableInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const startEdit = (variable: PartyVariable) => {
    setEditingId(variable.id);
    setErrors({});
    setForm({
      partyId: variable.partyId,
      key: variable.key.replace(/^custom:/, ''),
      label: variable.label,
      kind: variable.kind,
      origin: variable.origin,
      defaultValue: variable.defaultValue ?? '',
      unit: variable.unit ?? '',
      active: variable.active,
    });
  };

  const cancelEdit = () => {
    setEditingId(undefined);
    setForm(emptyVariableForm(initialPartyId));
    setErrors({});
  };

  return { form, setForm, set, editingId, setEditingId, errors, setErrors, startEdit, cancelEdit };
}
