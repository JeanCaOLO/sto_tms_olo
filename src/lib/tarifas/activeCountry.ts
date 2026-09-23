// País activo del tarifador: el ámbito global del módulo.
//
// Antes, cada pestaña tenía su propio selector de país y arrancaba en el primero de la lista. Se
// podía estar mirando los costos de Venezuela y la política de margen de Colombia al mismo tiempo,
// y las listas mezclaban zonas, tasas y reglas de todos los países. Para quien liquida en un solo
// país, eso es ruido —y una fuente de errores caros.
//
// Ahora el país se elige UNA vez y todo el módulo queda acotado a él.
//
// Se implementa como un store mínimo con suscripción en vez de un contexto de React para no tener
// que envolver la aplicación entera: eso obligaría a tocar archivos compartidos con otros módulos.

const STORAGE_KEY = 'tarifas:pais-activo';

let activeCountryId: string | null = readStored();
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Sin localStorage (modo privado, SSR): se trabaja en memoria y no se recuerda entre sesiones.
    return null;
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getActiveCountryId(): string | null {
  return activeCountryId;
}

export function setActiveCountryId(countryId: string | null): void {
  if (activeCountryId === countryId) return;
  activeCountryId = countryId;
  try {
    if (countryId) localStorage.setItem(STORAGE_KEY, countryId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No es crítico: solo se pierde la preferencia entre sesiones.
  }
  notify();
}

export function subscribeActiveCountry(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * País que corresponde usar, dada la lista disponible.
 *
 * Si el guardado ya no existe —lo borraron, o se cambió de entorno— se cae al primero en vez de
 * dejar el módulo en un país fantasma que no filtra nada.
 */
export function resolveActiveCountry<T extends { id: string }>(
  countries: T[],
  stored: string | null,
): T | null {
  if (countries.length === 0) return null;
  return countries.find((c) => c.id === stored) ?? countries[0] ?? null;
}
