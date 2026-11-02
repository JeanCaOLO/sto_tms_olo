// Proformas: varias liquidaciones de un transportista que pasan por fases de aprobación y se envían por correo.
// Secciones: Por aprobar (cada aprobador, su turno) · En proceso, Reclamos y Completadas (Liquidador y administradores) · Bitácora.

import { useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import DateRangeFilter from '../../components/feature/DateRangeFilter';
import StatCard from '../../components/feature/StatCard';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import { formatMoney } from '../../lib/tarifas/format';
import { CLAIMS_LIMIT } from '../../lib/tarifas/proformas/claims';
import { canManageProformas, HISTORY_LIMIT, isWaitingFor, pendingForActor, TODAY_RANGE } from '../../lib/tarifas/proformas';
import DetalleProformaModal from './components/DetalleProformaModal';
import ProformaBitacora from './components/ProformaBitacora';
import EmailConfigForm from './config/EmailConfigForm';
import FlowPhasesEditor from './config/FlowPhasesEditor';
import { useClaims } from './hooks/useClaims';
import { useGoogleReturn } from './hooks/useGoogleReturn';
import { useProformaActor } from './hooks/useProformaActor';
import { useProformaList } from './hooks/useProformaList';
import CarrierGroupsTable from './parts/CarrierGroupsTable';
import ClaimsTable from './parts/ClaimsTable';

type Tab = 'pending' | 'process' | 'claims' | 'done' | 'log' | 'config';

const tabClass = (current: Tab, tab: Tab) =>
  `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${current === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

// Estas secciones traen datos por periodo (por defecto, hoy). Por aprobar no: un pendiente de ayer no puede quedar oculto.
const SECTION_SCOPE = { process: 'review', done: 'done', log: 'all' } as const;

export default function ProformasPage() {
  const { country, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();
  const { canEdit } = useModulePermissions('tarifas.proformas');
  const { canEdit: canConfigure } = useModulePermissions('tarifas.config');
  useTarifasActor();
  const actor = useProformaActor();
  const google = useGoogleReturn();
  const manager = canManageProformas(actor?.roleName);
  const [requested, setTab] = useState<Tab>('pending');
  const tabs: Tab[] = ['pending', ...(manager ? ['process', 'claims', 'done'] as Tab[] : []), 'log', ...(canConfigure ? ['config'] as Tab[] : [])];
  const tab = tabs.includes(requested) ? requested : 'pending';
  const [range, setRange] = useState(TODAY_RANGE);
  const [openId, setOpenId] = useState<string | null>(null);

  // Lo vigente (en revisión o aprobado sin enviar) siempre se carga: alimenta Por aprobar y los contadores. Aquí corre el barrido.
  const active = useProformaList(countryId, canEdit, 'active');
  const sectionScope = tab === 'process' || tab === 'done' || tab === 'log' ? SECTION_SCOPE[tab] : 'all';
  const section = useProformaList(countryId, false, sectionScope, range, tab === 'process' || tab === 'done' || tab === 'log');
  const claims = useClaims(countryId, range, tab === 'claims');

  const mine = useMemo(() => active.rows.filter((r) => isWaitingFor(r, actor)), [active.rows, actor]);
  const pending = useMemo(() => pendingForActor(active.rows, actor), [active.rows, actor]);
  const numbers = useMemo(() => new Map(section.rows.map((r) => [r.proforma.id, r.proforma.number])), [section.rows]);
  const inReview = active.rows.filter((r) => r.proforma.status === 'En Revisión');
  const toSend = active.rows.filter((r) => r.proforma.status === 'Aprobado' && !r.proforma.emailSentAt);
  const pendingTotal = inReview.reduce((sum, r) => sum + Math.round(r.proforma.totalAmount * 100), 0) / 100;
  const currency = country?.local_currency ?? '';
  const error = active.error ?? section.error ?? claims.error;

  // Si la consulta llegó al tope, hay más de lo que se muestra: se avisa para que acoten el rango.
  const capped = (tab === 'process' || tab === 'done') && section.rows.length >= HISTORY_LIMIT || (tab === 'claims' && claims.rows.length >= CLAIMS_LIMIT);

  function reloadAll() {
    void active.reload();
    void section.reload();
    void claims.reload();
  }

  if (loadingCountries) return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>;

  const label: Record<Tab, string> = {
    pending: `Por aprobar (${pending.length})`, process: 'En proceso', claims: 'Reclamos', done: 'Completadas', log: 'Bitácora', config: 'Configuración',
  };

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

      {active.noPhases && canConfigure && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este país no tiene fases de aprobación: las liquidaciones quedan en Borrador sin proforma. Configúralas en la pestaña Configuración.
        </div>
      )}

      {/* Quien solo aprueba ve su turno; el avance del resto del flujo es para el Liquidador y los administradores. */}
      <div className={`grid grid-cols-1 gap-4 ${manager ? 'md:grid-cols-4' : ''}`}>
        {manager && <StatCard title="En revisión" value={String(inReview.length)} icon="ri-time-line" color="amber" />}
        <StatCard title="Esperan mi aprobación" value={String(mine.length)} icon="ri-user-star-line" color="teal" />
        {manager && <StatCard title="Aprobadas por enviar" value={String(toSend.length)} icon="ri-mail-send-line" color="emerald" />}
        {manager && <StatCard title="Total en revisión" value={formatMoney(String(pendingTotal), currency)} icon="ri-money-dollar-circle-line" color="amber" />}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap border-b border-slate-200">
          {tabs.map((t) => (
            <button key={t} type="button" className={tabClass(tab, t)} onClick={() => setTab(t)}>{label[t]}</button>
          ))}
        </div>

        {(tab === 'process' || tab === 'claims' || tab === 'done' || tab === 'log') && (
          <div className="mb-4 space-y-2">
            <DateRangeFilter value={range} onChange={setRange} />
            {capped && (
              <p className="text-xs text-amber-700">
                <i className="ri-information-line mr-1" />Se muestran las {tab === 'claims' ? CLAIMS_LIMIT : HISTORY_LIMIT} más recientes. Acota el periodo para ver el resto.
              </p>
            )}
          </div>
        )}

        {tab === 'config' && canConfigure && countryId ? (
          <div className="space-y-4">
            <FlowPhasesEditor countryId={countryId} />
            <EmailConfigForm countryId={countryId} />
          </div>
        ) : tab === 'log' ? (
          <ProformaBitacora numbers={numbers} range={range} />
        ) : tab === 'claims' ? (
          <ClaimsTable rows={claims.rows} loading={claims.loading} onOpen={setOpenId} onChanged={reloadAll} />
        ) : tab === 'pending' ? (
          <CarrierGroupsTable rows={pending} mode="approve" loading={active.loading} onOpen={setOpenId} onChanged={reloadAll} />
        ) : (
          <CarrierGroupsTable rows={section.rows} mode={tab === 'process' ? 'process' : 'done'} loading={section.loading} onOpen={setOpenId} onChanged={reloadAll} />
        )}
      </Card>

      {openId && (
        <DetalleProformaModal proformaId={openId} actor={actor} canEdit={canEdit} onClose={() => setOpenId(null)} onChanged={reloadAll} />
      )}
    </div>
  );
}
