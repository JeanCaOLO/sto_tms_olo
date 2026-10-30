// Filtro de fechas: Hoy / Semana / Mes / Rango propio / Todo. El rango lo calcula `lib/tarifas/proformas/dateRange`.

import { rangeFor, type DateRange, type RangePreset } from '../../lib/tarifas/proformas/dateRange';

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'custom', label: 'Rango' },
  { id: 'all', label: 'Todo' },
];

const segment = (active: boolean) =>
  `px-3 py-1.5 text-sm font-medium cursor-pointer ${active ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`;
const dateInput = 'rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

export default function DateRangeFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Periodo">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={value.preset === p.id}
            className={segment(value.preset === p.id)}
            // Al pasar a "Rango" se conserva lo que ya se veía, para que el usuario lo ajuste.
            onClick={() => onChange(p.id === 'custom' ? { ...value, preset: 'custom' } : rangeFor(p.id))}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <label className="flex items-center gap-1">
            Desde
            <input type="date" className={dateInput} value={value.from} max={value.to || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </label>
          <label className="flex items-center gap-1">
            Hasta
            <input type="date" className={dateInput} value={value.to} min={value.from || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}
