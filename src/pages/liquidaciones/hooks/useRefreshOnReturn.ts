// Al volver a la pestaña después de un rato se relee la bandeja: otra persona pudo liquidar o cambiar
// viajes. Es una sola lectura y solo cuando la pestaña vuelve a ser visible, no un sondeo.

import { useEffect, useRef } from 'react';

/** Si la pestaña estuvo oculta más de esto, al volver se relee la bandeja. */
const REFRESH_ON_RETURN_MS = 60_000;

/** Devuelve `markLoaded`: avisa que se acaba de leer (reinicia la cuenta). */
export function useRefreshOnReturn(refresh: () => void, deps: unknown[]) {
  const lastLoadAt = useRef(Date.now());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { lastLoadAt.current = Date.now(); }, deps);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastLoadAt.current < REFRESH_ON_RETURN_MS) return;
      lastLoadAt.current = Date.now();
      refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return () => { lastLoadAt.current = Date.now(); };
}
