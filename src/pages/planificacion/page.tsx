import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import DaySelector from './components/DaySelector';
import PlanEditor from './components/PlanEditor';
import PlanesTab from './components/PlanesTab';
import { useCatalogos } from './use-catalogos';
import { usePedidosDia } from './use-pedidos-dia';
import { fechaEntregaObjetivo } from './plan-pedidos-api';

type Tab = 'generar' | 'planes';

// Planificación 2: el planificador elige el día, genera un plan persistido
// (draft) con viajes+paradas, lo edita moviendo pedidos entre viajes y lo
// confirma. La pestaña "Planificaciones" lista los planes por estado. El país/
// almacén/cliente salen del contexto operativo del headbar (no hay selector de
// país en la página). Fallback mock si el backend de /planes no responde.
export default function PlanificacionPage() {
  const { t } = useTranslation();
  const { appUser } = useAuth();
  const { selectedCountryId, selectedWarehouseId } = useOperationalContext();
  const [tab, setTab] = useState<Tab>('generar');
  const [fecha, setFecha] = useState<string>(fechaEntregaObjetivo());

  const { vehiculos, conductores, loading: cargandoCatalogos } = useCatalogos(appUser);
  const { pedidos, cargando: cargandoPedidos } = usePedidosDia(fecha);

  const ctx = useMemo(
    () => ({ pedidos, vehiculos, conductores, countryId: selectedCountryId, warehouseId: selectedWarehouseId }),
    [pedidos, vehiculos, conductores, selectedCountryId, selectedWarehouseId],
  );

  const cargando = cargandoCatalogos || cargandoPedidos;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">{t('planning.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('planning.subtitle')}</p>
        </div>
        <DaySelector value={fecha} onChange={setFecha} label={t('planning.day')} />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'generar'} onClick={() => setTab('generar')} label={t('planning.tabGenerate')} testId="tab-generar" />
        <TabButton active={tab === 'planes'} onClick={() => setTab('planes')} label={t('planning.tabPlans')} testId="tab-planes" />
      </div>

      {tab === 'generar' ? (
        cargando ? (
          <div className="flex items-center justify-center h-48 text-slate-500">
            <i className="ri-loader-4-line animate-spin text-2xl"></i>
          </div>
        ) : (
          <PlanEditor
            fecha={fecha}
            pedidosCount={pedidos.length}
            vehiculosCount={vehiculos.length}
            ctx={ctx}
            onConfirmed={() => setTab('planes')}
          />
        )
      ) : (
        <PlanesTab />
      )}
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
