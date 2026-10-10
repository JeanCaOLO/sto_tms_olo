// @vitest-environment jsdom
//
// La semilla de demostración (`data/memory/seed.demo.json`, generada por scripts/build-demo-seed.ts)
// es lo que ve quien trabaja en modo mock. Este test impide que se desactualice sin avisar: si el
// esquema o el motor cambian y la semilla deja de calcular, falla acá y no en la pantalla.

import { beforeEach, describe, expect, it } from 'vitest';
import demoSeed from '../data/memory/seed.demo.json';
import { MemoryDataSource } from '../data/memory/driver';
import { COLLECTIONS, setSeed } from '../data/memory/store';
import { MOCK_COUNTRY_IDS } from '../data/memory/mockIds';
import { setDataSource } from '../data';
import { AppendOnlyError, ForeignKeyError, ReadOnlyEntityError, UniqueViolationError } from '../data/datasource';
import { ENTITY_NAMES, entityDef } from '../data/schema';
import { invalidateCatalogCache } from '../catalogLoader';
import { calculateTrip } from '../tripSettlement';
import { listPendingTrips, listTrips } from '../tripsDataSource';
import { listSettlements } from '../settlementsDataSource';

const COUNTRIES = ['CR', 'VE', 'CO'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  setSeed(demoSeed);
  setDataSource(new MemoryDataSource());
  invalidateCatalogCache();
});

describe('semilla de demostración — cobertura', () => {
  it('trae todas las colecciones del almacén, con filas', () => {
    for (const collection of COLLECTIONS) {
      const rows = (demoSeed as Record<string, unknown>)[collection];
      expect(Array.isArray(rows), collection).toBe(true);
      expect((rows as unknown[]).length, `${collection} vacía`).toBeGreaterThan(0);
    }
  });

  it('cada entidad del esquema tiene su colección en la semilla', () => {
    for (const name of ENTITY_NAMES) {
      expect(COLLECTIONS, name).toContain(entityDef(name).collection);
    }
  });

  it('cubre los estados de liquidación y las variantes de viaje de Costa Rica', async () => {
    const estados = new Set((await listSettlements({ countryId: MOCK_COUNTRY_IDS.CR })).map((s) => s.status));
    expect([...estados].sort()).toEqual(['Anulado', 'Aprobado', 'Borrador', 'En Revisión', 'Pagado']);

    const viajes = await listTrips({ countryId: MOCK_COUNTRY_IDS.CR });
    expect(new Set(viajes.map((v) => v.status))).toEqual(new Set(['completed', 'planned', 'in_progress', 'cancelled']));
    expect((await listPendingTrips('incomplete', { countryId: MOCK_COUNTRY_IDS.CR })).length).toBeGreaterThan(0);
    expect(viajes.some((v) => v.returnCount > 0)).toBe(true);
    expect(viajes.some((v) => v.durationHours > 24)).toBe(true);
  });

  it.each(['VE', 'CO'] as const)('%s trae viajes de todos los estados y liquidaciones', async (code) => {
    const countryId = MOCK_COUNTRY_IDS[code];
    const viajes = await listTrips({ countryId });
    expect(new Set(viajes.map((v) => v.status)).has('completed')).toBe(true);
    expect(new Set(viajes.map((v) => v.status)).has('planned')).toBe(true);
    expect(new Set(viajes.map((v) => v.status)).has('in_progress')).toBe(true);
    expect(viajes.some((v) => v.isOwnFleet)).toBe(true);
    expect(viajes.some((v) => !v.isOwnFleet && v.carrierId)).toBe(true);
    expect((await listSettlements({ countryId })).length).toBeGreaterThan(0);
  });
});

describe('semilla de demostración — cálculo', () => {
  it.each(COUNTRIES)('todo viaje completado de %s con zona calcula sin errores que bloqueen', async (code) => {
    const countryId = MOCK_COUNTRY_IDS[code];
    const completados = (await listTrips({ countryId })).filter((v) => v.status === 'completed' && v.carrierId && v.destZoneId);
    expect(completados.length).toBeGreaterThan(6);
    for (const viaje of completados) {
      const r = await calculateTrip(viaje.id, { customVars: {} }, { allowSettled: true });
      expect(r.status, viaje.routeNumber).toBe('ok');
      if (r.status === 'ok') {
        expect(r.calculation.blockingIssues, viaje.routeNumber).toEqual([]);
        expect(Number(r.calculation.result.totalLiquidado), viaje.routeNumber).toBeGreaterThan(0);
      }
    }
  }, 60_000); // decenas de cálculos completos; con la suite en paralelo los 5 s por defecto no alcanzan
});

