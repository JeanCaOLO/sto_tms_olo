// Proformas: varias liquidaciones de un transportista que pasan por fases de aprobación y se envían por correo.

import { useMemo, useState } from 'react';
import Button from '../../components/base/Button';
import Card from '../../components/base/Card';
import DataTable from '../../components/base/DataTable';
import StatCard from '../../components/feature/StatCard';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import { formatMoney } from '../../lib/tarifas/format';
import { isWaitingFor, pendingForActor } from '../../lib/tarifas/proformas';
import DetalleProformaModal from './components/DetalleProformaModal';
import ProformaBitacora from './components/ProformaBitacora';
import EmailConfigForm from './config/EmailConfigForm';
import FlowPhasesEditor from './config/FlowPhasesEditor';
import { useGoogleReturn } from './hooks/useGoogleReturn';
import { useProformaActor } from './hooks/useProformaActor';
import { useProformaList } from './hooks/useProformaList';
import { getProformaColumns } from './parts/proformaColumns';

type Tab = 'pending' | 'all' | 'log' | 'config';

const tabClass = (current: Tab, tab: Tab) =>
  `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${current === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

export default function ProformasPage() {
  const { country, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();
  const { canEdit } = useModulePermissions('tarifas.proformas');
  const { canEdit: canConfigure } = useModulePermissions('tarifas.config');
  useTarifasActor();
  const actor = useProformaActor();
  const google = useGoogleReturn();
  // Quien gestiona proformas ejecuta el barrido: agrupa las liquidaciones que quedaron sin proforma.
  const [tab, setTab] = useState<Tab>('pending');
  // Lo vigente alcanza para el dashboard; el historial y la bitácora se piden solo al abrir esas pestañas.
  const { rows, loading, error, noPhases, reload } = useProformaList(countryId, canEdit, tab === 'all' || tab === 'log' ? 'all' : 'active');
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = useMemo(() => rows.filter((r) => isWaitingFor(r, actor)), [rows, actor]);
  const pending = useMemo(() => pendingForActor(rows, actor), [rows, actor]);
  const numbers = useMemo(() => new Map(rows.map((r) => [r.proforma.id, r.proforma.number])), [rows]);
  const inReview = rows.filter((r) => r.proforma.status === 'En Revisión');
  const toSend = rows.filter((r) => r.proforma.status === 'Aprobado' && !r.proforma.emailSentAt);
  const pendingTotal = inReview.reduce((sum, r) => sum + Math.round(r.proforma.totalAmount * 100), 0) / 100;
  const visible = tab === 'pending' ? pending : rows;
  const currency = country?.local_currency ?? '';

  if (loadingCountries) return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Proformas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada liquidación entra sola a la proforma de su transportista. La proforma pasa por las fases de aprobación y, al final, se le envía por correo.
          </p>
        </div>
      </div>

      <CountryScopeBar country={country} problem={problem} selectedName={selectedName} loading={loadingCountries} />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {google.notice && (
        <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${google.notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <span>{google.notice.text}</span>
          <button type="button" aria-label="Cerrar aviso" className="cursor-pointer" onClick={google.dismiss}><i className="ri-close-line" /></button>
        </div>
      )}

      {noPhases && canConfigure && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este país no tiene fases de aprobación: las liquidaciones quedan en Borrador sin proforma. Configúralas en la pestaña Configuración.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="En revisión" value={String(inReview.length)} icon="ri-time-line" color="amber" />
        <StatCard title="Esperan mi aprobación" value={String(mine.length)} icon="ri-user-star-line" color="teal" />
        <StatCard title="Aprobadas por enviar" value={String(toSend.length)} icon="ri-mail-send-line" color="emerald" />
        <StatCard title="Total en revisión" value={formatMoney(String(pendingTotal), currency)} icon="ri-money-dollar-circle-line" color="amber" />
      </div>

      <Card>
        <div className="mb-4 flex border-b border-slate-200">
          <button type="button" className={tabClass(tab, 'pending')} onClick={() => setTab('pending')}>Por aprobar ({pending.length})</button>
          <button type="button" className={tabClass(tab, 'all')} onClick={() => setTab('all')}>Todas</button>
          <button type="button" className={tabClass(tab, 'log')} onClick={() => setTab('log')}>Bitácora</button>
          {canConfigure && <button type="button" className={tabClass(tab, 'config')} onClick={() => setTab('config')}>Configuración</button>}
        </div>

        {tab === 'config' && canConfigure && countryId ? (
          <div className="space-y-4">
            <FlowPhasesEditor countryId={countryId} />
            <EmailConfigForm countryId={countryId} />
          </div>
        ) : tab === 'log' ? (
          <ProformaBitacora numbers={numbers} />
        ) : (
          <DataTable
            data={visible}
            columns={getProformaColumns()}
            getRowId={(r) => r.proforma.id}
            loading={loading}
            columnsKey="proformas.lista"
            searchPlaceholder="Buscar por PRO- o transportista"
            exportFileName="proformas"
            emptyMessage={tab === 'pending' ? 'No tienes proformas pendientes en tu nivel' : 'Aún no hay proformas'}
            pageSize={25}
            onRowClick={(r) => setOpenId(r.proforma.id)}
            actions={(r) => (
              <Button variant="ghost" size="sm" title="Ver la proforma" onClick={() => setOpenId(r.proforma.id)}>
                <i className="ri-eye-line" />
              </Button>
            )}
          />
        )}
      </Card>

      {openId && (
        <DetalleProformaModal proformaId={openId} actor={actor} canEdit={canEdit} onClose={() => setOpenId(null)} onChanged={() => void reload()} />
      )}
    </div>
  );
}
