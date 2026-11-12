// @vitest-environment jsdom
//
// Paginación por cursor (`after`), historial de liquidaciones por páginas, fecha sin hora y el catálogo
// en dos idas y vueltas.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, setDataSource, type DataSource, type FindOptions, type FindRequest } from '../data';
import { MemoryDataSource } from '../data/memory/driver';
import { invalidateCatalogCache, loadTarifasCatalog } from '../catalogLoader';
import { dateOnly, listSettlementSummariesPage, listSettlements } from '../settlementsDataSource';

const sinCache = () => { localStorage.clear(); invalidateCatalogCache(); setDataSource(new MemoryDataSource()); };
afterEach(sinCache);

/** La semilla no trae liquidaciones: se siembran 5 con fechas y números distintos (una repetida a propósito). */
async function sembrar() {
  const [viaje] = await db().find('trip', { where: [{ column: 'country_id', op: 'eq', value: 'VE' }], limit: 1 });
  const fechas = ['2026-08-28', '2026-08-28', '2026-08-30', '2026-09-02', '2026-07-15'];
  for (const [n, fecha] of fechas.entries()) {
    await db().insert('settlement', {
      country_id: 'VE', trip_id: viaje.id, status: 'Anulado', number: `LIQ-VE-${String(n + 1).padStart(3, '0')}`,
      trip_number: `T${n}`, settlement_date: fecha, currency: 'VES', total_amount: '10',
    });
  }
}
beforeEach(async () => { sinCache(); await sembrar(); });

describe('after (driver JSON)', () => {
  const orden = [{ column: 'settlement_date', direction: 'desc' as const }, { column: 'number', direction: 'desc' as const }];

  it('descendente: trae lo que viene después del cursor, sin repetirlo', async () => {
    const db = new MemoryDataSource();
    const todas = await db.find('settlement', { orderBy: orden });
    expect(todas.length).toBeGreaterThan(2);
    const cursor = { settlement_date: todas[1].settlement_date, number: todas[1].number };

    const resto = await db.find('settlement', { orderBy: orden, after: cursor });
    expect(resto.map((r) => r.id)).toEqual(todas.slice(2).map((r) => r.id));
  });

  it('recorrer por páginas de 2 junta exactamente lo mismo que una sola lectura', async () => {
    const db = new MemoryDataSource();
    const todas = await db.find('settlement', { orderBy: orden });
    const vistas: string[] = [];
    let after: Record<string, unknown> | undefined;
    for (let vueltas = 0; vueltas < 50; vueltas += 1) {
      const pagina = await db.find('settlement', { orderBy: orden, limit: 2, ...(after ? { after } : {}) });
      vistas.push(...pagina.map((r) => r.id));
      if (pagina.length < 2) break;
      const ultima = pagina[pagina.length - 1];
      after = { settlement_date: ultima.settlement_date, number: ultima.number };
    }
    expect(vistas).toEqual(todas.map((r) => r.id));
  });

  it('rechaza un cursor que no coincide con el orden', async () => {
    await expect(new MemoryDataSource().find('settlement', { orderBy: orden, after: { number: 'x' } })).rejects.toThrow('after');
  });
});

describe('historial de liquidaciones por páginas', () => {
  it('pide una de más para saber si hay siguiente y devuelve el cursor', async () => {
    const todas = await listSettlements({ countryId: 'VE' });
    expect(todas.length).toBeGreaterThan(2);

    const primera = await listSettlementSummariesPage({ countryId: 'VE' }, { limit: 2 });
    expect(primera.rows.map((s) => s.id)).toEqual(todas.slice(0, 2).map((s) => s.id));
    expect(primera.next).toEqual({ settlement_date: todas[1].settlementDate, number: todas[1].number });

    const segunda = await listSettlementSummariesPage({ countryId: 'VE' }, { limit: 2, after: primera.next });
    expect(segunda.rows.map((s) => s.id)).toEqual(todas.slice(2, 4).map((s) => s.id));
  });

  it('la última página no trae cursor', async () => {
    const todas = await listSettlements({ countryId: 'VE' });
    const pagina = await listSettlementSummariesPage({ countryId: 'VE' }, { limit: todas.length + 5 });
    expect(pagina.rows).toHaveLength(todas.length);
    expect(pagina.next).toBeNull();
  });

  it('las páginas livianas no traen las columnas pesadas', async () => {
    const { rows } = await listSettlementSummariesPage({ countryId: 'VE' }, { limit: 1 });
    expect(rows[0].trace).toEqual([]);
  });
});

describe('dateOnly', () => {
  it.each([
    ['2026-08-28', '2026-08-28'],
    ['2026-08-28T00:00:00.000Z', '2026-08-28'],
    [null, ''],
    [undefined, ''],
  ])('%s -> %s', (entrada, esperado) => expect(dateOnly(entrada)).toBe(esperado));
});

describe('el catálogo se lee en dos idas y vueltas', () => {
  /** API simulada: cuenta idas y vueltas (una find suelta o un findMany = una). */
  class Contador implements DataSource {
    readonly kind = 'http' as const;
    idas = 0;
    sueltas = 0;
    tandas: number[] = [];
    private readonly json = new MemoryDataSource();
    async find(entity: Parameters<DataSource['find']>[0], options?: FindOptions) { this.idas += 1; this.sueltas += 1; return this.json.find(entity, options); }
    async findMany(requests: FindRequest[]) {
      this.idas += 1;
      this.tandas.push(requests.length);
      return Promise.all(requests.map((r) => this.json.find(r.entity, r.options)));
    }
    findOne(entity: Parameters<DataSource['findOne']>[0], id: string) { this.idas += 1; return this.json.findOne(entity, id); }
    insert(...a: Parameters<DataSource['insert']>) { return this.json.insert(...a); }
    update(...a: Parameters<DataSource['update']>) { return this.json.update(...a); }
    delete(...a: Parameters<DataSource['delete']>) { return this.json.delete(...a); }
    transaction<T>(fn: (tx: DataSource) => Promise<T>) { return this.json.transaction(fn); }
  }

  it('2 idas y vueltas como máximo, sin lecturas sueltas', async () => {
    const api = new Contador();
    setDataSource(api);
    const catalogo = await loadTarifasCatalog('VE', null);
    expect(catalogo.rules.length).toBeGreaterThan(0);
    expect(api.sueltas).toBe(0);
    expect(api.idas).toBeLessThanOrEqual(2);
  });

  it('da el mismo catálogo que leyendo cada tabla por separado (driver JSON)', async () => {
    setDataSource(new Contador());
    const agrupado = await loadTarifasCatalog('VE', null);
    invalidateCatalogCache();
    setDataSource(new MemoryDataSource());
    const suelto = await loadTarifasCatalog('VE', null);
    expect(agrupado).toEqual(suelto);
  });
});
