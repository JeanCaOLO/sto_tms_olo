// Proformas agrupadas por transportista: una fila por transportista y, al desplegarla, sus proformas.
//   approve  Por aprobar: casilla por transportista (todas sus proformas) o por proforma, + aprobar/rechazar en lote, con el indicador de irregularidad (círculo con "!").
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
import { formatLocalDate as shortDate } from '../../../lib/tarifas/localDate';
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
  // Una sola selección, por proforma: marcar un transportista marca todas sus proformas y desmarcar una deja al transportista sin marcar.
  const [checked, setChecked] = useState<Set<string>>(new Set());
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
    const targets = rows.filter((r) => ask.ids.includes(r.proforma.id));
    const res = await decideProformas(targets, ask.action, text || undefined);
    setBusy(false);
    setAsk(null);
    setChecked(new Set());
    setNotice(res.failed.length === 0
      ? { ok: true, text: `${res.done} proforma(s) ${ask.action === 'approve' ? 'aprobadas' : 'rechazadas'}.` }
      : { ok: false, text: `${res.done} listas. No pasaron: ${res.failed.map((f) => `${f.number} (${f.error})`).join('; ')}` });
    onChanged();
  }

  // Antes de aprobar en lote se avisa cuántas proformas traen alertas; no se bloquea.
  const withAlerts = (ids: string[]) =>
    rows.filter((r) => ids.includes(r.proforma.id)).filter((r) => (alerts.get(r.proforma.id)?.irregularCount ?? 0) > 0).length;

  // "3 proformas de 2 transportistas (A, B)": a qué afecta exactamente la decisión en lote antes de confirmarla.
  const scopeText = (ids: string[]) => {
    const chosen = rows.filter((r) => ids.includes(r.proforma.id));
    const proformas = chosen.length;
    const names = [...new Set(chosen.map((r) => r.proforma.carrierName))].sort((x, y) => x.localeCompare(y));
    const shown = names.length > 5 ? `${names.slice(0, 5).join(', ')} y ${names.length - 5} más` : names.join(', ');
    return `${proformas} proforma${proformas === 1 ? '' : 's'} de ${names.length} transportista${names.length === 1 ? '' : 's'} (${shown}).`;
  };

  // Solo cuentan las marcadas que siguen en la lista (tras aprobar/rechazar y refrescar desaparecen).
  const checkedIds = rows.map((r) => r.proforma.id).filter((id) => checked.has(id));
  // Transportista marcado = todas sus proformas marcadas.
  const selected = new Set(groups.filter((g) => g.rows.every((r) => checked.has(r.proforma.id))).map((g) => g.id));
  // Transportista con marcas a medias: mientras exista, no se pueden marcar proformas de otros (no se mezclan en una selección parcial).
  const partialGroup = groups.find((g) => !selected.has(g.id) && g.rows.some((r) => checked.has(r.proforma.id)))?.id ?? null;
  const toggleChecked = (id: string) => setChecked((cur) => {
    const next = new Set(cur);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const onSelectGroups = (next: Set<string>) => setChecked((cur) => {
    const out = new Set(cur);
    for (const g of groups) {
      if (next.has(g.id) === selected.has(g.id)) continue;
      for (const r of g.rows) { if (next.has(g.id)) out.add(r.proforma.id); else out.delete(r.proforma.id); }
    }
    return out;
  });

  return (
    <div className="space-y-3">
      {mode === 'approve' && checkedIds.length > 0 && selected.size === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2">
          <span className="text-sm text-teal-800">
            {checkedIds.length === 1 ? '1 proforma marcada' : `${checkedIds.length} proformas marcadas`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setAsk({ action: 'reject', ids: checkedIds })}>Rechazar</Button>
            <Button variant="success" size="sm" disabled={busy} onClick={() => setAsk({ action: 'approve', ids: checkedIds })}>Aprobar marcadas</Button>
            <button type="button" className="cursor-pointer text-xs text-teal-700 hover:underline" onClick={() => setChecked(new Set())}>Quitar marcas</button>
          </div>
        </div>
      )}
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
                  {mode === 'approve' && (
                    <input type="checkbox" aria-label={`Seleccionar proforma ${r.proforma.number}`}
                      checked={checked.has(r.proforma.id)}
                      disabled={!checked.has(r.proforma.id) && partialGroup !== null && partialGroup !== g.id}
                      title={partialGroup !== null && partialGroup !== g.id ? 'Termina o quita la selección del otro transportista: no se mezclan transportistas' : undefined}
                      onChange={() => toggleChecked(r.proforma.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-teal-600 disabled:cursor-not-allowed disabled:opacity-40" />
                  )}
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
          onChange: onSelectGroups,
          disabledReason: (g) => (partialGroup !== null && partialGroup !== g.id
            ? 'Hay proformas marcadas de otro transportista: no se mezclan' : null),
          bar: () => (
            <>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => setAsk({ action: 'reject', ids: checkedIds })}>Rechazar</Button>
              <Button variant="success" size="sm" disabled={busy} onClick={() => setAsk({ action: 'approve', ids: checkedIds })}>Aprobar seleccionados</Button>
            </>
          ),
        }}
      />
      {ask && (
        <ReasonModal
          title={ask.action === 'approve' ? 'Aprobar proformas' : 'Rechazar proformas'}
          label={ask.action === 'approve'
            ? `${scopeText(ask.ids)} Comentario (opcional)${withAlerts(ask.ids) > 0 ? ` — ${withAlerts(ask.ids)} proforma(s) traen alertas de revisión` : ''}`
            : `${scopeText(ask.ids)} Motivo del reclamo`}
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
