import type { ParseResult } from '../../../../lib/tarifas/costSheetParser';

/** Filas que no se importan y el motivo; no se pinta nada si no hay ninguna. */
export function SkippedRowsList({ skipped }: { skipped: ParseResult['skipped'] }) {
  if (skipped.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-amber-700 uppercase mb-1">No se importan</h4>
      <ul className="space-y-1 max-h-32 overflow-y-auto">
        {skipped.map((s, i) => (
          <li key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
            Fila {s.sourceRow} · <strong>{s.label}</strong> — {s.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
