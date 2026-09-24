import type { Option } from '../admin/admin-api';

interface Props {
  countries: Option[];
  allCountries: boolean;
  countryIds: Set<string>;
  locked: boolean;
  onAllChange: (all: boolean) => void;
  onToggleCountry: (id: string) => void;
}

// "Países que puede ver": Todos, o una selección. Solo presentación.
export default function CountriesPicker({
  countries, allCountries, countryIds, locked, onAllChange, onToggleCountry,
}: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Países que puede ver</h3>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="radio" checked={allCountries} onChange={() => onAllChange(true)}
            disabled={locked} className="text-teal-600 focus:ring-teal-500" />
          Todos los países
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="radio" checked={!allCountries} onChange={() => onAllChange(false)}
            disabled={locked} className="text-teal-600 focus:ring-teal-500" />
          Solo algunos
        </label>
      </div>
      {!allCountries && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          {countries.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={countryIds.has(c.id)} onChange={() => onToggleCountry(c.id)}
                disabled={locked} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
          {countries.length === 0 && <p className="text-xs text-slate-400">No hay países.</p>}
        </div>
      )}
    </div>
  );
}
