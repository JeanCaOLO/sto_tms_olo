import type { OmsView } from '../useOmsView';

// Toggle cards/tabla compartido por las pantallas OMS. Solo mobile: en desktop
// la vista es siempre tabla, así que el toggle se oculta (sm:hidden).
export default function ViewToggle({ view, onChange }: { view: OmsView; onChange: (v: OmsView) => void }) {
  const btn = (v: OmsView, icon: string, label: string) => (
    <button
      onClick={() => onChange(v)}
      aria-pressed={view === v}
      aria-label={`Vista de ${label}`}
      title={`Vista de ${label}`}
      className={`px-3 py-1.5 text-sm flex items-center gap-1.5 cursor-pointer transition-colors ${
        view === v ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <i className={icon}></i>
      <span>{label}</span>
    </button>
  );
  return (
    <div className="inline-flex sm:hidden shrink-0 rounded-lg border border-slate-200 overflow-hidden">
      {btn('cards', 'ri-layout-grid-line', 'Cards')}
      {btn('table', 'ri-table-line', 'Tabla')}
    </div>
  );
}
