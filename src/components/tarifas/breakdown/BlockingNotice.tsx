import type { Explanation } from '../../../lib/tarifas/explain';

/** Motivos por los que el total no es confiable. No se pinta nada si no hay ninguno. */
export function BlockingNotice({ blocking }: { blocking: Explanation['blocking'] }) {
  if (blocking.length === 0) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <p className="text-sm font-medium text-red-800 mb-1">
        <i className="ri-error-warning-line mr-1"></i>
        El total no es confiable
      </p>
      <ul className="text-xs text-red-700 space-y-0.5">
        {blocking.map((b) => <li key={b.code + b.message}>• {b.message}</li>)}
      </ul>
    </div>
  );
}
