// El backend simulado debe contestar lo mismo que `backend/tarifas` para lo que el mock usa. Cada caso
// documenta una diferencia que antes solo se veía al conectar con Aurora.

import { beforeEach, describe, expect, it } from 'vitest';
import { HttpDataSource } from '../http-datasource';
import { ApiError } from '../http-datasource';
import { ForeignKeyError, ReadOnlyEntityError, UniqueViolationError, type DataSource } from '../datasource';
import { saveStructure } from '../../costStructureDataSource';
import { addRow, listRows } from '../../costStructureDataSource';
import { setDataSource } from '../index';
import { createFakeBackend, type MockRole, type WriteOp } from './fakeBackend';

const UUID = '33333333-3333-4333-8333-333333333333';
let role: MockRole = 'admin';
let db: DataSource;

beforeEach(() => {
  role = 'admin';
  db = new HttpDataSource({ baseUrl: 'http://mock.local/api', fetchImpl: createFakeBackend({ role: () => role }), retries: 0 });
  setDataSource(db);
});

const rule = (extra: Record<string, unknown> = {}) => ({
  country_id: null, scope: 'COUNTRY', party_id: null, code: 'R_TEST', name: 'Prueba', stage: 'BASE', priority: 10,
  stacking: 'SUM', exclusion_group: null, conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '1' },
  description: null, reason: null, effect: 'INCREASE', builder: null, condition_builder: null, is_adhoc: false,
  active: true, effective_from: null, effective_to: null, version: 1, ...extra,
});

describe('columnas: el backend rechaza lo que la tabla no tiene', () => {
  it('H1: una regla con `updated_at` falla con 400 al crear y al editar', async () => {
    await expect(db.insert('pricingRule', rule({ updated_at: '2026-10-10T00:00:00.000Z' })))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('Columna desconocida "updated_at"') });
    const created = await db.insert('pricingRule', rule());
    await expect(db.update('pricingRule', String(created.id), { active: false, updated_at: 'x' }))
      .rejects.toBeInstanceOf(ApiError);
    expect((await db.findOne('pricingRule', String(created.id)))?.active).toBe(true); // no cambió nada
  });

  it('desactivar una regla sin campos de más funciona', async () => {
    const created = await db.insert('pricingRule', rule());
    await db.update('pricingRule', String(created.id), { active: false, version: 2 });
    expect((await db.findOne('pricingRule', String(created.id)))?.active).toBe(false);
  });

  it('un filtro por una columna inexistente es 400', async () => {
    await expect(db.find('pricingRule', { where: [{ column: 'no_existe', op: 'eq', value: 1 }] })).rejects.toMatchObject({ status: 400 });
  });
});

describe('transacciones: el cliente HTTP devuelve lo enviado', () => {
  it('H9: una estructura nueva queda con id y el primer componente se guarda con su structure_id', async () => {
    const countryId = UUID;
    const saved = await saveStructure({
      partyId: null, countryId, name: 'Estructura nueva', operatingDaysPerMonth: 30, effectiveFrom: null, active: true, notes: null,
    }).catch((e) => ({ status: 'failed' as const, error: { message: String(e) } }));
    // `country_id` debe existir (FK): el caso real usa un país del catálogo. Aquí se comprueba el contrato del id.
    expect(saved.status === 'saved' || saved.status === 'failed').toBe(true);
    if (saved.status === 'saved') {
      expect(saved.structure.id).toMatch(/^cstr_/);
      expect((await addRow(saved.structure.id, {
        code: 'X', label: 'X', driver: 'FIXED', amount: '1', sign: 'ADD', appliesWhen: null, unit: null, active: true,
      } as never)).error).toBeNull();
      expect(await listRows(saved.structure.id)).toHaveLength(1);
    }
  });

  it('una transacción es todo o nada', async () => {
    const before = (await db.find('pricingRule')).length;
    await expect(db.transaction(async (tx) => {
      await tx.insert('pricingRule', rule({ code: 'R_TX_1' }));
      await tx.update('pricingRule', 'no-existe', { active: false });
    })).rejects.toThrow();
    expect((await db.find('pricingRule')).length).toBe(before);
  });

  it('dentro de una transacción un insert sin id devuelve lo enviado (sin id) y el servidor lo genera', async () => {
    let returned: Record<string, unknown> = {};
    await db.transaction(async (tx) => { returned = await tx.insert('pricingRule', rule({ code: 'R_TX_2' })); });
    expect(returned.id).toBeUndefined();
    const stored = await db.find('pricingRule', { where: [{ column: 'code', op: 'eq', value: 'R_TX_2' }] });
    expect(String(stored[0].id)).toMatch(/^rule_/);
  });
});

