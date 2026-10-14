import { useMemo, useState } from 'react';
import { addDays, addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/base/Modal';
import { usePlanesList } from '../use-planes-list';
import { useZonasNombre } from '../use-zonas-nombre';
import { planesDemo } from '../calendario-demo';
import { diasMes, diasSemana, isoDe, numeroDeViaje, viajesDeCelda, viajesDeFecha, type VistaCalendario } from '../calendario';
import DetalleDia from './DetalleDia';
import VistaMes from './VistaMes';
import VistaSemanaMatriz from './VistaSemanaMatriz';

const VISTAS: { id: VistaCalendario; key: string }[] = [
  { id: 'dia', key: 'planning.viewDay' },
  { id: 'semana', key: 'planning.viewWeek' },
  { id: 'mes', key: 'planning.viewMonth' },
];

function fmtFecha(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "EEEE d 'de' MMMM, yyyy", { locale: es });
}

// Calendario de planificación: matriz zonas×días (semana), rejilla de mes y
// lista de día. Lee los planes del contexto operativo (usePlanesList); si no hay
// backend/planes, cae a datos demo para ver la UI. Abrir una celda/día reusa
// PlanTripCard (mapa + paradas + pedidos + artículos) dentro de un modal.
export default function CalendarioPlanificacion() {
  const { t } = useTranslation();
  const { planes: reales, cargando, recargar } = usePlanesList();
  const { nombreDe } = useZonasNombre();
  const [vista, setVista] = useState<VistaCalendario>('semana');
  const [ancla, setAncla] = useState<Date>(() => new Date());
  const [detalle, setDetalle] = useState<{ fechaISO: string; zonaCodigo: string | null } | null>(null);

  const demo = useMemo(() => planesDemo(), []);
  const usandoDemo = !cargando && reales.length === 0;
  const planes = reales.length > 0 ? reales : demo;

  const dias = useMemo(() => (vista === 'mes' ? diasMes(ancla) : diasSemana(ancla)), [vista, ancla]);
  const fechasISO = useMemo(() => dias.map(isoDe), [dias]);
  const numeros = useMemo(() => numeroDeViaje(planes, fechasISO), [planes, fechasISO]);

  function navegar(dir: -1 | 1) {
    setAncla((a) => (vista === 'mes' ? addMonths(a, dir) : addDays(a, vista === 'dia' ? dir : dir * 7)));
  }

  const etiquetaPeriodo =
    vista === 'mes'
      ? format(ancla, 'MMMM yyyy', { locale: es })
      : vista === 'dia'
        ? fmtFecha(isoDe(ancla))
        : `${format(dias[0], 'd MMM', { locale: es })} – ${format(dias[dias.length - 1], 'd MMM yyyy', { locale: es })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Switcher de vista */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden self-start">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVista(v.id)}
              className={`px-3 py-1.5 text-sm font-medium cursor-pointer ${
                vista === v.id ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(v.key)}
            </button>
          ))}
        </div>

        {/* Navegación de período */}
        <div className="flex items-center gap-2">
          <button onClick={() => navegar(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer" aria-label="Anterior">
            <i className="ri-arrow-left-s-line text-lg"></i>
          </button>
          <button onClick={() => setAncla(new Date())} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
            {t('planning.today')}
          </button>
          <button onClick={() => navegar(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer" aria-label="Siguiente">
            <i className="ri-arrow-right-s-line text-lg"></i>
          </button>
          <span className="text-sm font-semibold text-slate-700 capitalize ml-1 min-w-[9rem]">{etiquetaPeriodo}</span>
        </div>
      </div>

      {usandoDemo && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <i className="ri-information-line"></i>
          {t('planning.demoBanner')}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center h-48 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
        </div>
      ) : vista === 'semana' ? (
        <VistaSemanaMatriz planes={planes} dias={dias} numeros={numeros} onAbrirCelda={(fechaISO, zonaCodigo) => setDetalle({ fechaISO, zonaCodigo })} />
      ) : vista === 'mes' ? (
        <VistaMes planes={planes} ancla={ancla} dias={dias} onAbrirDia={(fechaISO) => setDetalle({ fechaISO, zonaCodigo: null })} />
      ) : (
        <DetalleDia planes={planes} fechaISO={isoDe(ancla)} onRecargar={recargar} />
      )}

      {detalle && (() => {
        const viajes = detalle.zonaCodigo
          ? viajesDeCelda(planes, detalle.fechaISO, detalle.zonaCodigo)
          : viajesDeFecha(planes, detalle.fechaISO);
        // El ancho del modal se ajusta a cuántos viajes hay: uno queda centrado y
        // cómodo; varios tienen aire para ponerse lado a lado sin adelgazarse.
        const ancho = viajes.length <= 1 ? 'max-w-xl' : viajes.length === 2 ? 'max-w-3xl' : 'max-w-5xl';
        const titulo = `${fmtFecha(detalle.fechaISO)}${detalle.zonaCodigo ? ` · ${nombreDe(detalle.zonaCodigo)}` : ''}`;
        return (
          <Modal isOpen onClose={() => setDetalle(null)} title={titulo} widthClass={ancho} zClass="z-[1000]">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 capitalize">{titulo}</h2>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label={t('planning.close')}
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="p-5">
              <DetalleDia planes={planes} fechaISO={detalle.fechaISO} zonaCodigo={detalle.zonaCodigo} onRecargar={recargar} />
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
