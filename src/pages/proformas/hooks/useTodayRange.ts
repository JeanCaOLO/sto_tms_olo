import { useEffect } from 'react';
import { rangeFor, toDateKey, type DateRange } from '../../../lib/tarifas/proformas';

/**
 * Mantiene vigente el rango "Hoy": se calcula al abrir la pantalla y, sin esto, pasada la medianoche seguía
 * mostrando ayer. Revisa cada minuto y al volver a la pestaña; un rango que el usuario eligió (semana, mes,
 * propio, todo) no se toca.
 */
export function useTodayRange(range: DateRange, setRange: (range: DateRange) => void) {
  useEffect(() => {
    if (range.preset !== 'today') return undefined;
    const check = () => {
      if (range.from !== toDateKey(new Date())) setRange(rangeFor('today'));
    };
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [range, setRange]);
}
