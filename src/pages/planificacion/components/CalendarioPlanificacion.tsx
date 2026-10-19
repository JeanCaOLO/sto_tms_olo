import { useMemo, useState } from 'react';
import { addDays, addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { usePlanesList } from '../use-planes-list';
import {
  diasMes, diasSemana, filtrarPorZonas, isoDe, numeroDeViaje, zonasPresentes,
  type VistaCalendario,
} from '../calendario';
import ControlesVista, { type Modo } from './ControlesVista';
import DetalleDia from './DetalleDia';
import DetalleModal from './DetalleModal';
import FiltroZonas from './FiltroZonas';
import VistaMes from './VistaMes';
import VistaSemanaMatriz from './VistaSemanaMatriz';
import VistaTabla from './VistaTabla';

function fmtDia(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "EEEE d 'de' MMMM, yyyy", { locale: es });
}

// Calendario de planificación: rango día/semana/mes × modo cuadrícula/tabla, con
// filtro por zona. Toma los planes REALES persistidos en Aurora (usePlanesList).
// Abrir una celda/día reusa PlanTripCard (mapa + paradas + pedidos + artículos)
// en un modal.
export default function CalendarioPlanificacion() {
  const { t } = useTranslation();
  const { planes: base, cargando, recargar } = usePlanesList();
  const [vista, setVista] = useState<VistaCalendario>('semana');
  const [modo, setModo] = useState<Modo>('cuadricula');
  const [ancla, setAncla] = useState<Date>(() => new Date());
  const [zonasSel, setZonasSel] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<{ fechaISO: string; zonaCodigo: string | null } | null>(null);

  const dias = useMemo(
    () => (vista === 'mes' ? diasMes(ancla) : vista === 'dia' ? [ancla] : diasSemana(ancla)),
    [vista, ancla],
  );
  const fechasISO = useMemo(() => dias.map(isoDe), [dias]);
  const zonasRango = useMemo(() => zonasPresentes(base, fechasISO), [base, fechasISO]);
  const planes = useMemo(() => filtrarPorZonas(base, zonasSel), [base, zonasSel]);
  const numeros = useMemo(() => numeroDeViaje(planes, fechasISO), [planes, fechasISO]);

  function navegar(dir: -1 | 1) {
    setAncla((a) => (vista === 'mes' ? addMonths(a, dir) : addDays(a, vista === 'dia' ? dir : dir * 7)));
  }
  function toggleZona(z: string) {
    setZonasSel((s) => {
      const n = new Set(s);
      if (n.has(z)) n.delete(z);
      else n.add(z);
      return n;
    });
  }
  const abrir = (fechaISO: string, zonaCodigo: string | null) => setDetalle({ fechaISO, zonaCodigo });

  const etiqueta =
    vista === 'mes'
      ? format(ancla, 'MMMM yyyy', { locale: es })
      : vista === 'dia'
        ? fmtDia(isoDe(ancla))
        : `${format(dias[0], 'd MMM', { locale: es })} – ${format(dias[dias.length - 1], 'd MMM yyyy', { locale: es })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <ControlesVista vista={vista} modo={modo} onVista={setVista} onModo={setModo} />

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
          <span className="text-sm font-semibold text-slate-700 capitalize ml-1 min-w-[9rem]">{etiqueta}</span>
        </div>
      </div>

      <FiltroZonas zonas={zonasRango} seleccionadas={zonasSel} onToggle={toggleZona} onTodas={() => setZonasSel(new Set())} />

      {cargando ? (
        <div className="flex items-center justify-center h-48 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
        </div>
      ) : modo === 'tabla' ? (
        <VistaTabla planes={planes} dias={dias} onAbrirCelda={(f, z) => abrir(f, z)} />
      ) : vista === 'semana' ? (
        <VistaSemanaMatriz planes={planes} dias={dias} numeros={numeros} onAbrirCelda={(f, z) => abrir(f, z)} />
      ) : vista === 'mes' ? (
        <VistaMes planes={planes} ancla={ancla} dias={dias} onAbrirDia={(f) => abrir(f, null)} />
      ) : (
        <DetalleDia planes={planes} fechaISO={isoDe(ancla)} onRecargar={recargar} />
      )}

      {detalle && (
        <DetalleModal
          planes={planes}
          fechaISO={detalle.fechaISO}
          zonaCodigo={detalle.zonaCodigo}
          onClose={() => setDetalle(null)}
          onRecargar={recargar}
        />
      )}
    </div>
  );
}
