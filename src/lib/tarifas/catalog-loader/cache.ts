// Caché del catálogo.
//
// Reglas, tarifarios, zonas y estructuras de costo cambian poco y calcular un viaje los volvía a traer
// enteros (~14 llamadas) en cada cálculo y en cada edición. Se guardan unos segundos y se descartan:
//   · al instante, cuando ESTA sesión escribe cualquier entidad del catálogo;
//   · por tiempo (TTL), para los cambios que hace otra persona.
// Las liquidaciones, los viajes y los pedidos NO pasan por acá: se leen siempre frescos.

import { onDataWrite, recordCatalog, type EntityName } from '../data';
import type { TarifasCatalog } from './types';

// 5 min: reglas, tarifarios y zonas casi no cambian, y sin `/batch` en el backend cada lectura del
// catálogo cuesta ~9 s (11 lecturas sueltas que se encolan). Lo que escribe esta sesión se descarta al instante.
const CATALOG_TTL_MS = 5 * 60_000;
const CATALOG_ENTITIES = new Set<EntityName>([
  'country', 'countrySettings', 'marginPolicy', 'pricingRule', 'pricingTemplate', 'zone', 'zoneGroup',
  'partyVariable', 'settlementParty', 'costStructure', 'costStructureRow', 'rateTable', 'rateTableRow',
]);
const catalogCache = new Map<string, { at: number; promise: Promise<TarifasCatalog> }>();

/** Descarta el catálogo guardado. Lo llaman las escrituras del catálogo y los tests. */
export function invalidateCatalogCache(): void {
  catalogCache.clear();
}

onDataWrite((touched) => {
  for (const entity of touched) {
    if (CATALOG_ENTITIES.has(entity)) {
      invalidateCatalogCache();
      return;
    }
  }
});

/**
 * El catálogo de `key`, de la caché si está vigente. `fresh` la salta (se usa antes de emitir, donde un
 * dato viejo se paga) pero deja lo leído guardado para que lo que se haga después ya parta de lo último.
 */
export async function cachedCatalog(
  key: string,
  fresh: boolean,
  fetchCatalog: () => Promise<TarifasCatalog>,
): Promise<TarifasCatalog> {
  const hit = catalogCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CATALOG_TTL_MS) {
    recordCatalog(true);
    return structuredClone(await hit.promise);
  }
  recordCatalog(false);

  const promise = fetchCatalog();
  const entry = { at: Date.now(), promise };
  catalogCache.set(key, entry);
  // Un fallo (falta configuración, red) no se guarda: el siguiente intento vuelve a leer.
  promise.catch(() => { if (catalogCache.get(key) === entry) catalogCache.delete(key); });
  return structuredClone(await promise);
}
