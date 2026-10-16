import Badge from '../../../../components/base/Badge';
import Select from '../../../../components/base/Select';
import type { SheetAnalysis, SheetMatrix } from '../../../../lib/tarifas/costSheetParser';
import type { ImportWizardState } from '../../hooks/useImportWizardState';
import { assignField, FIELD_OPTIONS } from './importWizardOptions';

const EXAMPLE_ROWS = 3;
const EXAMPLE_MAX_CHARS = 45;

const KIND_LABEL = (kind: string) => (kind === 'number' ? 'números' : kind === 'text' ? 'texto' : kind === 'mixed' ? 'mixto' : 'vacía');

interface Props {
  state: ImportWizardState;
  analysis: SheetAnalysis;
  matrix: SheetMatrix;
}

/** Tabla de columnas de la planilla con el destino que se le da a cada una. */
export function MapColumnsTable({ state, analysis, matrix }: Props) {
  const headerCells = matrix[state.headerRow] ?? [];
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
            <th className="px-3 py-2">Columna en la planilla</th>
            <th className="px-3 py-2">Contenido</th>
            <th className="px-3 py-2">Ejemplos</th>
            <th className="px-3 py-2">Importar como</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {analysis.columns.map((col) => (
            <tr key={col.index}>
              <td className="px-3 py-2 font-medium text-slate-700">
                {String(headerCells[col.index] ?? `Columna ${col.index + 1}`)}
              </td>
              <td className="px-3 py-2">
                <Badge variant={col.kind === 'number' ? 'info' : 'default'} size="sm">
                  {KIND_LABEL(col.kind)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {matrix.slice(state.headerRow + 1, state.headerRow + 1 + EXAMPLE_ROWS)
                  .map((r) => r[col.index]).filter((v) => v !== null && v !== '')
                  .join(' · ').slice(0, EXAMPLE_MAX_CHARS) || '—'}
              </td>
              <td className="px-3 py-2">
                <Select
                  value={state.fields[col.index] ?? 'ignore'}
                  onChange={(e) => state.setFields((prev) => assignField(prev, col.index, e.target.value as (typeof FIELD_OPTIONS)[number]['value']))}
                  options={FIELD_OPTIONS}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
