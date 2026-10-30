// Proformas agrupadas por transportista: una fila por transportista y, al desplegarla, sus proformas.
//   approve  Por aprobar: casillas + aprobar/rechazar en lote, con el indicador de irregularidad (círculo con "!").
//   process  En proceso: solo lectura; muestra por qué fase va cada proforma y quién falta por aprobar.
//   done     Completadas: ya pasaron todas las fases; se abren para enviarlas por correo.

import { useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import {
  completedAt, decideProformas, groupProformasByCarrier, phaseLabel,
  type ProformaAlerts, type ProformaCarrierGroup, type ProformaWithPhases,
} from '../../../lib/tarifas/proformas';
import IrregularBadge from '../components/IrregularBadge';
import PhaseTimeline from '../components/PhaseTimeline';
import ReasonModal from '../components/ReasonModal';
import { useIrregularities } from '../hooks/useIrregularities';

export type GroupsMode = 'approve' | 'process' | 'done';

interface Props {
  rows: ProformaWithPhases[];
  mode: GroupsMode;
  loading: boolean;
  onOpen: (proformaId: string) => void;
  onChanged: () => void;
}

const EMPTY: Record<GroupsMode, string> = {
  approve: 'No tienes proformas pendientes en tu nivel',
  process: 'No hay proformas en revisión en este periodo',
  done: 'No hay proformas completadas en este periodo',
};

const shortDate = (iso: string) => (iso ? iso.slice(0, 10) : '');

function alertsOf(group: ProformaCarrierGroup, alerts: Map<string, ProformaAlerts>) {
  const flags = group.rows.flatMap((r) => alerts.get(r.proforma.id)?.settlements.flatMap((s) => s.flags) ?? []);
  const irregular = group.rows.reduce((n, r) => n + (alerts.get(r.proforma.id)?.irregularCount ?? 0), 0);
  const total = group.rows.reduce((n, r) => n + (alerts.get(r.proforma.id)?.settlements.length ?? 0), 0);
  // Una sola entrada por tipo de alerta, para que el tooltip del transportista no repita lo mismo N veces.
  const unique = [...new Map(flags.map((f) => [f.code, f])).values()];
  return { unique, irregular, total };
}

export default function CarrierGroupsTable({ rows, mode, loading, onOpen, onChanged }: Props) {
  const groups = useMemo(() => groupProformasByCarrier(rows), [rows]);
  const { alerts } = useIrregularities(useMemo(() => (mode === 'approve' ? rows.map((r) => r.proforma.id) : []), [rows, mode]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Check por proforma, de a una: marcar otra desmarca la anterior. Solo selección visual.
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ action: 'approve' | 'reject'; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const columns: DataTableColumn<ProformaCarrierGroup>[] = [
    {
      key: 'carrier', header: 'Transportista', sortable: true, accessor: (g) => g.carrierName,
      render: (g) => <span className="font-medium text-slate-800">{g.carrierName}</span>,
    },
    { key: 'count', header: 'Proformas', sortable: true, align: 'right', accessor: (g) => g.rows.length },
    {
      key: 'total', header: 'Total', sortable: true, align: 'right', accessor: (g) => g.totalAmount,
      render: (g) => <span className="font-medium text-slate-900">{formatMoney(String(g.totalAmount), g.currency)}</span>,
    },
    ...(mode === 'approve' ? [{
      key: 'alerts', header: 'Revisión', align: 'right' as const,
      accessor: (g: ProformaCarrierGroup) => (alertsOf(g, alerts).irregular > 0 ? 'Con alertas' : 'Sin alertas'),
      render: (g: ProformaCarrierGroup) => {
        const a = alertsOf(g, alerts);
        return a.irregular > 0
          ? <span className="inline-flex justify-end"><IrregularBadge flags={a.unique} summary={`${a.irregular} de ${a.total} liquidaciones con alertas`} /></span>
          : <span className="text-xs text-emerald-600">Sin alertas</span>;
      },
    }] : []),
  ];

  async function confirm(text: string) {
    if (!ask) return;
    setBusy(true);
    const targets = groups.filter((g) => ask.ids.includes(g.id)).flatMap((g) => g.rows);
    const res = await decideProformas(targets, ask.action, text || undefined);
    setBusy(false);
    setAsk(null);
    setSelected(new Set());
    setNotice(res.failed.length === 0
      ? { ok: true, text: `${res.done} proforma(s) ${ask.action === 'approve' ? 'aprobadas' : 'rechazadas'}.` }
      : { ok: false, text: `${res.done} listas. No pasaron: ${res.failed.map((f) => `${f.number} (${f.error})`).join('; ')}` });
    onChanged();
  }

  // Antes de aprobar en lote se avisa cuántas proformas traen alertas; no se bloquea.
  const withAlerts = (ids: string[]) =>
    groups.filter((g) => ids.includes(g.id)).flatMap((g) => g.rows).filter((r) => (alerts.get(r.proforma.id)?.irregularCount ?? 0) > 0).length;

  return (
    <div className="space-y-3">
      {notice && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{notice.text}</div>
      )}
      <DataTable
        data={groups}
        columns={columns}
        getRowId={(g) => g.id}
        loading={loading}
        columnsKey={`proformas.grupos.${mode}`}
        searchPlaceholder="Buscar transportista"
        emptyMessage={EMPTY[mode]}
        pageSize={25}
        renderExpanded={(g) => (
          <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
            {g.rows.map((r) => {
              const flags = alerts.get(r.proforma.id);
              return (
                <div key={r.proforma.id} className="py-2">
                  <div className="flex items-center gap-3">
                  <input type="checkbox" aria-label={`Seleccionar proforma ${r.proforma.number}`}
                    checked={checkedId === r.proforma.id}
                    onChange={() => setCheckedId((cur) => (cur === r.proforma.id ? null : r.proforma.id))}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-teal-600" />
                  <button type="button" onClick={() => onOpen(r.proforma.id)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 text-left text-sm hover:text-teal-700">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-teal-700">{r.proforma.number}</span>
                      {mode === 'approve' && flags && flags.irregularCount > 0 && (
                        <IrregularBadge
                          flags={[...new Map(flags.settlements.flatMap((s) => s.flags).map((f) => [f.code, f])).values()]}
                          summary={`${flags.irregularCount} de ${flags.settlements.length} liquidaciones con alertas`}
                        />
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      {mode === 'done'
                        ? `Aprobada el ${shortDate(completedAt(r))} · ${r.proforma.emailSentAt ? 'Correo enviado' : 'Por enviar'}`
                        : r.proforma.status === 'En Revisión' ? phaseLabel(r.proforma.status, r.phases) : r.proforma.status}
                    </span>
                    <span className="font-medium">{formatMoney(String(r.proforma.totalAmount), r.proforma.currency)}</span>
                  </button>
                  </div>
                  {mode === 'process' && <div className="mt-2"><PhaseTimeline phases={r.phases} /></div>}
                </div>
              );
            })}
          </div>
        )}
        selection={mode !== 'approve' ? undefined : {
          selected,
          onChange: setSelected,
          bar: (ids) => (
            <>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => setAsk({ action: 'reject', ids })}>Rechazar</Button>
              <Button variant="success" size="sm" disabled={busy} onClick={() => setAsk({ action: 'approve', ids })}>Aprobar seleccionados</Button>
            </>
          ),
        }}
      />
      {ask && (
        <ReasonModal
          title={ask.action === 'approve' ? 'Aprobar proformas' : 'Rechazar proformas'}
          label={ask.action === 'approve'
            ? `Comentario (opcional)${withAlerts(ask.ids) > 0 ? ` — ${withAlerts(ask.ids)} proforma(s) traen alertas de revisión` : ''}`
            : 'Motivo del reclamo'}
          confirmLabel={ask.action === 'approve' ? 'Aprobar' : 'Rechazar'}
          required={ask.action === 'reject'}
          danger={ask.action === 'reject'}
          busy={busy}
          onConfirm={(t) => void confirm(t)}
          onClose={() => { if (!busy) setAsk(null); }}
        />
      )}
    </div>
  );
}
