import { useNavigate } from 'react-router-dom';
import { usePermissions, type ViewAs } from '../../hooks/usePermissions';

const OPTIONS: { id: ViewAs; label: string; icon: string; hint: string }[] = [
  { id: 'liquidador', label: 'Liquidador', icon: 'ri-user-3-line', hint: 'Así lo ve el Liquidador: liquida y solo lee la configuración.' },
  { id: 'desarrollador', label: 'Desarrollador', icon: 'ri-code-s-slash-line', hint: 'Vista completa: configura costos, reglas y tarifarios.' },
];

/** Dos botones (flotantes, abajo a la derecha) para mostrar cómo se ve el tarifador para cada rol. Solo lo ve quien puede configurarlo. */
export default function ViewAsToggle() {
  const { canPreview, viewAs, setViewAs } = usePermissions();
  const navigate = useNavigate();
  if (!canPreview) return null;

  const choose = (view: ViewAs) => {
    setViewAs(view);
    // El Liquidador solo tiene el módulo de Tarifas: se lleva a su pantalla de inicio.
    if (view === 'liquidador') navigate('/liquidaciones');
  };

  return (
    <div role="group" aria-label="Ver el sistema como" className="fixed bottom-4 right-4 z-40 flex items-center gap-1 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 print:hidden">
      <span className="text-[11px] text-slate-500 px-1.5">Ver como</span>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => choose(o.id)}
          aria-pressed={viewAs === o.id}
          title={o.hint}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
            viewAs === o.id ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <i className={o.icon}></i>{o.label}
        </button>
      ))}
    </div>
  );
}