describe('semilla de demostración — viajes que el motor bloquea', () => {
  it.each(COUNTRIES)('%s trae un viaje sin zona de destino que no se puede emitir', async (code) => {
    const sinZona = (await listTrips({ countryId: MOCK_COUNTRY_IDS[code] }))
      .filter((v) => v.status === 'completed' && v.carrierId && !v.destZoneId);
    expect(sinZona.length).toBeGreaterThan(0);
    const r = await calculateTrip(sinZona[0].id, { customVars: {} }, { allowSettled: true });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.calculation.blockingIssues.map((i) => i.message).join(' ')).toMatch(/no tiene zona de destino/);
    }
  });
});

describe('semilla de demostración — ids uuid', () => {
  it('toda columna uuid del registro de esquema trae un uuid o null', () => {
    const bad: string[] = [];
    for (const name of ENTITY_NAMES) {
      const def = entityDef(name);
      const rows = (demoSeed as unknown as Record<string, Record<string, unknown>[]>)[def.collection] ?? [];
      for (const [column, spec] of Object.entries(def.columns)) {
        if (spec.type !== 'uuid') continue;
        for (const row of rows) {
          const value = row[column];
          if (value !== null && value !== undefined && !UUID.test(String(value))) bad.push(`${name}.${column}=${String(value)}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('los ids de país coinciden con los del contexto operativo mock', () => {
    const ids = (demoSeed.countries as { id: string; code: string }[]).map((c) => [c.code, c.id]);
    expect(Object.fromEntries(ids)).toEqual(MOCK_COUNTRY_IDS);
  });
});

describe('semilla de demostración — integridad del CRUD en el mock', () => {
  const db = () => new MemoryDataSource();

  it('crea, edita y borra una regla', async () => {
    const [rule] = await db().find('pricingRule', { where: [{ column: 'country_id', op: 'eq', value: MOCK_COUNTRY_IDS.CR }], limit: 1 });
    const created = await db().insert('pricingRule', { ...rule, id: 'RULE_TEST_1', code: 'R_TEST' });
    expect(created.id).toBe('RULE_TEST_1');
    const edited = await db().update('pricingRule', 'RULE_TEST_1', { name: 'Editada' });
    expect(edited.name).toBe('Editada');
    await db().delete('pricingRule', 'RULE_TEST_1');
    expect(await db().findOne('pricingRule', 'RULE_TEST_1')).toBeNull();
  });

  it('rechaza una regla con un perfil que no existe', async () => {
    const [rule] = await db().find('pricingRule', { limit: 1 });
    await expect(db().insert('pricingRule', { ...rule, id: 'RULE_TEST_2', party_id: 'NO_EXISTE' })).rejects.toBeInstanceOf(ForeignKeyError);
  });

  it('rechaza un segundo perfil para el mismo transportista', async () => {
    const [party] = await db().find('settlementParty', { limit: 1 });
    await expect(db().insert('settlementParty', { ...party, id: 'PARTY_DUP' })).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it('borrar un tarifario borra sus filas', async () => {
    const [table] = await db().find('rateTable', { where: [{ column: 'code', op: 'eq', value: 'ZONAS' }], limit: 1 });
    const antes = await db().find('rateTableRow', { where: [{ column: 'table_id', op: 'eq', value: table.id }] });
    expect(antes.length).toBeGreaterThan(0);
    await db().delete('rateTable', String(table.id));
    expect(await db().find('rateTableRow', { where: [{ column: 'table_id', op: 'eq', value: table.id }] })).toEqual([]);
  });

  it('la bitácora es solo-agregar y los viajes son de solo lectura', async () => {
    const [entry] = await db().find('auditLog', { limit: 1 });
    await expect(db().delete('auditLog', String(entry.id))).rejects.toBeInstanceOf(AppendOnlyError);
    const [trip] = await db().find('trip', { limit: 1 });
    await expect(db().update('trip', String(trip.id), { route_number: 'X' })).rejects.toBeInstanceOf(ReadOnlyEntityError);
  });
});
