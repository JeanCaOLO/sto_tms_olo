import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { emptyVariableForm, useVariablesForm } from '../hooks/useVariablesForm';
import { useVariablesList } from '../hooks/useVariablesList';
import { useVariableActions } from '../hooks/useVariableActions';
import { VariablesModalHeader } from './variables/VariablesModalHeader';
import { VariableForm } from './variables/VariableForm';
import { VariablesTable } from './variables/VariablesTable';

interface Props {
  isOpen: boolean;
  party: CarrierProfile | null;
  onClose: () => void;
  onProfileCreated?: () => void;
}

export default function VariablesModal({ isOpen, party, onClose, onProfileCreated }: Props) {
  const { canCreate, canEdit } = useModulePermissions('tarifas.config');
  const [generalError, setGeneralError] = useState('');
  const [partyId, setPartyId] = useState<string | null>(null);

  const { form, setForm, set, editingId, setEditingId, errors, setErrors, startEdit, cancelEdit } = useVariablesForm(party?.partyId ?? '');

  // Al abrir (o cambiar de compañía) se reinicia el formulario; debe declararse ANTES de la carga de la lista.
  useEffect(() => {
    if (!isOpen || !party) return;
    setForm(emptyVariableForm(party.partyId ?? ''));
    setPartyId(party.partyId);
    setEditingId(undefined);
    setErrors({});
    setGeneralError('');
  }, [isOpen, party, setForm, setEditingId, setErrors]);

  const { variables, loading, load } = useVariablesList(isOpen, party, partyId, setGeneralError);
  const { saving, handleSave, toggleActive } = useVariableActions({
    party, partyId, setPartyId, form, editingId, setEditingId, setErrors, cancelEdit, load, setGeneralError, onProfileCreated,
  });

  if (!isOpen || !party) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <VariablesModalHeader partyName={party.name} onClose={onClose} />

        <div className="px-6 py-5 space-y-5">
          {generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {generalError}
            </div>
          )}

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-4 py-3">
            <i className="ri-information-line mt-0.5 shrink-0"></i>
            <span>
              La <strong>clave</strong> es el identificador que usan las reglas y no debería cambiar
              nunca; el <strong>nombre</strong> es lo que se ve en pantalla y se puede reescribir
              cuando quieras. Las variables se dan de baja, no se borran: si una regla todavía la usa,
              el editor de reglas la marca en rojo en vez de dejar un cálculo roto en silencio.
            </span>
          </div>

          <VariableForm
            form={form} set={set} errors={errors} editingId={editingId} saving={saving}
            canCreate={canCreate} canEdit={canEdit} onSave={() => void handleSave()} onCancel={cancelEdit}
          />

          <VariablesTable
            variables={variables} loading={loading} canEdit={canEdit}
            onEdit={startEdit} onToggle={(v) => void toggleActive(v)}
          />
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
