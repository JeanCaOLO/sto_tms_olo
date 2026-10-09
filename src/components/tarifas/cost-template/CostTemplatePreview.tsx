// Vista previa de la plantilla leída: conteos, errores que impiden guardar, avisos y resumen por camión.

import Badge from '../../base/Badge';
import { TruckSummaryTable } from '../CostStructureParts';
import type { ParsedCostTemplate } from '../../../lib/tarifas/costTemplate';

interface Props {
  parsed: ParsedCostTemplate;
  summary: ParsedCostTemplate['summary'];
  currency?: string;
}

const issue = (i: { sheet: string; row: number | null; message: string }) =>
  `${i.sheet}${i.row ? `, fila ${i.row}` : ''}: ${i.message}`;

export function CostTemplatePreview({ parsed, summary, currency }: Props) {
  const hasErrors = parsed.errors.length > 0;
  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="info" size="sm">{parsed.rows.length} filas de costo</Badge>
        {parsed.operatingDays !== null && <Badge size="sm">{parsed.operatingDays} días operativos</Badge>}
        <Badge variant={hasErrors ? 'danger' : 'success'} size="sm">{parsed.errors.length} errores</Badge>
        <Badge variant={parsed.warnings.length > 0 ? 'warning' : 'default'} size="sm">{parsed.warnings.length} avisos</Badge>
      </div>

      {hasErrors && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">Corregí esto en el archivo y volvé a subirlo:</p>
          <ul className="list-disc pl-5 text-sm text-red-700 space-y-0.5">
            {parsed.errors.map((e, i) => <li key={i}>{issue(e)}</li>)}
          </ul>
        </div>
      )}
      {parsed.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-700 mb-1">Avisos (no impiden guardar):</p>
          <ul className="list-disc pl-5 text-sm text-amber-700 space-y-0.5">
            {parsed.warnings.map((w, i) => <li key={i}>{issue(w)}</li>)}
          </ul>
        </div>
      )}

      {summary.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Resumen por tipo de camión{currency ? ` (${currency})` : ''}
          </h3>
          <TruckSummaryTable summary={summary} exportFileName="vista_previa_estructura_costos" />
        </div>
      )}
    </>
  );
}
