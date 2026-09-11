import { useCallback, useEffect, useState } from 'react';
import type { Row, RouteSystem } from './registry';

export type RouteSystemStatus = 'loading' | 'ready' | 'not-generated' | 'error';

const cache = new Map<string, Row[]>();

/**
 * Carga el JSON estático de un sistema de rutas desde
 * `public/data/route-systems/`. Distingue "aún no generado" (404) de error real.
 * Cachea en memoria por sistema para que cambiar de pestaña no re-descargue.
 */
export function useRouteSystem(system: RouteSystem | undefined, pais?: string) {
  const [status, setStatus] = useState<RouteSystemStatus>('loading');
  const [rows, setRows] = useState<Row[]>([]);
  const [nonce, setNonce] = useState(0);

  // Los sistemas con `loader` (EFLOW) dependen del país → la clave de cache lo incluye.
  const key = system ? `${system.id}:${system.loader ? pais ?? '' : ''}` : '';

  const reload = useCallback(() => {
    if (key) cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  useEffect(() => {
    if (!system) return;
    const cached = cache.get(key);
    if (cached) {
      setRows(cached);
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');

    // Carga en vivo desde EFLOW (según país activo).
    if (system.loader) {
      system.loader()
        .then((list) => {
          if (cancelled) return;
          cache.set(key, list);
          setRows(list);
          setStatus('ready');
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('useRouteSystem(loader):', err);
          setStatus('error');
        });
      return () => {
        cancelled = true;
      };
    }

    const url = `${import.meta.env.BASE_URL}data/route-systems/${system.file}`;
    fetch(url)
      .then((res) => {
        if (res.status === 404) return { notGenerated: true as const };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data && (data as { notGenerated?: boolean }).notGenerated) {
          setStatus('not-generated');
          return;
        }
        const list = Array.isArray(data) ? (data as Row[]) : [];
        cache.set(key, list);
        setRows(list);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('useRouteSystem:', err);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [system, nonce, key]);

  return { status, rows, reload };
}
