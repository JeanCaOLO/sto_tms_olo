// Secciones del formulario de reglas: cada una recibe solo lo suyo del modelo armado por `RuleModal`.

import type { RuleModalModel } from './ruleModalModel';
import RuleIdentificationSection from './RuleIdentificationSection';
import RuleConditionSection from './RuleConditionSection';
import RuleCalculationSection from './RuleCalculationSection';
import RuleStackingSection from './RuleStackingSection';
import RuleEffectivenessSection from './RuleEffectivenessSection';
import RuleDescriptionSection from './RuleDescriptionSection';
import RuleAdvancedSection from './RuleAdvancedSection';

export function RuleFormSections({ m }: { m: RuleModalModel }) {
  const { rule, form, conditions, calc, catalogs, probe, description, analysis, currencyLabel } = m;
  const { formData, updateFormField } = form;
  const { customLabels, selectedCarrierId } = catalogs;

  const changeBuilderField: typeof calc.updateBuilderField = (key, value) => {
    calc.updateBuilderField(key, value);
    probe.setProbeResult(null);
  };

  return (
    <>
      <RuleIdentificationSection
        rule={rule}
        code={formData.code}
        name={formData.name}
        scope={formData.scope}
        partyId={formData.party_id}
        selectedCarrierId={selectedCarrierId}
        carriers={catalogs.parties}
        countryId={formData.country_id}
        onCodeChange={(code) => updateFormField('code', code)}
        onNameChange={(name) => updateFormField('name', name)}
        onScopeChange={(scope) => {
          catalogs.setCarrierPick(null);
          updateFormField('scope', scope);
          updateFormField('party_id', '');
        }}
        onCarrierChange={catalogs.setCarrierPick}
        onPartyIdChange={(pid) => updateFormField('party_id', pid)}
      />
      <RuleConditionSection
        conditionMode={conditions.conditionMode}
        conditionCombinator={conditions.conditionCombinator}
        conditionRows={conditions.conditionRows}
        conditionRowErrors={conditions.conditionRowErrors}
        advancedConditionsJson={conditions.advancedConditionsJson}
        allVarOptions={catalogs.allVarOptions}
        onModeChange={conditions.setConditionMode}
        onCombinatorChange={conditions.setConditionCombinator}
        onRowChange={conditions.setConditionRow}
        onRowAdd={conditions.addConditionRow}
        onRowRemove={conditions.removeConditionRow}
        onErrorsChange={conditions.setConditionRowErrors}
        onAdvancedJsonChange={conditions.setAdvancedConditionsJson}
      />
      {calc.tab === 'simple' && (
        <RuleCalculationSection
          builder={calc.builder}
          builderErrors={calc.builderErrors}
          numericVarOptions={catalogs.numericVarOptions}
          currencyLabel={currencyLabel}
          autoDescription={description.autoDescription}
          usedVars={analysis.usedVars}
          missingVars={analysis.missingVars}
          customLabels={customLabels}
          rateTables={catalogs.rateTables.map((t) => ({
            code: t.code, name: t.name, keyColumns: t.keyColumns, valueColumns: t.valueColumns ?? [],
          }))}
          probeValue={probe.probeValue}
          probeResult={probe.probeResult}
          onBuilderFieldChange={changeBuilderField}
          onProbeValueChange={probe.setProbeValue}
          onProbeRun={probe.runProbe}
        />
      )}
      {calc.tab === 'advanced' && (
        <RuleAdvancedSection
          advancedExpressionJson={calc.advancedExpressionJson}
          onExpressionJsonChange={calc.setAdvancedExpressionJson}
        />
      )}
      <RuleDescriptionSection
        description={description.description}
        descriptionTouched={description.descriptionTouched}
        effectiveDescription={description.effectiveDescription}
        reason={formData.reason}
        onDescriptionChange={description.setDescription}
        onDescriptionTouchChange={description.setDescriptionTouched}
        onReasonChange={(reason) => updateFormField('reason', reason)}
      />
      <RuleEffectivenessSection
        effectiveFrom={formData.effective_from}
        effectiveTo={formData.effective_to}
        periodoInvertido={form.periodoInvertido}
        onEffectiveFromChange={(date) => updateFormField('effective_from', date)}
        onEffectiveToChange={(date) => updateFormField('effective_to', date)}
      />
      <RuleStackingSection
        stage={formData.stage}
        stacking={formData.stacking}
        exclusionGroup={formData.exclusion_group}
        priority={formData.priority}
        active={formData.active}
        onStageChange={(stage) => updateFormField('stage', stage)}
        onStackingChange={(stacking) => updateFormField('stacking', stacking)}
        onExclusionGroupChange={(group) => updateFormField('exclusion_group', group)}
        onPriorityChange={(priority) => updateFormField('priority', priority)}
        onActiveChange={(active) => updateFormField('active', active)}
      />
    </>
  );
}
