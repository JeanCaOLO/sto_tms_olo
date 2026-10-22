import Badge from '../../../components/base/Badge';
import { actionLabel, displayMessage } from './logLabels';
import type { OmsLogEntry, OmsLogLevel } from '../types';

const LEVEL_BADGE: Record<OmsLogLevel, 'default' | 'warning' | 'danger'> = {
  info: 'default',
  warn: 'warning',
  error: 'danger',
};

const esManual = (action: string) => action !== 'barrido';

interface LogDetailModalProps {
  log: OmsLogEntry;
  onClose: () => void;
}

// Detalle completo de una entrada de la bitácora del OMS. Se abre al dar clic en
// una fila de "Acciones del OMS", donde el mensaje va truncado por ancho.
export default function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  const detalle = log.detail == null
    ? null
    : typeof log.detail === 'string'
      ? log.detail
      : JSON.stringify(log.detail, null, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del log ${log.action}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900">{actionLabel(log.action)}</h3>
            <Badge variant={esManual(log.action) ? 'warning' : 'default'} size="sm">
              {esManual(log.action) ? 'Manual' : 'Automático'}
            </Badge>
            <Badge variant={LEVEL_BADGE[log.level]} size="sm">{log.level}</Badge>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
          <div className="flex justify-between"><span className="text-slate-500">Fecha</span><span className="text-slate-900">{log.createdAt}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Actor</span><span className="text-slate-900">{log.actor}</span></div>
          <div className="flex justify-between col-span-2"><span className="text-slate-500">Corrida</span><span className="text-slate-900 break-all">{log.corridaId ?? '—'}</span></div>
        </div>

        <div className="mb-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Mensaje</p>
          <p className="text-sm text-slate-900 whitespace-pre-wrap break-words">{displayMessage(log)}</p>
        </div>

        {detalle && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Detalle</p>
            <pre className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200 overflow-auto max-h-64 whitespace-pre-wrap break-all">
              {detalle}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
