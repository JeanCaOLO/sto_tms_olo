// Antes de emitir se recalcula SIN cachés y se avisa si el resultado cambió.
//
// Navegar usa catálogo y perfil de hasta unos minutos; pagar no. Si otra persona cambió una tarifa,
// una regla o un pedido en ese rato, se muestra lo nuevo y se pide confirmar en vez de emitir con el
// valor viejo.

import { formatMoney } from '../../../lib/tarifas/format';
import { recheckBeforeEmit } from '../../../lib/tarifas/tripSettlement';
import type { useCalculationState } from './useCalculationState';
import type { useBaseOverride } from './useBaseOverride';

interface Props {
  calc: ReturnType<typeof useCalculationState>;
  base: ReturnType<typeof useBaseOverride>;
  reliquidando: boolean;
  setError: (message: string) => void;
  /** Los números de línea pudieron cambiar: se descartan las líneas destildadas. */
  resetExcluded: () => void;
}

/** Devuelve una función que dice si se puede emitir (true) o si hay que revisar lo nuevo (false). */
export function useRecheckBeforeEmit({ calc, base, reliquidando, setError, resetExcluded }: Props) {
  return async (): Promise<boolean> => {
    const shown = calc.calculation;
    if (!shown) return false;
    const check = await recheckBeforeEmit(shown, calc.editsUsed.current, {
      allowSettled: reliquidando,
      baseOverride: base.baseUsed.current ? { method: base.baseUsed.current } : null,
    });
    if (check.status === 'failed') { setError(check.message); return false; }
    if (check.status === 'same') return true;
    const antes = formatMoney(shown.result.totalLiquidado, shown.result.currency);
    const ahora = formatMoney(check.calculation.result.totalLiquidado, check.calculation.result.currency);
    calc.tripRead.current = check.calculation.trip;
    calc.setCalculation(check.calculation);
    resetExcluded();
    setError(
      'Las tarifas, reglas o pedidos cambiaron mientras revisaba esta liquidación. '
      + `Total anterior ${antes}, total actual ${ahora}. Revise el desglose y emita de nuevo.`,
    );
    return false;
  };
}
