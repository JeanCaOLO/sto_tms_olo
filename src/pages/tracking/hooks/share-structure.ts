const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Devuelve `next` pero conservando las referencias de `prev` en todo lo que no cambió. Así un refresco con la misma
 * información no re-renderiza (ni recalcula memos) en teléfonos de gama baja; solo cambian los viajes que cambiaron.
 */
export function shareStructure<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  if (Array.isArray(prev) && Array.isArray(next)) {
    const merged = next.map((item, i) => shareStructure(prev[i], item));
    return (merged.length === prev.length && merged.every((item, i) => item === prev[i]) ? prev : merged) as T;
  }
  if (isObject(prev) && isObject(next) && !Array.isArray(prev) && !Array.isArray(next)) {
    const keys = Object.keys(next);
    const merged: Record<string, unknown> = {};
    for (const key of keys) merged[key] = shareStructure(prev[key], next[key]);
    const same = keys.length === Object.keys(prev).length && keys.every((key) => merged[key] === prev[key]);
    return (same ? prev : merged) as T;
  }
  return next;
}
