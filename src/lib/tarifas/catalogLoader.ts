// Todo lo que el motor necesita saber para tarifar un viaje, leído de una vez.
//
// Es la mitad IMPURA del armado: acá se lee —SIEMPRE por la capa de datos, `db()`— y nada más. La
// mitad pura —combinar esto con un viaje y producir la entrada del motor— vive en
// `settlementInput.ts`. Por eso el Probador y la liquidación comparten el armado sin compartir de
// dónde sale el viaje, que es lo único que legítimamente difiere.
//
// Desde 2026-10-02 (ROADMAP §8) el país y las zonas son del catálogo del TMS (entidades externas);
// lo que el cálculo necesita y el catálogo no tiene —redondeo, umbral de pernocta, grupos de zona—
// sigue siendo del tarifador. Nada de esto se lee "por fuera" del ORM.

import { cachedCatalog } from './catalog-loader/cache';
import { fetchCatalog } from './catalog-loader/fetch';
import type { TarifasCatalog } from './catalog-loader/types';

// Re-exportar para compatibilidad hacia atrás.
export { loadCountries, loadCountry } from './catalog-loader/country';
export { loadZoneGroups, loadZones } from './catalog-loader/zones';
export { invalidateCatalogCache } from './catalog-loader/cache';
export { CatalogError, type TarifasCatalog } from './catalog-loader/types';

/**
 * Carga todo lo necesario para tarifar un viaje de este país y este perfil de cálculo.
 *
 * Lanza cuando falta algo sin lo cual no hay cálculo posible —el país o su configuración, sus
 * parámetros de costo o su política de margen—, con un mensaje que dice dónde configurarlo.
 * Devolver un catálogo a medias produciría un total plausible calculado sobre huecos.
 *
 * Se guarda unos minutos (ver `catalog-loader/cache.ts`); `fresh` fuerza la lectura.
 */
export async function loadTarifasCatalog(
  countryId: string,
  partyId: string | null,
  options: { fresh?: boolean } = {},
): Promise<TarifasCatalog> {
  return cachedCatalog(`${countryId}|${partyId ?? ''}`, options.fresh ?? false, () =>
    fetchCatalog(countryId, partyId),
  );
}
