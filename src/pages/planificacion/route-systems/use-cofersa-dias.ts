import { useEffect, useState } from 'react';
import { cargaCofersaDias, type CofersaDia } from './cofersa-dias';

export type CofersaDiasStatus = 'loading' | 'ready' | 'error';

// Cache en módulo: el select de Nueva Ruta puede montar/desmontar varias veces
// y el calendario COFERSA es estático dentro de una sesión.
let cache: CofersaDia[] | null = null;

/**
 * Hook fino para el flujo de Nueva Ruta: carga el calendario COFERSA una vez.
 * Si falla el fetch, `status: 'error'` y `data: []` → el select cae al listado
 * plano sin agrupar (no bloquea la creación de rutas).
 */
export function useCofersaDias(): { data: CofersaDia[]; status: CofersaDiasStatus } {
  const [data, setData] = useState<CofersaDia[]>(cache ?? []);
  const [status, setStatus] = useState<CofersaDiasStatus>(cache ? 'ready' : 'loading');

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    cargaCofersaDias()
      .then((list) => {
        if (cancelled) return;
        cache = list;
        setData(list);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('useCofersaDias:', err);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, status };
}
