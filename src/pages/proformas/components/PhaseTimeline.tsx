// Línea de tiempo de las fases: quién aprobó cuándo, quién falta y qué fases se quitaron.

import Badge from '../../../components/base/Badge';
import { currentPhase, type PhaseState, type ProformaPhase } from '../../../lib/tarifas/proformas';

const STATE: Record<PhaseState, { label: string; variant: 'default' | 'success' | 'danger' | 'warning'; icon: string }> = {
  pendiente: { label: 'Pendiente', variant: 'default', icon: 'ri-time-line' },
  aprobada: { label: 'Aprobada', variant: 'success', icon: 'ri-checkbox-circle-line' },
  rechazada: { label: 'Rechazada', variant: 'danger', icon: 'ri-close-circle-line' },
  omitida: { label: 'Quitada', variant: 'warning', icon: 'ri-skip-forward-line' },
};

interface Props {
  phases: ProformaPhase[];
  /** Solo superadministrador: botón para quitar una fase pendiente. */
  onSkip?: (phase: ProformaPhase) => void;
  /** false = la proforma ya no está en revisión (anulada, aprobada…): ninguna fase va "en curso". */
  reviewing?: boolean;
}

export default function PhaseTimeline({ phases, onSkip, reviewing = true }: Props) {
  const current = reviewing ? currentPhase(phases) : null;
  return (
    <ol className="space-y-2">
      {[...phases].sort((a, b) => a.position - b.position).map((p) => {
        const meta = STATE[p.state];
        const isCurrent = current?.id === p.id;
        return (
          <li key={p.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${isCurrent ? 'border-teal-300 bg-teal-50' : 'border-slate-200'}`}>
            <i className={`${meta.icon} mt-0.5 text-lg text-slate-500`} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{p.position}. {p.name}</span>
                <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                {isCurrent && <span className="text-xs text-teal-700">En curso</span>}
              </div>
              <div className="text-xs text-slate-500">
                Aprueba: {p.approverLabel} {p.approverType === 'role' ? '(cualquier usuario del rol)' : '(usuario específico)'}
              </div>
              {p.decidedBy && (
                <div className="text-xs text-slate-500">
                  {p.state === 'omitida' ? 'Quitada por' : 'Decidida por'} {p.decidedBy}
                  {p.decidedAt ? ` · ${p.decidedAt.slice(0, 16).replace('T', ' ')}` : ''}
                </div>
              )}
              {p.comment && <div className="text-xs text-slate-600">“{p.comment}”</div>}
            </div>
            {onSkip && p.state === 'pendiente' && (
              <button type="button" className="text-xs text-amber-700 hover:underline cursor-pointer" onClick={() => onSkip(p)}>
                Quitar fase
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
