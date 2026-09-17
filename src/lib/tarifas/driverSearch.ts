// Búsqueda de conductor y su transportista.
//
// El caso real que hay que resolver: la guía física trae el NOMBRE y la CÉDULA del conductor, y
// casi nunca el nombre de la compañía. Quien liquida tiene que poder tipear cualquiera de esos dos
// datos y que el sistema le diga a qué transportista pertenece — y también al revés, elegir la
// compañía y ver solo sus conductores.
//
// Módulo PURO: recibe la lista de conductores, no la consulta. Así el orden de resultados se puede
// probar sin montar un componente ni tocar la base.

export interface DriverOption {
  id: string;
  fullName: string;
  /** Cédula o documento. Puede venir con guiones, puntos o espacios. */
  document: string | null;
  carrierId: string | null;
  /** Nombre del transportista, si tiene. */
  carrierName: string | null;
}

/** Por qué apareció este conductor en los resultados. La UI lo usa para explicar el match. */
export type MatchReason = 'document' | 'name' | 'carrier';

export interface DriverSearchResult {
  driver: DriverOption;
  matchedOn: MatchReason;
  score: number;
}

/**
 * Normaliza para comparar: sin tildes, en minúsculas y sin espacios de más. Sin esto, "José" no
 * encuentra a "Jose" y la mitad de las búsquedas fallan por un acento.
 */
export function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Deja solo los caracteres significativos de un documento. Las cédulas se escriben de mil formas
 * —"1-2345-6789", "1 2345 6789", "123456789"— y todas son la misma persona.
 */
export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/** ¿Alguna palabra del texto empieza con el término? Encuentra por apellido, no solo por nombre. */
function someWordStartsWith(text: string, term: string): boolean {
  return text.split(/\s+/).some((word) => word.startsWith(term));
}

// Prioridad de coincidencias, de la más concluyente a la más vaga. La cédula manda: es el dato que
// identifica a una persona sin ambigüedad, y es el que trae la guía física.
function scoreOf(driver: DriverOption, term: string, documentTerm: string): { score: number; matchedOn: MatchReason } | null {
  const doc = normalizeDocument(driver.document);
  const name = normalize(driver.fullName);
  const carrier = normalize(driver.carrierName);

  if (documentTerm) {
    if (doc && doc === documentTerm) return { score: 100, matchedOn: 'document' };
    if (doc && doc.startsWith(documentTerm)) return { score: 90, matchedOn: 'document' };
    if (doc && doc.includes(documentTerm)) return { score: 80, matchedOn: 'document' };
  }

  if (name === term) return { score: 75, matchedOn: 'name' };
  if (someWordStartsWith(name, term)) return { score: 70, matchedOn: 'name' };
  if (name.includes(term)) return { score: 60, matchedOn: 'name' };

  if (carrier && someWordStartsWith(carrier, term)) return { score: 50, matchedOn: 'carrier' };
  if (carrier && carrier.includes(term)) return { score: 40, matchedOn: 'carrier' };

  return null;
}

export interface SearchOptions {
  /** Restringe a los conductores de este transportista. */
  carrierId?: string | null;
  limit?: number;
}

/**
 * Busca por nombre, cédula o nombre del transportista, todo en la misma caja.
 *
 * El orden es TOTAL —puntaje, nombre, id— para que la misma búsqueda devuelva siempre lo mismo. Sin
 * el último criterio, dos conductores con el mismo puntaje aparecerían en el orden en que los
 * devolvió la base, y quien liquida vería la lista bailar entre búsquedas iguales.
 */
export function searchDrivers(
  drivers: DriverOption[],
  query: string,
  options: SearchOptions = {},
): DriverSearchResult[] {
  const scope = options.carrierId
    ? drivers.filter((d) => d.carrierId === options.carrierId)
    : drivers;

  const term = normalize(query);
  const limit = options.limit ?? 20;

  // Sin término de búsqueda se listan los del alcance, no cero resultados: al elegir una compañía,
  // lo esperable es ver sus conductores sin tener que escribir nada.
  if (!term) {
    return [...scope]
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((driver) => ({ driver, matchedOn: 'name' as const, score: 0 }));
  }

  const documentTerm = normalizeDocument(query);

  return scope
    .map((driver) => {
      const hit = scoreOf(driver, term, documentTerm);
      return hit ? { driver, ...hit } : null;
    })
    .filter((r): r is DriverSearchResult => r !== null)
    .sort((a, b) =>
      b.score - a.score
      || a.driver.fullName.localeCompare(b.driver.fullName)
      || a.driver.id.localeCompare(b.driver.id))
    .slice(0, limit);
}

/** Conductores de un transportista, en orden alfabético. Es el camino inverso del buscador. */
export function driversOfCarrier(drivers: DriverOption[], carrierId: string): DriverOption[] {
  return drivers
    .filter((d) => d.carrierId === carrierId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id));
}

/**
 * Conductores que NO tienen transportista asignado. En este dominio eso significa flota propia,
 * pero también puede ser un dato incompleto — por eso se pueden listar aparte en vez de esconderlos.
 */
export function driversWithoutCarrier(drivers: DriverOption[]): DriverOption[] {
  return drivers
    .filter((d) => !d.carrierId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id));
}
