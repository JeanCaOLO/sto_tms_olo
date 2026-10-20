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
import { canApprove, currentPhase } from '../../lib/tarifas/proformas';
import DetalleProformaModal from './components/DetalleProformaModal';
import GenerarProformaModal from './components/GenerarProformaModal';
import EmailConfigForm from './config/EmailConfigForm';
import FlowPhasesEditor from './config/FlowPhasesEditor';
import { useGoogleReturn } from './hooks/useGoogleReturn';
import { useProformaActor } from './hooks/useProformaActor';
import { useProformaList } from './hooks/useProformaList';
import { getProformaColumns } from './parts/proformaColumns';

type Tab = 'pending' | 'all' | 'config';

const tabClass = (current: Tab, tab: Tab) =>
  `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${current === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

export default function ProformasPage() {
  const { country, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();
  const { canCreate, canEdit } = useModulePermissions('tarifas.proformas');
  const { canEdit: canConfigure } = useModulePermissions('tarifas.config');
  useTarifasActor();
  const actor = useProformaActor();
  const google = useGoogleReturn();
  const { rows, loading, error, reload } = useProformaList(countryId);
  const [tab, setTab] = useState<Tab>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const mine = useMemo(() => rows.filter(({ proforma, phases }) => {
    const current = currentPhase(phases);
    return !!actor && proforma.status === 'En Revisión' && !!current && canApprove(actor, current, phases);
  }), [rows, actor]);
  const inReview = rows.filter((r) => r.proforma.status === 'En Revisión');
  const toSend = rows.filter((r) => r.proforma.status === 'Aprobado' && !r.proforma.emailSentAt);
  const pendingTotal = inReview.reduce((sum, r) => sum + Math.round(r.proforma.totalAmount * 100), 0) / 100;
  const visible = tab === 'pending' ? inReview : rows;
  const currency = country?.local_currency ?? '';

  if (loadingCountries) return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Proformas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Las liquidaciones de un transportista pasan por las fases de aprobación y, al final, se le envía la proforma por correo.
          </p>
        </div>
        {canCreate && countryId && (
          <Button icon={<i className="ri-add-line" />} onClick={() => setCreating(true)}>Nueva proforma</Button>
        )}
      </div>

      <CountryScopeBar country={country} problem={problem} selectedName={selectedName} loading={loadingCountries} />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {google.notice && (
        <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${google.notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <span>{google.notice.text}</span>
          <button type="button" aria-label="Cerrar aviso" className="cursor-pointer" onClick={google.dismiss}><i className="ri-close-line" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Por aprobar" value={String(inReview.length)} icon="ri-time-line" color="amber" />
        <StatCard title="Esperan mi aprobación" value={String(mine.length)} icon="ri-user-star-line" color="teal" />
        <StatCard title="Aprobadas por enviar" value={String(toSend.length)} icon="ri-mail-send-line" color="emerald" />
        <StatCard title="Total en revisión" value={formatMoney(String(pendingTotal), currency)} icon="ri-money-dollar-circle-line" color="amber" />
      </div>

      <Card>
        <div className="mb-4 flex border-b border-slate-200">
          <button type="button" className={tabClass(tab, 'pending')} onClick={() => setTab('pending')}>Por aprobar ({inReview.length})</button>
          <button type="button" className={tabClass(tab, 'all')} onClick={() => setTab('all')}>Todas ({rows.length})</button>
          {canConfigure && <button type="button" className={tabClass(tab, 'config')} onClick={() => setTab('config')}>Configuración</button>}
        </div>

        {tab === 'config' && canConfigure && countryId ? (
          <div className="space-y-4">
            <FlowPhasesEditor countryId={countryId} />
            <EmailConfigForm countryId={countryId} />
          </div>
        ) : (
          <DataTable
            data={visible}
            columns={getProformaColumns()}
            getRowId={(r) => r.proforma.id}
            loading={loading}
            columnsKey="proformas.lista"
            searchPlaceholder="Buscar por PRO- o transportista"
            exportFileName="proformas"
            emptyMessage={tab === 'pending' ? 'No hay proformas por aprobar' : 'Aún no hay proformas'}
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

      {creating && countryId && (
        <GenerarProformaModal
          countryId={countryId}
          onClose={() => setCreating(false)}
          onCreated={(p) => { setCreating(false); void reload(); setOpenId(p.id); }}
        />
      )}
      {openId && (
        <DetalleProformaModal proformaId={openId} actor={actor} canEdit={canEdit} onClose={() => setOpenId(null)} onChanged={() => void reload()} />
      )}
    </div>
  );
}
