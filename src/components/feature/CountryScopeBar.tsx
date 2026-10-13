// Barra de ámbito del tarifador: muestra EN QUÉ país se está trabajando.
//
// El país no se elige acá: es el selector global del TMS (barra superior). Esta barra solo lo
// refleja y avisa cuando no hay un país con el que el tarifador pueda trabajar.

import Badge from '../base/Badge';
import type { ActiveCountryState } from '../../hooks/useActiveCountry';

type Props = Pick<ActiveCountryState, 'country' | 'problem' | 'selectedName' | 'loading'>;

const MESSAGES: Record<NonNullable<ActiveCountryState['problem']>, (name: string | null) => string> = {
  'load-failed': () =>
    'No se pudo cargar la lista de países del tarifador. Revise que el backend de tarifas esté corriendo y vuelva a intentar (no es que el país no exista).',
  'none-selected': () =>
    'Elija un país en el selector de la parte superior. El tarifador liquida en la moneda y con el redondeo de cada país, por eso no mezcla países.',
  'not-available': (name) =>
    `${name ?? 'El país elegido'} no está disponible en el tarifador (o su rol no lo puede ver). Elija otro país en el selector de la parte superior.`,
  'not-configured': (name) =>
    `${name ?? 'El país'} no tiene configuración de cálculo (redondeo y pernocta). Un administrador debe cargarla en Reglas de Tarifa → Política de Margen.`,
};

export default function CountryScopeBar({ country, problem, selectedName, loading }: Props) {
  if (loading) {
    return <div className="h-[46px] bg-slate-50 border border-slate-200 rounded-lg animate-pulse" />;
  }

  if (problem) {
    return (
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
        <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
        <span>{MESSAGES[problem](selectedName)}</span>
      </div>
    );
  }

  if (!country) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
      <i className="ri-global-line text-teal-600"></i>
      <span className="text-sm font-medium text-slate-700">Operando en</span>
      <span className="text-sm font-semibold text-slate-900">{country.name}</span>
      <Badge variant="info" size="sm">{country.local_currency}</Badge>
      <span className="ml-auto text-xs text-slate-500">
        País del selector superior. Todo el módulo queda acotado a él.
      </span>
    </div>
  );
}
