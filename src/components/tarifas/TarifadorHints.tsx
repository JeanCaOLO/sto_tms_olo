import type { ReactNode } from 'react';
import { HintProvider } from '../base/HintProvider';
import { TARIFADOR_HINTS } from '../../lib/tarifas/hints';
import MockRoleSwitch from '../feature/MockRoleSwitch';

/** Activa las descripciones al pasar el ratón en las pantallas del tarifador (y, en modo mock, el selector de rol de prueba). */
export default function TarifadorHints({ children }: { children: ReactNode }) {
  return (
    <HintProvider hints={TARIFADOR_HINTS}>
      {children}
      <MockRoleSwitch />
    </HintProvider>
  );
}
