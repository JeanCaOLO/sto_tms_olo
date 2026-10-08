import type { Tab } from '../hooks/useReglasTarifaController';
import { useModulePermissions } from '../../../hooks/use-module-permissions';

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

/** `soloEditores`: pestañas que muestran lo interno del motor; quien solo puede ver la configuración no las ve. */
const TABS: { id: Tab; label: string; icon?: string; soloEditores?: boolean }[] = [
  { id: 'reglas', label: 'Reglas' },
  { id: 'tarifarios', label: 'Tarifarios' },
  { id: 'margen', label: 'Alerta Margen', soloEditores: true },
  { id: 'probador', label: 'Probador Motor', icon: 'ri-flask-line', soloEditores: true },
  { id: 'bitacora', label: 'Bitácora', icon: 'ri-history-line' },
];

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { canEdit } = useModulePermissions('tarifas.config');
  const visibles = TABS.filter((tab) => canEdit || !tab.soloEditores);
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
      {visibles.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === tab.id
              ? 'bg-white text-teal-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {tab.icon && <i className={`${tab.icon} mr-1`}></i>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
