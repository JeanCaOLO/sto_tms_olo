// Búsqueda universal de viajes: el filtro local lo hace la tabla al instante; acá se amplía, con una
// pausa al escribir, a los viajes que tienen un pedido con esa guía, código o casa comercial.

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchTripIdsByOrder } from '../../../lib/tarifas/tripsDataSource';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 3;

export function useTripSearch(search: (term: string) => Promise<Set<string>> = searchTripIdsByOrder) {
  const [term, setTerm] = useState('');
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const text = term.trim();
    const mine = ++seq.current;
    if (text.length < SEARCH_MIN_CHARS) {
      setIds((prev) => (prev.size === 0 ? prev : new Set()));
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await search(text);
        if (mine === seq.current) setIds(found);
      } catch {
        // La búsqueda local sigue valiendo: si falla la remota, solo faltan los viajes por pedido.
        if (mine === seq.current) setIds(new Set());
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, search]);

  const onSearchChange = useCallback((value: string) => setTerm(value), []);
  /** ¿El viaje tiene un pedido que coincide con lo buscado? */
  const hasMatchingOrder = useCallback((tripId: string) => ids.has(tripId), [ids]);

  return { onSearchChange, hasMatchingOrder, searching };
}
