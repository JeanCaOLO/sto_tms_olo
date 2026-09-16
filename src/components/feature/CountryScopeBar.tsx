// Barra de ámbito del tarifador: qué país se está administrando.
//
// Es el diferenciador global del módulo. Todo lo que se ve debajo —zonas, tarifas, reglas,
// compañías, costos, tasas de cambio— pertenece a este país. Antes cada pestaña preguntaba por su
// cuenta y podían quedar en países distintos a la vez.

import Badge from '../base/Badge';
import type { TarifasCountry } from '../../hooks/useActiveCountry';

interface Props {
  countries: TarifasCountry[];
  country: TarifasCountry | null;
  onChange: (countryId: string) => void;
  loading?: boolean;
}

export default function CountryScopeBar({ countries, country, onChange, loading }: Props) {
  if (loading) {
    return (
      <div className="h-[46px] bg-slate-50 border border-slate-200 rounded-lg animate-pulse" />
    );
  }

  if (countries.length === 0) {
    return (
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
        <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
        <span>
          El tarifador no tiene ningún país configurado. Sin un país no hay moneda, ni redondeo, ni
          zonas: cargá al menos uno antes de usar el módulo.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
      <i className="ri-global-line text-teal-600"></i>
      <label htmlFor="tarifas-country" className="text-sm font-medium text-slate-700">
        Operando en
      </label>

      <select
        id="tarifas-country"
        value={country?.id ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
      >
        {countries.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {country && (
        <>
          <Badge variant="info" size="sm">{country.local_currency}</Badge>
        </>
      )}

      <span className="ml-auto text-xs text-slate-500">
        Todo el módulo queda acotado a este país.
      </span>
    </div>
  );
}
