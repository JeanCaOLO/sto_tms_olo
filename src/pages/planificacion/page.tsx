import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CalendarioPlanificacion from './components/CalendarioPlanificacion';
import PlanesTab from './components/PlanesTab';

type Tab = 'calendario' | 'planes';

// Planificación 2: el Calendario muestra los planes del día por zona; la pestaña
// "Planificaciones" los lista por estado. El país/almacén salen del contexto
// operativo del headbar. (La pestaña "Generar Plan" manual se retiró: la
// planificación es automática sobre los pedidos de eFlow ingestados en Aurora.)
export default function PlanificacionPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('calendario');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">{t('planning.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('planning.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'calendario'} onClick={() => setTab('calendario')} label={t('planning.tabCalendar')} testId="tab-calendario" />
        <TabButton active={tab === 'planes'} onClick={() => setTab('planes')} label={t('planning.tabPlans')} testId="tab-planes" />
      </div>

      {tab === 'calendario' ? <CalendarioPlanificacion /> : <PlanesTab />}
    </div>
  );
}

function TabButton({ active, onClick, label, testId }: { active: boolean; onClick: () => void; label: string; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 cursor-pointer ${
        active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}
