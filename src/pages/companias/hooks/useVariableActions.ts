import { useState } from 'react';
import {
  deactivatePartyVariable, reactivatePartyVariable, savePartyVariable,
  type PartyVariableInput, type VariableErrors,
} from '../../../lib/tarifas/partyVariablesDataSource';
import { ensurePartyProfile } from '../../../lib/tarifas/partiesDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type { PartyVariable } from '../../../lib/tarifas/types';

interface Params {
  party: CarrierProfile | null;
  partyId: string | null;
  setPartyId: (id: string) => void;
  form: PartyVariableInput;
  editingId: string | undefined;
  setEditingId: (id: string | undefined) => void;
  setErrors: (errors: VariableErrors) => void;
  cancelEdit: () => void;
  load: () => Promise<void>;
  setGeneralError: (message: string) => void;
  onProfileCreated?: () => void;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Guardar una variable (resolviendo antes el perfil de la compañía) y darla de baja o reactivarla. */
export function useVariableActions(p: Params) {
  const [saving, setSaving] = useState(false);

  // null = no se pudo crear el perfil (el error ya quedó mostrado).
  const resolvePartyId = async (): Promise<string | null> => {
    if (p.partyId) return p.partyId;
    const profile = await ensurePartyProfile(p.party?.carrierId ?? '');
    if (profile.status === 'failed') { p.setGeneralError(profile.error.message); return null; }
    p.setPartyId(profile.partyId);
    if (profile.created) p.onProfileCreated?.();
    return profile.partyId;
  };

  const handleSave = async () => {
    p.setGeneralError('');
    setSaving(true);
    try {
      const targetId = await resolvePartyId();
      if (targetId === null) return;
      const result = await savePartyVariable({ ...p.form, partyId: targetId }, p.editingId);
      if (result.status === 'invalid') { p.setErrors(result.errors); return; }
      if (result.status === 'failed') { p.setGeneralError(result.error.message); return; }
      p.setEditingId(undefined);
      p.cancelEdit();
      await p.load();
    } catch (e) {
      p.setGeneralError(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (variable: PartyVariable) => {
    try {
      const result = variable.active
        ? await deactivatePartyVariable(variable.id)
        : await reactivatePartyVariable(variable.id);
      if (result.error) { p.setGeneralError(result.error); return; }
      await p.load();
    } catch (e) {
      p.setGeneralError(messageOf(e));
    }
  };

  return { saving, handleSave, toggleActive };
}
