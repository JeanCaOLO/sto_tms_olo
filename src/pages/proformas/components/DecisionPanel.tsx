// Acciones sobre la proforma según quién mira y en qué punto va. El servidor vuelve a validar todo.

import Button from '../../../components/base/Button';
import {
  canApprove, currentPhase,
  type PhaseActor, type ProformaDetail,
} from '../../../lib/tarifas/proformas';

export type Ask = 'approve' | 'reject' | 'annul' | 'resubmit';

interface Props {
  detail: ProformaDetail;
  actor: PhaseActor | null;
  canEdit: boolean;
  busy: boolean;
  onAsk: (kind: Ask) => void;
}

export default function DecisionPanel({ detail, actor, canEdit, busy, onAsk }: Props) {
  const { proforma, phases } = detail;
  const current = currentPhase(phases);
  const myTurn = !!actor && !!current && canApprove(actor, current, phases);
  const rejected = proforma.status === 'Borrador' && phases.some((p) => p.state === 'rechazada');
  const open = proforma.status !== 'Anulado' && proforma.status !== 'Pagado';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!myTurn && proforma.status === 'En Revisión' && current && (
        <span className="mr-auto text-xs text-slate-500">Esperando a: {current.approverLabel}</span>
      )}
      {myTurn && (
        <>
          <Button variant="danger" disabled={busy} icon={<i className="ri-close-line" />} onClick={() => onAsk('reject')}>Rechazar</Button>
          <Button variant="success" disabled={busy} icon={<i className="ri-check-line" />} onClick={() => onAsk('approve')}>Aprobar fase</Button>
        </>
      )}
      {rejected && canEdit && (
        <Button disabled={busy} icon={<i className="ri-send-backward" />} onClick={() => onAsk('resubmit')}>Reenviar a revisión</Button>
      )}
      {open && canEdit && (
        <Button variant="secondary" disabled={busy} onClick={() => onAsk('annul')}>Anular proforma</Button>
      )}
    </div>
  );
}
