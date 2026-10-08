// Alta y edición de una regla de tarifa: identificación, condición, cálculo, vigencia y apilado.

import { useEffect } from 'react';
import Modal from '../../../components/base/Modal';
import Button from '../../../components/base/Button';
import { varLabel } from '../../../lib/tarifas/format';
import type { VarKey } from '../../../lib/tarifas/types';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { useRuleForm } from './rule-modal/useRuleForm';
import { useRuleConditions } from './rule-modal/useRuleConditions';
import { useRuleBuilder } from './rule-modal/useRuleBuilder';
import { useRuleDescription } from './rule-modal/useRuleDescription';
import { useRuleCatalogs } from './rule-modal/useRuleCatalogs';
import { useRuleAnalysis } from './rule-modal/useRuleAnalysis';
import { useRuleProbe } from './rule-modal/useRuleProbe';
import { useRuleSubmit } from './rule-modal/useRuleSubmit';
import { RuleFormSections } from './rule-modal/RuleFormSections';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  rule?: Record<string, unknown>;
  organizationId: string;
  country: { id: string; name: string; local_currency?: string } | null;
  usuarioActivo: string;
}

const TAB_LABELS = { simple: 'Simple', advanced: 'Avanzado (JSON)' } as const;

export default function RuleModal({
  isOpen, onClose, onSuccess, rule, organizationId, country, usuarioActivo,
}: RuleModalProps) {
  const { canCreate, canEdit } = useModulePermissions('tarifas.config');
  const form = useRuleForm(rule, country?.id);
  const { formData } = form;
  const conditions = useRuleConditions(rule);
  const calc = useRuleBuilder(rule);

  const catalogs = useRuleCatalogs(isOpen, country?.id, formData.scope, formData.party_id);
  const currencyLabel = country?.local_currency ?? 'moneda local';
  const probe = useRuleProbe(calc.builder, currencyLabel);
  const analysis = useRuleAnalysis(
    conditions, calc.builder, formData.scope, catalogs.partyVariables, catalogs.customLabels,
  );
  const description = useRuleDescription(rule, calc.builder, {
    varLabel: (k: string) => varLabel(k as VarKey, catalogs.customLabels),
    currency: currencyLabel,
    conditionText: analysis.conditionText ?? '',
  });

  const allowed = rule ? canEdit : canCreate;
  // Con permiso solo de lectura la regla se puede abrir y leer, no cambiar.
  const readOnly = !!rule && !canEdit;
  const submit = useRuleSubmit({
    rule, organizationId, usuarioActivo, allowed,
    form, conditions, calc, selectedCarrierId: catalogs.selectedCarrierId,
    missingVars: analysis.missingVars, effectiveDescription: description.effectiveDescription, onSuccess, onClose,
  });

  useEffect(() => {
    if (!isOpen) return;
    submit.setErrorMsg('');
    probe.setProbeResult(null);
    calc.setBuilderErrors({});
    // Solo al abrir: los setters cambian de identidad pero no deben reiniciar el modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const sections = (
    <RuleFormSections
      m={{ rule, form, conditions, calc, catalogs, probe, description, analysis, currencyLabel }}
    />
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={readOnly ? 'Ver regla' : rule ? 'Editar regla' : 'Nueva regla'} widthClass="max-w-3xl">
      <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200 z-10">
        <div></div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['simple', 'advanced'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => calc.setTab(t)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${calc.tab === t ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={submit.handleSubmit} className="p-6 space-y-6">
        {submit.errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
            <span>{submit.errorMsg}</span>
          </div>
        )}
        {readOnly ? (
          <fieldset disabled className="space-y-6 min-w-0 border-0 p-0 m-0">{sections}</fieldset>
        ) : sections}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 px-6 pb-6">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submit.loading}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={submit.loading || !allowed}>
              {submit.loading ? 'Guardando…' : rule ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
