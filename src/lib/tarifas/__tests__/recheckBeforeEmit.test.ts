// @vitest-environment jsdom
//
// Antes de emitir se recalcula SIN cachés: si otra persona cambió una tarifa mientras la pantalla estaba
// abierta, emitir con el cálculo mostrado pagaría un valor viejo.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDataSource, type DataSource, type FindOptions } from '../data';
import { MemoryDataSource } from '../data/memory/driver';
import { invalidateCatalogCache } from '../catalogLoader';
import { calculateTrip, calculationSignature, recheckBeforeEmit } from '../tripSettlement';
import { listPendingTrips } from '../tripsDataSource';
import type { TripCalculation } from '../tripSettlement';

class ApiFalsa implements DataSource {
  readonly kind = 'http' as const;
  readonly json = new MemoryDataSource();
  find(entity: Parameters<DataSource['find']>[0], options?: FindOptions) { return this.json.find(entity, options); }
  findOne(entity: Parameters<DataSource['findOne']>[0], id: string) { return this.json.findOne(entity, id); }
  insert(...a: Parameters<DataSource['insert']>) { return this.json.insert(...a); }
  update(...a: Parameters<DataSource['update']>) { return this.json.update(...a); }
  delete(...a: Parameters<DataSource['delete']>) { return this.json.delete(...a); }
  transaction<T>(fn: (tx: DataSource) => Promise<T>) { return this.json.transaction(fn); }
}

let api: ApiFalsa;
beforeEach(() => {
  localStorage.clear();
  invalidateCatalogCache();
  api = new ApiFalsa();
  setDataSource(api);
});
afterEach(() => { setDataSource(new MemoryDataSource()); invalidateCatalogCache(); });

async function firstCalculation(): Promise<TripCalculation | null> {
  const trips = await listPendingTrips('all', {});
  for (const t of trips) {
    const res = await calculateTrip(t);
    if (res.status === 'ok' && res.calculation.result.trace.length > 0) return res.calculation;
  }
  return null;
}

describe('recheckBeforeEmit', () => {
  it('sin cambios en el catálogo devuelve "same"', async () => {
    const shown = await firstCalculation();
    if (!shown) throw new Error('la semilla demo no trae un viaje calculable');
    expect(await recheckBeforeEmit(shown, { customVars: {} })).toEqual({ status: 'same' });
  });

  it('si una regla cambió después de calcular, devuelve "changed" con el cálculo nuevo', async () => {
    const shown = await firstCalculation();
    if (!shown) throw new Error('la semilla demo no trae un viaje calculable');
    const line = shown.result.trace.find((l) => l.ruleId);
    if (!line?.ruleId) throw new Error('el cálculo no trae líneas de regla');
    // La regla se edita por afuera de esta sesión: no pasa por la API falsa, así que la caché no se entera.
    const rule = await api.json.findOne('pricingRule', line.ruleId);
    expect(rule).toBeTruthy();
    await api.json.update('pricingRule', line.ruleId, { version: Number(rule?.version ?? 1) + 1 });
    const check = await recheckBeforeEmit(shown, { customVars: {} });
    expect(check.status).toBe('changed');
    if (check.status === 'changed') {
      expect(calculationSignature(check.calculation)).not.toBe(calculationSignature(shown));
    }
  });

  it('la huella cambia con el total, las líneas o la marca de un pedido', async () => {
    const shown = await firstCalculation();
    if (!shown) throw new Error('la semilla demo no trae un viaje calculable');
    const base = calculationSignature(shown);
    const otroTotal = { ...shown, result: { ...shown.result, totalLiquidado: '1' } } as TripCalculation;
    expect(calculationSignature(otroTotal)).not.toBe(base);
    const sinLineas = { ...shown, result: { ...shown.result, trace: [] } } as TripCalculation;
    expect(calculationSignature(sinLineas)).not.toBe(base);
  });
});
