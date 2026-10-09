import { describe, expect, it } from 'vitest';
import { prefetchTripCatalog } from '../tripSettlement';

describe('prefetchTripCatalog', () => {
  it('nunca lanza: si no hay catálogo para el país, el cálculo real mostrará el error', async () => {
    await expect(prefetchTripCatalog({ carrierId: 'no-existe', countryId: 'pais-inexistente' })).resolves.toBeUndefined();
  });

  it('acepta un viaje sin transportista', async () => {
    await expect(prefetchTripCatalog({ carrierId: null, countryId: 'pais-inexistente' })).resolves.toBeUndefined();
  });
});
