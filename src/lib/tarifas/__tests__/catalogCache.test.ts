// @vitest-environment jsdom
//
// El catálogo (reglas, tarifarios, zonas, costos) se guarda unos segundos contra la API y se descarta
// cuando ESTA sesión escribe algo del catálogo. Lo transaccional (liquidaciones, viajes) no lo descarta.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpDataSource, notifyWrite, onDataWrite, setDataSource, type DataSource, type FindOptions } from '../data';
import { MemoryDataSource } from '../data/memory/driver';
import { invalidateCatalogCache, loadTarifasCatalog } from '../catalogLoader';

/** Un MemoryDataSource que se hace pasar por la API y cuenta las lecturas. */
class ApiFalsa implements DataSource {
  readonly kind = 'http' as const;
  lecturas = 0;
  private readonly json = new MemoryDataSource();
  find(entity: Parameters<DataSource['find']>[0], options?: FindOptions) { this.lecturas += 1; return this.json.find(entity, options); }
  findOne(entity: Parameters<DataSource['findOne']>[0], id: string) { this.lecturas += 1; return this.json.findOne(entity, id); }
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

describe('caché del catálogo contra la API', () => {
  it('la segunda carga del mismo país y perfil no lee nada', async () => {
    const a = await loadTarifasCatalog('VE', null);
    const tras1 = api.lecturas;
    expect(tras1).toBeGreaterThan(0);
    const b = await loadTarifasCatalog('VE', null);
    expect(api.lecturas).toBe(tras1);
    expect(b).toEqual(a);
  });

  it('cada llamador recibe su propia copia', async () => {
    const a = await loadTarifasCatalog('VE', null);
    a.rules.length = 0;
    const b = await loadTarifasCatalog('VE', null);
    expect(b.rules.length).toBeGreaterThan(0);
  });

  it('otro país u otro perfil es otra entrada', async () => {
    await loadTarifasCatalog('VE', null);
    const antes = api.lecturas;
    await loadTarifasCatalog('VE', 'otro-perfil');
    expect(api.lecturas).toBeGreaterThan(antes);
  });

  it('escribir una entidad del catálogo lo descarta', async () => {
    await loadTarifasCatalog('VE', null);
    const antes = api.lecturas;
    notifyWrite(['pricingRule']);
    await loadTarifasCatalog('VE', null);
    expect(api.lecturas).toBeGreaterThan(antes);
  });

  it('escribir liquidaciones o viajes NO lo descarta', async () => {
    await loadTarifasCatalog('VE', null);
    const antes = api.lecturas;
    notifyWrite(['settlement', 'auditLog', 'tripOrderMark']);
    await loadTarifasCatalog('VE', null);
    expect(api.lecturas).toBe(antes);
  });

  it('`fresh` salta la caché, lee de nuevo y deja lo leído guardado', async () => {
    await loadTarifasCatalog('VE', null);
    const antes = api.lecturas;
    await loadTarifasCatalog('VE', null, { fresh: true });
    expect(api.lecturas).toBeGreaterThan(antes);
    const tras = api.lecturas;
    await loadTarifasCatalog('VE', null); // la lectura fresca quedó en la caché
    expect(api.lecturas).toBe(tras);
  });

  it('un fallo no se guarda', async () => {
    await expect(loadTarifasCatalog('ZZ', null)).rejects.toThrow();
    const antes = api.lecturas;
    await expect(loadTarifasCatalog('ZZ', null)).rejects.toThrow();
    expect(api.lecturas).toBeGreaterThan(antes);
  });
});

describe('HttpDataSource avisa de sus escrituras', () => {
  const crear = () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })) as unknown as typeof fetch;
    return new HttpDataSource({ baseUrl: 'http://api.test', fetchImpl });
  };

  it('insert, update y delete avisan la entidad; leer no avisa', async () => {
    const avisos: string[][] = [];
    const baja = onDataWrite((e) => avisos.push([...e]));
    const ds = crear();
    await ds.find('pricingRule');
    await ds.insert('pricingRule', { code: 'A' });
    await ds.update('rateTable', 'x', { name: 'B' });
    await ds.delete('zoneGroup', 'x');
    baja();
    expect(avisos).toEqual([['pricingRule'], ['rateTable'], ['zoneGroup']]);
  });

  it('una transacción avisa una vez, al confirmar, con todas las entidades', async () => {
    const avisos: string[][] = [];
    const baja = onDataWrite((e) => avisos.push([...e].sort()));
    await crear().transaction(async (tx) => {
      await tx.insert('costStructure', { name: 'E' });
      await tx.insert('costStructureRow', { concept: 'C' });
      expect(avisos).toEqual([]); // todavía no se confirmó
    });
    baja();
    expect(avisos).toEqual([['costStructure', 'costStructureRow']]);
  });
});
