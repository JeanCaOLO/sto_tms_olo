import { useTranslation } from 'react-i18next';
import { useZonasNombre } from '../use-zonas-nombre';

interface Props {
  zonas: string[]; // todas las zonas del rango visible
  seleccionadas: Set<string>; // vacío = todas
  onToggle: (zona: string) => void;
  onTodas: () => void;
}

const cls = (activo: boolean): string =>
  `px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border ${
    activo
      ? 'bg-teal-600 text-white border-teal-600'
      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
  }`;

// Chips para filtrar el calendario por zona. "Todas" limpia el filtro; cada chip
// activa/desactiva su zona. Set vacío = sin filtro (se ven todas las zonas).
export default function FiltroZonas({ zonas, seleccionadas, onToggle, onTodas }: Props) {
  const { t } = useTranslation();
  const { nombreDe } = useZonasNombre();
  if (zonas.length === 0) return null;
  const todas = seleccionadas.size === 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <i className="ri-filter-3-line text-slate-400"></i>
      <button type="button" className={cls(todas)} onClick={onTodas}>
        {t('planning.allZones')}
      </button>
      {zonas.map((z) => (
        <button key={z} type="button" className={cls(!todas && seleccionadas.has(z))} onClick={() => onToggle(z)}>
          {nombreDe(z)}
        </button>
      ))}
    </div>
  );
}
