// Reclamos: proformas que una fase rechazó. El liquidador decide por cada una:
//   Reiniciar liquidación  anula la proforma y sus liquidaciones con el reclamo como indicación; el viaje vuelve
//                          a "Por liquidar" (etiqueta "Anulada por reclamo") y se re-liquida y agrupa de nuevo.
//   Apelar                 devuelve la proforma a la fase que reclamó, explicando por qué el reclamo no procede;
//                          esa fase la acepta (sigue el flujo) o la rechaza de nuevo (vuelve aquí).

import { useMemo, useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import { decideProforma, groupProformasByCarrier, type ClaimRow, type ProformaCarrierGroup } from '../../../lib/tarifas/proformas';
import ReasonModal from '../components/ReasonModal';

interface Props {
  rows: ClaimRow[];
  loading: boolean;
  onOpen: (proformaId: string) => void;
  onChanged: () => void;
}

type Ask = { kind: 'restart' | 'appeal'; row: ClaimRow };

const TEXTS = {
  restart: {
    title: 'Reiniciar liquidación',
    label: 'Nota para la bitácora (opcional). El motivo del reclamo viaja como indicación para re-liquidar.',
    confirm: 'Reiniciar',
    required: false,
    danger: true,
  },
  appeal: {
    title: 'Apelar el reclamo',
    label: 'Explica por qué el reclamo no procede (lo verá quien lo puso)',
    confirm: 'Apelar',
    required: true,
    danger: false,
  },
} as const;

const shortDate = (iso: string) => (iso ? iso.slice(0, 10) : '');

export default function ClaimsTable({ rows, loading, onOpen, onChanged }: Props) {
  const groups = useMemo(() => groupProformasByCarrier(rows), [rows]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const columns: DataTableColumn<ProformaCarrierGroup<ClaimRow>>[] = [
    {
      key: 'carrier', header: 'Transportista', sortable: true, accessor: (g) => g.carrierName,
      render: (g) => <span className="font-medium text-slate-800">{g.carrierName}</span>,
    },
    { key: 'count', header: 'Reclamos', sortable: true, align: 'right', accessor: (g) => g.rows.length },
    {
      key: 'total', header: 'Total', sortable: true, align: 'right', accessor: (g) => g.totalAmount,
      render: (g) => <span className="font-medium text-slate-900">{formatMoney(String(g.totalAmount), g.currency)}</span>,
    },
  ];

  async function confirm(text: string) {
    if (!ask) return;
    setBusy(true);
    const { error } = await decideProforma(ask.row.proforma.id, { action: ask.kind, comment: text || undefined });
    setBusy(false);
    if (error) { setNotice({ ok: false, text: error }); return; }
    setNotice({ ok: true, text: ask.kind === 'restart'
      ? `${ask.row.proforma.number} anulada: sus viajes volvieron a "Por liquidar" con el reclamo como indicación.`
      : `${ask.row.proforma.number} devuelta a "${ask.row.claim.phaseName}" con tu explicación.` });
    setAsk(null);
    onChanged();
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>
      )}
      <DataTable
        data={groups}
        columns={columns}
        getRowId={(g) => g.id}
        loading={loading}
        columnsKey="proformas.reclamos"
        searchPlaceholder="Buscar transportista"
        emptyMessage="No hay reclamos en este periodo"
        pageSize={25}
        renderExpanded={(g) => (
          <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
            {g.rows.map((r) => (
              <div key={r.claim.id} className="space-y-1.5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="cursor-pointer font-mono text-xs text-teal-700 hover:underline" onClick={() => onOpen(r.proforma.id)}>
                    {r.proforma.number}
                  </button>
                  <span className="flex items-center gap-2">
                    <Badge variant={r.claim.status === 'abierto' ? 'danger' : 'warning'} size="sm">
                      {r.claim.status === 'abierto' ? 'Reclamo abierto' : `Apelado · espera a ${r.claim.phaseName}`}
                    </Badge>
                    <span className="font-medium">{formatMoney(String(r.proforma.totalAmount), r.proforma.currency)}</span>
                  </span>
                </div>
                <p className="text-slate-700">
                  <span className="font-medium">{r.claim.raisedBy}</span>
                  {r.claim.raisedRole ? ` (${r.claim.raisedRole})` : ''} en «{r.claim.phaseName}», {shortDate(r.claim.createdAt)}: “{r.claim.reason}”
                </p>
                {r.claim.appealReason && (
                  <p className="text-xs text-slate-500">Apelación de {r.claim.appealedBy}: “{r.claim.appealReason}”</p>
                )}
                {r.claim.status === 'abierto' && (
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <Button variant="secondary" size="sm" disabled={busy} icon={<i className="ri-scales-3-line" />} onClick={() => setAsk({ kind: 'appeal', row: r })}>
                      Apelar
                    </Button>
                    <Button variant="danger" size="sm" disabled={busy} icon={<i className="ri-restart-line" />} onClick={() => setAsk({ kind: 'restart', row: r })}>
                      Reiniciar liquidación
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      />
      {ask && (
        <ReasonModal
          title={`${TEXTS[ask.kind].title} · ${ask.row.proforma.number}`}
          label={TEXTS[ask.kind].label}
          confirmLabel={TEXTS[ask.kind].confirm}
          required={TEXTS[ask.kind].required}
          danger={TEXTS[ask.kind].danger}
          busy={busy}
          onConfirm={(t) => void confirm(t)}
          onClose={() => { if (!busy) setAsk(null); }}
        />
      )}
    </div>
  );
}
