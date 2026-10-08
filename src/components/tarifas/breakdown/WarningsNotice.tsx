/** Avisos del motor (variables que no existen en el viaje, etc.). */
export function WarningsNotice({ warnings }: { warnings: string[] }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <p className="text-xs font-medium text-amber-800 mb-1">
        <i className="ri-alert-line mr-1"></i>
        Avisos ({warnings.length})
      </p>
      <ul className="text-xs text-amber-700 space-y-0.5">
        {warnings.map((w) => <li key={w}>• {w}</li>)}
      </ul>
    </div>
  );
}
