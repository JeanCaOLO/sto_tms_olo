// Selección de modo (merge/replace) y vista previa de importación.

import ImportModePicker from './ImportModePicker';
import Badge from '../../../../components/base/Badge';
import type { parseRateTableSheet } from '../../../../lib/tarifas/rateTableImport';
import { VAR_KEY_LABELS } from '../../../../lib/tarifas/format';
import { RATE_TABLE_WILDCARD, type RateTable } from '../../../../lib/tarifas/types';

interface Props {
  mode: 'replace' | 'merge';
  confirmReplace: boolean;
  acknowledgeIssues: boolean;
  hasIssues: boolean;
  parsed: ReturnType<typeof parseRateTableSheet>;
  duplicadas: string[][];
  table: RateTable;
  customLabels?: Record<string, string>;
  onSetMode: (mode: 'replace' | 'merge') => void;
  onSetConfirmReplace: (val: boolean) => void;
  onSetAcknowledgeIssues: (val: boolean) => void;
}

export default function ImportRateTableModeAndPreview({
  mode,
  confirmReplace,
  acknowledgeIssues,
  hasIssues,
  parsed,
  duplicadas,
  table,
  customLabels = {},
  onSetMode,
  onSetConfirmReplace,
  onSetAcknowledgeIssues,
}: Props) {
  return (
    <>
      <ImportModePicker
        mode={mode} confirmReplace={confirmReplace} onSetMode={onSetMode} onSetConfirmReplace={onSetConfirmReplace}
      />

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Vista previa</h3>
          <Badge variant={parsed.rows.length > 0 ? 'success' : 'default'}>
            {parsed.rows.length} fila{parsed.rows.length === 1 ? '' : 's'}
          </Badge>
          {parsed.skipped.length > 0 && (
            <Badge variant="warning">{parsed.skipped.length} con problemas</Badge>
          )}
          {duplicadas.length > 0 && (
            <Badge variant="danger">
              {duplicadas.length} clave{duplicadas.length === 1 ? '' : 's'} repetida{duplicadas.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>

        {hasIssues && (
          <label className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledgeIssues}
              onChange={(e) => onSetAcknowledgeIssues(e.target.checked)}
              className="mt-1 text-teal-600 focus:ring-teal-500"
            />
            <span>
              <strong>Entendido:</strong> el archivo tiene filas con problemas o claves repetidas. Deseo continuar.
            </span>
          </label>
        )}

        {duplicadas.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3 mb-3">
            <i className="ri-alert-line mr-1"></i>
            El archivo repite estas combinaciones:{' '}
            {duplicadas.slice(0, 5).map((k) => k.join(' | ')).join(' · ')}
            {duplicadas.length > 5 && ` y ${duplicadas.length - 5} más`}. Va a quedar la
            <strong> última</strong> de cada una: dos filas con la misma clave son igual
            de específicas y el motor elegiría una por orden.
          </div>
        )}

        {parsed.rows.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-slate-500 uppercase">
                  {table.keyColumns.map((c) => (
                    <th key={c} className="py-2 px-3 font-medium">
                      {VAR_KEY_LABELS[c as keyof typeof VAR_KEY_LABELS] ?? customLabels[c] ?? c}
                    </th>
                  ))}
                  <th className="py-2 px-3 font-medium text-right">Importe</th>
                  {(table.valueColumns ?? []).map((name) => (
                    <th key={name} className="py-2 px-3 font-medium text-right">{name}</th>
                  ))}
                  <th className="py-2 px-3 font-medium">En el archivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.rows.slice(0, 50).map((row) => (
                  <tr key={row.sourceRow}>
                    {row.key.map((value, i) => (
                      <td key={table.keyColumns[i] ?? i} className="py-1.5 px-3 font-mono">
                        {value === RATE_TABLE_WILDCARD
                          ? <span className="text-slate-400">*</span>
                          : value}
                      </td>
                    ))}
                    <td className="py-1.5 px-3 text-right font-medium text-slate-800">{row.amount}</td>
                    {(table.valueColumns ?? []).map((name) => (
                      <td key={name} className="py-1.5 px-3 text-right text-slate-700">
                        {row.values?.[name] ?? '—'}
                      </td>
                    ))}
                    <td className="py-1.5 px-3 text-slate-400">{row.rawAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 50 && (
              <p className="text-xs text-slate-500 px-3 py-2">y {parsed.rows.length - 50} más…</p>
            )}
          </div>
        )}

        {parsed.skipped.length > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-amber-800 mb-1">Filas que no se van a importar</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              {parsed.skipped.slice(0, 8).map((s) => (
                <li key={s.sourceRow}>Fila {s.sourceRow + 1} ({s.key.join(' | ')}): {s.reason}</li>
              ))}
              {parsed.skipped.length > 8 && <li>y {parsed.skipped.length - 8} más…</li>}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
