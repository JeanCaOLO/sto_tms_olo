interface Props {
  percent: number;
  failed?: number;
  total?: number;
  className?: string;
}

/** Barra de avance del viaje. Si hay fallidas, se pintan en rojo al final del tramo cerrado. */
export default function ProgressBar({ percent, failed = 0, total = 0, className = '' }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const failedPercent = total > 0 ? Math.min(clamped, Math.round((failed * 100) / total)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={`h-2 w-full rounded-full bg-slate-100 overflow-hidden flex ${className}`}
    >
      <div className="h-full bg-emerald-500" style={{ width: `${clamped - failedPercent}%` }} />
      {failedPercent > 0 && <div className="h-full bg-red-400" style={{ width: `${failedPercent}%` }} />}
    </div>
  );
}
