import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useZonasNombre } from '../use-zonas-nombre';
import { isoDe, viajesDeCelda, zonasPresentes } from '../calendario';
import type { RoutePlan } from '../planes-types';

interface Props {
  planes: RoutePlan[];
  dias: Date[]; // rango visible (día/semana/mes)
  onAbrirCelda: (fechaISO: string, zonaCodigo: string) => void;
}

// Vista TABLA: por cada día del rango con viajes, un bloque "Jueves 15 de octubre"
// y, debajo, una fila por zona ("Zona X · N viajes") que abre el detalle de esa
// celda en el modal. Es la vista tipo reporte que el cliente pidió además de la
// cuadrícula (reunión 2026-10-14, formato torre de control/WMH).
export default function VistaTabla({ planes, dias, onAbrirCelda }: Props) {
  const { t } = useTranslation();
  const { nombreDe } = useZonasNombre();
  const conViajes = dias.filter((d) => zonasPresentes(planes, [isoDe(d)]).length > 0);

  if (conViajes.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
        <i className="ri-calendar-close-line text-3xl"></i>
        <p className="text-sm">{t('planning.noTrips')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {conViajes.map((d) => {
        const fechaISO = isoDe(d);
        const zonas = zonasPresentes(planes, [fechaISO]);
        return (
          <div key={fechaISO} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700 capitalize">
              {format(d, "EEEE d 'de' MMMM", { locale: es })}
            </div>
            <ul className="divide-y divide-slate-100">
              {zonas.map((zona) => {
                const n = viajesDeCelda(planes, fechaISO, zona).length;
                return (
                  <li key={zona}>
                    <button
                      type="button"
                      onClick={() => onAbrirCelda(fechaISO, zona)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-teal-50/60 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <i className="ri-map-pin-line text-teal-600"></i>
                        {nombreDe(zona)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-600 text-white text-xs font-semibold">
                          <i className="ri-truck-line text-[11px]"></i>
                          {n} {n === 1 ? t('planning.tripWord') : t('planning.tripsWord')}
                        </span>
                        <i className="ri-arrow-right-s-line text-slate-400"></i>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