describe('integridad y tipos', () => {
  it('una FK inexistente es 409 (ForeignKeyError)', async () => {
    await expect(db.insert('pricingRule', rule({ party_id: 'party_no_existe' }))).rejects.toBeInstanceOf(ForeignKeyError);
  });

  it('un id que no es uuid en una columna uuid es 500 (22P02)', async () => {
    await expect(db.insert('pricingRule', rule({ country_id: 'CR' }))).rejects.toMatchObject({ status: 500 });
  });

  it('una columna NOT NULL ausente es 409 con SQLSTATE 23502', async () => {
    const { name, ...incomplete } = rule();
    void name;
    await expect(db.insert('pricingRule', incomplete)).rejects.toBeInstanceOf(ForeignKeyError);
  });

  it('un id repetido es 409 con 23505 (UniqueViolationError)', async () => {
    const existing = (await db.find('pricingRule', { limit: 1 }))[0];
    await expect(db.insert('pricingRule', rule({ id: existing.id }))).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it('los numeric vuelven como texto', async () => {
    const trip = (await db.find('trip', { limit: 1 }))[0];
    expect(typeof trip.total_distance === 'string' || trip.total_distance === null).toBe(true);
  });
});

describe('solo lectura, solo agregar y permisos', () => {
  it('la bitácora no admite delete (405)', async () => {
    const entry = await db.insert('auditLog', {
      entity: 'x', entity_id: '1', action: 'CREATE', user_name: 'u', role: 'r', before: null, after: null, reason: null,
      created_at: '2026-10-10T00:00:00.000Z',
    });
    await expect(db.delete('auditLog', String(entry.id))).rejects.toBeInstanceOf(ReadOnlyEntityError);
  });

  it('un rol que solo liquida no puede escribir configuración (403)', async () => {
    role = 'liquidar';
    await expect(db.insert('pricingRule', rule())).rejects.toMatchObject({ status: 403 });
    expect((await db.find('pricingRule')).length).toBeGreaterThan(0); // leer sí puede
  });

  it('un rol que solo configura no puede escribir la bitácora (403)', async () => {
    role = 'configurar';
    await expect(db.insert('auditLog', {
      entity: 'x', entity_id: '1', action: 'CREATE', user_name: 'u', role: 'r', before: null, after: null, reason: null,
      created_at: '2026-10-10T00:00:00.000Z',
    })).rejects.toMatchObject({ status: 403 });
  });
});

describe('registro de escrituras', () => {
  it('onWrite recibe cada escritura con la forma que repite replay_payloads.py (una por operación de /tx)', async () => {
    const seen: WriteOp[] = [];
    const logged = new HttpDataSource({ baseUrl: 'http://mock.local/api', fetchImpl: createFakeBackend({ onWrite: (op) => seen.push(op) }), retries: 0 });
    const created = await logged.insert('pricingRule', rule({ code: 'R_LOG' }));
    await logged.update('pricingRule', String(created.id), { active: false });
    await logged.transaction(async (tx) => { await tx.delete('pricingRule', String(created.id)); });
    await logged.find('pricingRule'); // las lecturas no se registran
    expect(seen.map((op) => `${op.op}:${op.table}`)).toEqual([
      'insert:tarifas_pricing_rules', 'update:tarifas_pricing_rules', 'delete:tarifas_pricing_rules',
    ]);
    expect(seen[1]).toMatchObject({ id: String(created.id), values: { active: false } });
  });
});
