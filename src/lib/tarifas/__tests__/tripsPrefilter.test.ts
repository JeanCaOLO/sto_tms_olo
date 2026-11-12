// @vitest-environment jsdom
//
// La bandeja de viajes por liquidar pide al servidor solo los que no tienen liquidación vigente y no
// están anulados, en vez de traer todo el historial y descartar en el cliente.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDataSource, type DataSource, type FindOptions } from '../data';
import { MemoryDataSource } from '../data/memory/driver';
import { listPendingTrips } from '../tripsDataSource';

class Espia implements DataSource {
  readonly kind = 'http' as const;
  consultas: { entity: string; options?: FindOptions }[] = [];
  private readonly json = new MemoryDataSource();
  find(entity: Parameters<DataSource['find']>[0], options?: FindOptions) { this.consultas.push({ entity, options }); return this.json.find(entity, options); }
  findOne(...a: Parameters<DataSource['findOne']>) { return this.json.findOne(...a); }
  insert(...a: Parameters<DataSource['insert']>) { return this.json.insert(...a); }
  update(...a: Parameters<DataSource['update']>) { return this.json.update(...a); }
  delete(...a: Parameters<DataSource['delete']>) { return this.json.delete(...a); }
  transaction<T>(fn: (tx: DataSource) => Promise<T>) { return this.json.transaction(fn); }
}

let espia: Espia;
beforeEach(() => { localStorage.clear(); espia = new Espia(); setDataSource(espia); });
afterEach(() => setDataSource(new MemoryDataSource()));

const columnasDeViajes = () => espia.consultas
  .filter((c) => c.entity === 'trip')
  .flatMap((c) => (c.options?.where ?? []).map((w) => `${w.column}:${w.op}`));

describe('prefiltro de la bandeja', () => {
  it('todos / incompletos: pide sin liquidación y sin anulados al servidor', async () => {
    await listPendingTrips('all', { countryId: 'VE' });
    expect(columnasDeViajes()).toEqual(expect.arrayContaining(['settlement_id:isNull', 'status:neq']));
  });

  it('listos: también pide sin liquidación al servidor', async () => {
    await listPendingTrips('ready', { countryId: 'VE' });
    expect(columnasDeViajes()).toEqual(expect.arrayContaining(['settlement_id:isNull', 'status:eq']));
  });

  it('el resultado es el mismo que descartar en el cliente: ningún viaje liquidado ni anulado', async () => {
    const trips = await listPendingTrips('all', { countryId: 'VE' });
    expect(trips.every((t) => !t.settlementId && t.status !== 'cancelled')).toBe(true);
  });
});
