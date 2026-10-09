// Resumen en lenguaje natural de lo que hace la regla, las variables que usa y las que faltan.

import Badge from '../../../../../components/base/Badge';
import { varLabel } from '../../../../../lib/tarifas/format';
import type { VarKey } from '../../../../../lib/tarifas/types';

interface Props {
  autoDescription: string;
  usedVars: string[];
  missingVars: string[];
  customLabels: Record<string, string>;
}

export function CalculationSummary({ autoDescription, usedVars, missingVars, customLabels }: Props) {
  return (
    <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <i className="ri-double-quotes-l text-teal-600 mt-0.5"></i>
        <p className="text-sm text-teal-900 font-medium">{autoDescription}</p>
      </div>
      {usedVars.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-teal-700">Variables usadas:</span>
          {usedVars.map((v) => (
            <Badge key={v} variant="info" size="sm">{varLabel(v as VarKey, customLabels)}</Badge>
          ))}
        </div>
      )}
      {missingVars.length > 0 && (
        <p className="text-xs text-red-600">
          <i className="ri-error-warning-line mr-1"></i>Esta compañía no tiene declaradas: {missingVars.join(', ')}
        </p>
      )}
    </div>
  );
}
