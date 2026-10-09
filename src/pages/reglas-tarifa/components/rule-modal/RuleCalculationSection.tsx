// Sección: cálculo de la regla (operador, variable, tramos, tarifario, porcentaje, piso/tope y prueba).

import { OPERATOR_HINTS } from '../../../../lib/tarifas/rule-builder';
import type { BuilderErrors } from '../../../../lib/tarifas/rule-builder';
import type { RuleBuilderForm } from '../../../../lib/tarifas/types';
import { OperatorFields } from './calculation/OperatorFields';
import { RateTableFields } from './calculation/RateTableFields';
import { TieredFields } from './calculation/TieredFields';
import { PercentFields } from './calculation/PercentFields';
import { ClampFields } from './calculation/ClampFields';
import { CalculationSummary } from './calculation/CalculationSummary';
import { ProbeRow } from './calculation/ProbeRow';
import type { BuilderFieldChange, RateTableOption } from './calculation/types';

interface RuleCalculationSectionProps {
  builder: RuleBuilderForm;
  builderErrors: BuilderErrors;
  numericVarOptions: { value: string; label: string }[];
  currencyLabel: string;
  autoDescription: string;
  usedVars: string[];
  missingVars: string[];
  customLabels: Record<string, string>;
  rateTables: RateTableOption[];
  probeValue: string;
  probeResult: string | null;
  onBuilderFieldChange: BuilderFieldChange;
  onProbeValueChange: (val: string) => void;
  onProbeRun: () => void;
}

export default function RuleCalculationSection(props: RuleCalculationSectionProps) {
  const { builder, builderErrors, currencyLabel, customLabels, onBuilderFieldChange: onChange } = props;
  const fields = { builder, builderErrors, onChange };

  return (
    <section className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">¿Cuánto suma o resta?</h3>
      <OperatorFields {...fields} numericVarOptions={props.numericVarOptions} currencyLabel={currencyLabel} />
      <p className="text-xs text-gray-500 mt-2">{OPERATOR_HINTS[builder.operator]}</p>
      {builder.operator === 'RATE_TABLE' && <RateTableFields {...fields} rateTables={props.rateTables} />}
      {builder.operator === 'TIERED' && <TieredFields {...fields} currencyLabel={currencyLabel} />}
      {builder.operator === 'PERCENT' && <PercentFields {...fields} />}
      <ClampFields {...fields} currencyLabel={currencyLabel} />
      <CalculationSummary
        autoDescription={props.autoDescription}
        usedVars={props.usedVars}
        missingVars={props.missingVars}
        customLabels={customLabels}
      />
      <ProbeRow
        operator={builder.operator}
        variable={builder.variable}
        customLabels={customLabels}
        probeValue={props.probeValue}
        probeResult={props.probeResult}
        onProbeValueChange={props.onProbeValueChange}
        onProbeRun={props.onProbeRun}
      />
    </section>
  );
}
