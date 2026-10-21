import { format, isSameMonth, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { isoDe, viajesDeFecha } from '../calendario';
import type { RoutePlan } from '../planes-types';

interface Props {
  planes: RoutePlan[];
  ancla: Date; // mes de referencia (para atenuar días de otros meses)
  dias: Date[]; // semanas completas lun..dom
  onAbrirDia: (fechaISO: string) => void;
}

const CABECERAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// Vista mes: rejilla 7×semanas. Cada día muestra su número y, si hay, cuántos
// viajes. Click en un día abre su detalle (todos los viajes de ese día).
export default function VistaMes({ planes, ancla, dias, onAbrirDia }: Props) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {CABECERAS.map((c) => (
          <div key={c} className="px-2 py-2 text-center text-xs font-semibold text-slate-500 capitalize">{c}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const fechaISO = isoDe(d);
          const nViajes = viajesDeFecha(planes, fechaISO).length;
          const delMes = isSameMonth(d, ancla);
          const hoy = isToday(d);
          return (
            <button
              key={fechaISO}
              type="button"
              onClick={() => onAbrirDia(fechaISO)}
              className={`min-h-[84px] border-b border-r border-slate-100 p-1.5 text-left align-top cursor-pointer hover:bg-slate-50 flex flex-col gap-1 ${delMes ? '' : 'bg-slate-50/60'}`}
            >
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                  hoy ? 'bg-teal-600 text-white font-bold' : delMes ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {format(d, 'd')}
              </span>
              {nViajes > 0 && (
                <span className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[11px] font-semibold">
                  <i className="ri-truck-line"></i>
                  {nViajes} {nViajes === 1 ? t('planning.tripWord') : t('planning.tripsWord')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
