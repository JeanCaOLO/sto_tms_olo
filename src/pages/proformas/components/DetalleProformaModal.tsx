// Detalle de una proforma: liquidaciones, fases y decisión. Todo cambio pasa por useProformaDetail.

import { useState } from 'react';
import Modal from '../../../components/base/Modal';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import { formatMoney } from '../../../lib/tarifas/format';
import { canEditItems, currentPhase, isSuperAdmin, phaseLabel, type PhaseActor, type ProformaPhase } from '../../../lib/tarifas/proformas';
import { useProformaDetail } from '../hooks/useProformaDetail';
import DecisionPanel, { type Ask } from './DecisionPanel';
import EnviarProformaModal from './EnviarProformaModal';
import PhaseTimeline from './PhaseTimeline';
import ProformaItemsTable from './ProformaItemsTable';
import ReasonModal from './ReasonModal';

type Pending =
  | { kind: Ask }
  | { kind: 'skip'; phase: ProformaPhase }
  | { kind: 'exclude'; settlementId: string };

const TEXTS: Record<Pending['kind'], { title: string; label: string; confirm: string; required: boolean; danger?: boolean }> = {
  approve: { title: 'Aprobar fase', label: 'Comentario (opcional)', confirm: 'Aprobar', required: false },
  reject: { title: 'Rechazar proforma', label: 'Motivo del rechazo', confirm: 'Rechazar', required: true, danger: true },
  annul: { title: 'Anular proforma', label: 'Motivo de la anulación', confirm: 'Anular', required: true, danger: true },
  resubmit: { title: 'Reenviar a revisión', label: 'Comentario (opcional)', confirm: 'Reenviar', required: false },
  skip: { title: 'Quitar fase', label: 'Motivo para quitar esta fase de la proforma', confirm: 'Quitar fase', required: true },
  exclude: { title: 'Excluir liquidación', label: 'Motivo de la exclusión', confirm: 'Excluir', required: true },
};

interface Props {
  proformaId: string;
  actor: PhaseActor | null;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function DetalleProformaModal({ proformaId, actor, canEdit, onClose, onChanged }: Props) {
  const { detail, error, busy, decide, toggleItem, refresh } = useProformaDetail(proformaId, onChanged);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);

  async function confirm(text: string) {
    if (!pending) return;
    const comment = text || undefined;
    const ok = pending.kind === 'exclude'
      ? await toggleItem(pending.settlementId, false, text)
      : await decide(
        pending.kind === 'skip' ? { action: 'skip', phaseId: pending.phase.id, comment }
          : pending.kind === 'approve' || pending.kind === 'reject'
            ? { action: pending.kind, phaseId: currentPhase(detail?.phases ?? [])?.id, comment }
            : { action: pending.kind, comment },
      );
    if (ok) setPending(null);
  }

  const proforma = detail?.proforma;
  const editable = !!detail && canEdit && canEditItems(detail.proforma, detail.phases);
  const texts = pending ? TEXTS[pending.kind] : null;

  return (
    <>
    {/* Con un motivo pendiente, Esc cierra solo ese diálogo y no el detalle. */}
    <Modal isOpen title="Detalle de proforma" onClose={() => { if (!pending && !sending) onClose(); }} widthClass="max-w-4xl">
      <div className="space-y-5 p-6">
        {!detail && !error && <div className="py-10 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {detail && proforma && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">{proforma.number} · {proforma.carrierName}</h2>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <Badge variant="info" size="sm">{phaseLabel(proforma.status, detail.phases)}</Badge>
                  <span>Creada por {proforma.createdBy}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Total de lo incluido</div>
                <div className="text-2xl font-semibold text-slate-900">{formatMoney(String(proforma.totalAmount), proforma.currency)}</div>
              </div>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Liquidaciones</h3>
              <ProformaItemsTable
                detail={detail} canToggle={editable} busy={busy}
                onInclude={(id) => void toggleItem(id, true, null)}
                onExclude={(id) => setPending({ kind: 'exclude', settlementId: id })}
              />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Fases de aprobación</h3>
              <PhaseTimeline
                phases={detail.phases}
                reviewing={proforma.status === 'En Revisión'}
                onSkip={isSuperAdmin(actor?.roleName) && proforma.status === 'En Revisión' ? (phase) => setPending({ kind: 'skip', phase }) : undefined}
              />
            </section>

            <DecisionPanel detail={detail} actor={actor} canEdit={canEdit} busy={busy} onAsk={(kind) => setPending({ kind })} />
          </>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          {proforma?.status === 'Aprobado' && canEdit && (
            <Button icon={<i className="ri-mail-send-line" />} onClick={() => setSending(true)}>
              {proforma.emailSentAt ? 'Reenviar por correo' : 'Enviar por correo'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
    {sending && detail && (
      <EnviarProformaModal detail={detail} onClose={() => setSending(false)} onSent={() => { setSending(false); void refresh(); }} />
    )}
    {pending && texts && (
      <ReasonModal
        title={texts.title} label={texts.label} confirmLabel={texts.confirm}
        required={texts.required} danger={texts.danger} busy={busy}
        onConfirm={(text) => void confirm(text)} onClose={() => setPending(null)}
      />
    )}
    </>
  );
}
