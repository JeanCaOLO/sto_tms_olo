import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useZonasNombre } from '../use-zonas-nombre';
import { isoDe, viajesDeCelda, zonasPresentes } from '../calendario';
import type { RoutePlan } from '../planes-types';

interface Props {
  planes: RoutePlan[];
  dias: Date[]; // columnas (lun..sáb)
  numeros: Map<string, number>; // tripId → número global V{n}
  onAbrirCelda: (fechaISO: string, zonaCodigo: string) => void;
}

// Matriz ZONAS (filas) × DÍAS (columnas). Cada celda lista los viajes de esa
// fecha+zona como chips "V{n}". Click en la celda abre su detalle.
export default function VistaSemanaMatriz({ planes, dias, numeros, onAbrirCelda }: Props) {
  const { t } = useTranslation();
  const { nombreDe } = useZonasNombre();
  const fechasISO = dias.map(isoDe);
  const zonas = zonasPresentes(planes, fechasISO);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-500 w-40">
              {t('planning.zone')}
            </th>
            {dias.map((d) => {
              const hoy = isToday(d);
              return (
                <th
                  key={isoDe(d)}
                  className={`border-b border-slate-200 px-2 py-2 text-center text-xs font-semibold ${hoy ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-500'}`}
                >
                  <div className="capitalize">{format(d, 'EEE', { locale: es })}</div>
                  <div className={`text-[11px] font-normal ${hoy ? 'text-teal-600' : 'text-slate-400'}`}>
                    {format(d, 'd MMM', { locale: es })}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {zonas.length === 0 && (
            <tr>
              <td colSpan={dias.length + 1} className="px-3 py-10 text-center text-sm text-slate-400">
                {t('planning.noTrips')}
              </td>
            </tr>
          )}
          {zonas.map((zona) => (
            <tr key={zona}>
              <th className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-700 align-top">
                {nombreDe(zona)}
                {nombreDe(zona) !== zona && <span className="block text-[10px] font-mono text-slate-400">{zona}</span>}
              </th>
              {dias.map((d) => {
                const fechaISO = isoDe(d);
                const viajes = viajesDeCelda(planes, fechaISO, zona);
                return (
                  <td
                    key={fechaISO}
                    className={`border-b border-slate-100 px-2 py-2 align-top ${isToday(d) ? 'bg-teal-50/40' : ''}`}
                  >
                    <div className="flex flex-wrap gap-1 justify-center">
                      {viajes.map((trip) => (
                        <button
                          key={trip.id}
                          type="button"
                          onClick={() => onAbrirCelda(fechaISO, zona)}
                          title={`${trip.vehicle_plate} · ${trip.stops.length} ${t('planning.stopsWord')}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          <i className="ri-truck-line text-[11px]"></i>V{numeros.get(trip.id)}
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
