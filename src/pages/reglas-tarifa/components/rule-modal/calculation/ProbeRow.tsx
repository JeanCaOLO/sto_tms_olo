// "Probar": valor de ejemplo, botón y el importe que aportaría la regla.

import Button from '../../../../../components/base/Button';
import Input from '../../../../../components/base/Input';
import { varLabel } from '../../../../../lib/tarifas/format';
import type { NumericVarKey } from '../../../../../lib/tarifas/types';

interface Props {
  operator: string;
  variable: NumericVarKey | undefined;
  customLabels: Record<string, string>;
  probeValue: string;
  probeResult: string | null;
  onProbeValueChange: (val: string) => void;
  onProbeRun: () => void;
}

export function ProbeRow({ operator, variable, customLabels, probeValue, probeResult, onProbeValueChange, onProbeRun }: Props) {
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      {operator !== 'FIXED' && (
        <div className="w-56">
          <Input
            label={`Probar con ${variable ? varLabel(variable, customLabels).toLowerCase() : 'la variable'} =`}
            type="number"
            value={probeValue}
            onChange={(e) => onProbeValueChange(e.target.value)}
          />
        </div>
      )}
      <Button type="button" variant="secondary" onClick={onProbeRun}>
        <i className="ri-flask-line mr-1"></i> Probar
      </Button>
      {probeResult && <span className="text-sm text-slate-700 pb-2">Esta regla aportaría <strong>{probeResult}</strong></span>}
    </div>
  );
}
