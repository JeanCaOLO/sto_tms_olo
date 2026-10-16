import type { ReactNode } from 'react';
import { HintProvider } from '../base/HintProvider';
import { TARIFADOR_HINTS } from '../../lib/tarifas/hints';

/** Activa las descripciones al pasar el ratón en las pantallas del tarifador. */
export default function TarifadorHints({ children }: { children: ReactNode }) {
  return <HintProvider hints={TARIFADOR_HINTS}>{children}</HintProvider>;
}
