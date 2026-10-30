// Indicador de liquidación irregular: círculo con un signo de exclamación amarillo. Sin alertas no se muestra
// nada (todo en verde). El tooltip lista qué revisar antes de aprobar.

import type { IrregularFlag } from '../../../lib/tarifas/proformas';

interface Props {
  flags: IrregularFlag[];
  /** Texto previo al listado, p. ej. "2 de 5 liquidaciones con alertas". */
  summary?: string;
}

export default function IrregularBadge({ flags, summary }: Props) {
  if (flags.length === 0) return null;
  const title = [summary ?? 'Revisar a detalle antes de aprobar', ...flags.map((f) => `• ${f.label}`)].join('\n');
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-amber-500 bg-amber-50 text-[11px] font-bold leading-none text-amber-500"
    >
      !
    </span>
  );
}
