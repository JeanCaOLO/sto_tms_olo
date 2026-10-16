import { useTranslation } from 'react-i18next';
import type { VistaCalendario } from '../calendario';

export type Modo = 'cuadricula' | 'tabla';

interface Props {
  vista: VistaCalendario;
  modo: Modo;
  onVista: (v: VistaCalendario) => void;
  onModo: (m: Modo) => void;
}

const VISTAS: { id: VistaCalendario; key: string }[] = [
  { id: 'dia', key: 'planning.viewDay' },
  { id: 'semana', key: 'planning.viewWeek' },
  { id: 'mes', key: 'planning.viewMonth' },
];

const rango = (activo: boolean): string =>
  `px-3 py-1.5 text-sm font-medium cursor-pointer ${activo ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`;
const toggle = (activo: boolean): string =>
  `px-3 py-1.5 text-sm cursor-pointer ${activo ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`;

// Selectores de la vista: rango (día/semana/mes) y modo (cuadrícula/tabla).
export default function ControlesVista({ vista, modo, onVista, onModo }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        {VISTAS.map((v) => (
          <button key={v.id} onClick={() => onVista(v.id)} className={rango(vista === v.id)}>
            {t(v.key)}
          </button>
        ))}
      </div>
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        <button onClick={() => onModo('cuadricula')} title={t('planning.viewGrid')} className={toggle(modo === 'cuadricula')}>
          <i className="ri-layout-grid-line"></i>
        </button>
        <button onClick={() => onModo('tabla')} title={t('planning.viewTable')} className={toggle(modo === 'tabla')}>
          <i className="ri-list-check-2"></i>
        </button>
      </div>
    </div>
  );
}
