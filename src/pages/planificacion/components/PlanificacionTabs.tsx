type Tab = 'nueva' | 'flota' | 'generadas' | 'matriz';

interface Props {
  tab: Tab;
  setTab: (tab: Tab) => void;
  rutasGeneradasCount: number;
}

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'nueva', icon: 'ri-add-circle-line', label: 'Nueva Ruta' },
  { id: 'flota', icon: 'ri-stack-line', label: 'Reparto de Flota' },
  { id: 'generadas', icon: 'ri-route-line', label: 'Rutas Generadas' },
  { id: 'matriz', icon: 'ri-table-line', label: 'Matriz de Rutas' },
];

export default function PlanificacionTabs({ tab, setTab, rutasGeneradasCount }: Props) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
      {TABS.map(({ id, icon, label }) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            tab === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className={`${icon} mr-1.5`}></i>{label}
          {id === 'generadas' && rutasGeneradasCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-teal-100 text-teal-700 rounded-full">
              {rutasGeneradasCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
