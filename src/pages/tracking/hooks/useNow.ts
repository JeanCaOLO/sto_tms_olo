import { useEffect, useState } from 'react';

const TICK_MS = 30_000;

/**
 * "Ahora" para las antigüedades ("hace X"): avanza solo cada 30 s y al llegar datos nuevos (`bump`), así la
 * etiqueta no se congela si el refresco falla. `clock` es el reloj real o el simulado del modo mock.
 */
export function useNow(clock: () => number, bump: unknown): number {
  const [now, setNow] = useState(clock);
  useEffect(() => { setNow(clock()); }, [clock, bump]);
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), TICK_MS);
    return () => clearInterval(timer);
  }, [clock]);
  return now;
}
