import { originLabel } from './breakdownLabels';
import type { ExplainedLine } from '../../../lib/tarifas/explain';

interface Props {
  line: ExplainedLine;
  replacesCountry: boolean;
  hrefFor?: (origin: ExplainedLine['origen']) => string | null;
}

/** Etiqueta de origen de una regla y, si la pantalla lo permite, el enlace para abrirla. */
export function LineOrigin({ line, replacesCountry, hrefFor }: Props) {
  const origin = originLabel(line, replacesCountry);
  if (!origin) return null;
  const href = hrefFor?.(line.origen) ?? null;
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <span className={`px-1.5 py-0.5 rounded text-[10px] ${origin.tone}`}>{origin.text}</span>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="text-[10px] text-teal-600 hover:underline">
          Abrir
        </a>
      )}
    </div>
  );
}
