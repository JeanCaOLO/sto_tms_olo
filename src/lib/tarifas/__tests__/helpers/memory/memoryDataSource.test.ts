import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDataSource } from './driver';
import { resetToSeed } from './store';
import {
  AppendOnlyError,
  ForeignKeyError,
  NotFoundError,
  ReadOnlyEntityError,
  UniqueViolationError,
} from '../../../data/datasource';

const db = new MemoryDataSource();

/** Liquidación mínima válida de un viaje, para los casos de unicidad. */
function settlement(id: string, tripId: string, status = 'Borrador') {
  return {
    id,
    country_id: 'VE',
    trip_id: tripId,
    party_id: 'CARRIER_VE_1',
    number: id,
    trip_number: 'V-TEST',
    settlement_date: '2026-09-01',
    status,
    currency: 'USD',
    total_amount: '100.00',
    trip_info: {},
    trip_edits: {},
    trip: {},
    trace: [],
    discarded: [],
    stage_subtotals: {},
    warnings: [],
    overrides: [],
    adhoc_rules: [],
    excluded_seqs: [],
    returns: [],
    superseded_by: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  resetToSeed();
});

describe('MemoryDataSource — consultas', () => {
  it('find sin opciones devuelve la colección completa', async () => {
    expect(await db.find('country')).toHaveLength(3);
  });

  it('find filtra por igualdad', async () => {
    const zones = await db.find('zone', { where: [{ column: 'country_id', op: 'eq', value: 'CR' }] });
    expect(zones.map((z) => z.code).sort()).toEqual(['ALA', 'LIB', 'PUN', 'SIN_ZONA', 'SJO']);
  });

  it('find combina condiciones con AND', async () => {
    const rules = await db.find('pricingRule', {
      where: [
        { column: 'country_id', op: 'eq', value: 'VE' },
        { column: 'stage', op: 'eq', value: 'SURCHARGE' },
      ],
    });
    expect(rules.every((r) => r.country_id === 'VE' && r.stage === 'SURCHARGE')).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('find soporta in, gt y notNull', async () => {
    const byIn = await db.find('country', { where: [{ column: 'code', op: 'in', value: ['CR', 'CO'] }] });
    expect(byIn).toHaveLength(2);

    const byGt = await db.find('pricingRule', { where: [{ column: 'priority', op: 'gt', value: 30 }] });
    expect(byGt.every((r) => r.priority > 30)).toBe(true);

    const notNull = await db.find('pricingRule', { where: [{ column: 'exclusion_group', op: 'notNull' }] });
    expect(notNull.every((r) => r.exclusion_group !== null)).toBe(true);
    expect(notNull.length).toBeGreaterThan(0);
  });

  it('orderBy con locale ordena alfabéticamente', async () => {
    const countries = await db.find('country', { orderBy: [{ column: 'name', locale: true }] });
    expect(countries.map((c) => c.name)).toEqual(['Colombia', 'Costa Rica', 'Venezuela']);
  });

  it('orderBy encadena criterios: primero stage, después priority', async () => {
    const rules = await db.find('pricingRule', {
      where: [{ column: 'country_id', op: 'eq', value: 'VE' }],
      orderBy: [{ column: 'stage', locale: true }, { column: 'priority' }],
    });
    const surcharges = rules.filter((r) => r.stage === 'SURCHARGE').map((r) => r.priority);
    expect(surcharges).toEqual([...surcharges].sort((a, b) => a - b));
  });

  it('limit y offset paginan', async () => {
    const all = await db.find('country', { orderBy: [{ column: 'name', locale: true }] });
    const page = await db.find('country', {
      orderBy: [{ column: 'name', locale: true }],
      limit: 1,
      offset: 1,
    });
    expect(page).toHaveLength(1);
    expect(page[0].name).toBe(all[1].name);
  });

  it('findOne devuelve null cuando el id no existe', async () => {
    expect(await db.findOne('country', 'NO_EXISTE')).toBeNull();
    expect((await db.findOne('country', 'CR'))?.name).toBe('Costa Rica');
  });

  it('los viajes se leen por la misma capa y se filtran por estado', async () => {
    const completados = await db.find('trip', { where: [{ column: 'status', op: 'eq', value: 'completed' }] });
    const todos = await db.find('trip');
    expect(completados.length).toBeGreaterThan(0);
    expect(completados.length).toBeLessThan(todos.length); // hay al menos uno planificado
  });
});

describe('MemoryDataSource — escrituras', () => {
  it('insert genera el id con el prefijo de la entidad y persiste', async () => {
    const created = await db.insert('zoneGroup', {
      country_id: 'CR',
      code: 'NORTE',
      name: 'Norte',
      zone_codes: ['LIB'],
      status: 'active',
    });

    expect(created.id).toMatch(/^zg_/);
    // Una instancia nueva lee del mismo estado: si no se guardó, esto falla.
    expect(await new MemoryDataSource().findOne('zoneGroup', created.id)).toMatchObject({ code: 'NORTE' });
  });

  it('insert respeta un id provisto', async () => {
    const created = await db.insert('partyVariable', {
      id: 'PV_X', party_id: 'CARRIER_VE_1', key: 'custom:x', label: 'X', kind: 'NUMBER',
      origin: 'PER_TRIP', default_value: '0', unit: null, active: true,
    });
    expect(created.id).toBe('PV_X');
  });

  it('insert rechaza un id duplicado', async () => {
    await expect(
      db.insert('settlementParty', { id: 'CARRIER_VE_1', carrier_id: 'CARRIER_VE_2', status: 'active', notes: null }),
    ).rejects.toThrow(ForeignKeyError);
  });

  it('update mezcla los campos y nunca cambia el id', async () => {
    const updated = await db.update('zoneGroup', 'ZG_CR_VALLE', { name: 'Valle Central', id: 'OTRO_ID' });
    expect(updated.id).toBe('ZG_CR_VALLE');
    expect(updated.name).toBe('Valle Central');
    expect(await db.findOne('zoneGroup', 'OTRO_ID')).toBeNull();
  });

  it('update falla con NotFoundError si el id no existe', async () => {
    await expect(db.update('zoneGroup', 'NO_EXISTE', { name: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('delete elimina y persiste', async () => {
    const fila = await db.insert('rateTableRow', {
      table_id: 'RT_ZONAS_CR', key: ['SJO', 'LIM'], amount: '1', row_order: 99, active: true,
    });
    await db.delete('rateTableRow', fila.id);
    expect(await new MemoryDataSource().findOne('rateTableRow', fila.id)).toBeNull();
  });
});

describe('MemoryDataSource — entidades externas (TMS), solo lectura', () => {
  it.each(['trip', 'carrier', 'driver', 'vehicle', 'zone', 'country'] as const)(
    'rechaza insert, update y delete sobre "%s"',
    async (entity) => {
      const [row] = await db.find(entity);
      await expect(db.insert(entity, { name: 'x' })).rejects.toThrow(ReadOnlyEntityError);
      await expect(db.update(entity, row.id, { name: 'x' })).rejects.toThrow(ReadOnlyEntityError);
      await expect(db.delete(entity, row.id)).rejects.toThrow(ReadOnlyEntityError);
    },
  );

  it('el rechazo no deja nada escrito', async () => {
    const antes = await db.find('trip');
    await expect(db.delete('trip', antes[0].id)).rejects.toMatchObject({ code: 'READ_ONLY' });
    expect(await new MemoryDataSource().find('trip')).toHaveLength(antes.length);
  });

  it('dentro de una transacción también se rechaza', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.update('carrier', 'CARRIER_VE_1', { name: 'otro' });
      }),
    ).rejects.toThrow(ReadOnlyEntityError);
  });
});

describe('MemoryDataSource — integridad referencial derivada del esquema', () => {
  it('insert rechaza una FK que apunta a una fila inexistente (también hacia el TMS)', async () => {
    await expect(
      db.insert('zoneGroup', { country_id: 'PAIS_FANTASMA', code: 'X', name: 'X', zone_codes: [], status: 'active' }),
    ).rejects.toThrow(ForeignKeyError);
    await expect(
      db.insert('settlement', settlement('S_FANTASMA', 'VIAJE_FANTASMA')),
    ).rejects.toThrow(ForeignKeyError);
  });

  it('delete rechaza borrar un perfil en uso por una liquidación (RESTRICT)', async () => {
    await db.insert('settlement', settlement('S_EN_USO', 'TRIP_RT_VE_A1'));
    await expect(db.delete('settlementParty', 'CARRIER_VE_1')).rejects.toThrow(ForeignKeyError);
    expect(await db.findOne('settlementParty', 'CARRIER_VE_1')).not.toBeNull();
  });

  it('el error de FK usa el código 23503, que es el que la UI ya reconoce', async () => {
    await db.insert('settlement', settlement('S_EN_USO', 'TRIP_RT_VE_A1'));
    await expect(db.delete('settlementParty', 'CARRIER_VE_1')).rejects.toMatchObject({ code: '23503' });
  });

  it('delete de un tarifario se lleva sus filas (onDelete: cascade)', async () => {
    const filas = await db.find('rateTableRow', { where: [{ column: 'table_id', op: 'eq', value: 'RT_ZONAS_CR' }] });
    expect(filas.length).toBeGreaterThan(0);
    await db.delete('rateTable', 'RT_ZONAS_CR');
    expect(await db.find('rateTableRow', { where: [{ column: 'table_id', op: 'eq', value: 'RT_ZONAS_CR' }] })).toEqual([]);
  });
});

describe('MemoryDataSource — unicidad', () => {
  it('un transportista tiene un solo perfil de cálculo (unique)', async () => {
    await expect(
      db.insert('settlementParty', { carrier_id: 'CARRIER_VE_1', status: 'active', notes: null }),
    ).rejects.toThrow(UniqueViolationError);
  });

  it('un viaje tiene una sola liquidación vigente (índice único parcial)', async () => {
    const [viaje] = await db.find('trip', { where: [{ column: 'status', op: 'eq', value: 'completed' }] });
    await db.insert('settlement', settlement('S1', viaje.id));
    await expect(db.insert('settlement', settlement('S2', viaje.id))).rejects.toMatchObject({ code: '23505' });
  });

  it('una anulada no cuenta: se puede emitir otra para el mismo viaje', async () => {
    const [viaje] = await db.find('trip', { where: [{ column: 'status', op: 'eq', value: 'completed' }] });
    await db.insert('settlement', settlement('S1', viaje.id));
    await db.update('settlement', 'S1', { status: 'Anulado' });
    await expect(db.insert('settlement', settlement('S2', viaje.id))).resolves.toMatchObject({ id: 'S2' });
  });

  it('des-anular una liquidación con otra vigente choca', async () => {
    const [viaje] = await db.find('trip', { where: [{ column: 'status', op: 'eq', value: 'completed' }] });
    await db.insert('settlement', settlement('S1', viaje.id, 'Anulado'));
    await db.insert('settlement', settlement('S2', viaje.id));
    await expect(db.update('settlement', 'S1', { status: 'Borrador' })).rejects.toThrow(UniqueViolationError);
  });
});

describe('MemoryDataSource — append-only', () => {
  it('la bitácora acepta insert', async () => {
    const row = await db.insert('auditLog', {
      entity: 'zoneGroup',
      entity_id: 'ZG_CR_VALLE',
      action: 'UPDATE',
      user_name: 'tester',
      role: 'ADMIN',
      before: null,
      after: null,
      reason: null,
      created_at: '2026-09-14T10:00:00.000Z',
    });
    expect(row.id).toMatch(/^audit_/);
  });

  it('la bitácora rechaza update y delete', async () => {
    await expect(db.update('auditLog', 'x', { action: 'DELETE' })).rejects.toThrow(AppendOnlyError);
    await expect(db.delete('auditLog', 'x')).rejects.toThrow(AppendOnlyError);
  });
});

describe('MemoryDataSource — transacciones', () => {
  const variable = (id: string) => ({
    id, party_id: 'CARRIER_VE_1', key: `custom:${id.toLowerCase()}`, label: id, kind: 'NUMBER',
    origin: 'PER_TRIP', default_value: '0', unit: null, active: true,
  });

  it('confirma todo junto', async () => {
    await db.transaction(async (tx) => {
      await tx.insert('partyVariable', variable('TX_1'));
      await tx.insert('partyVariable', variable('TX_2'));
    });

    const fresh = new MemoryDataSource();
    expect(await fresh.findOne('partyVariable', 'TX_1')).not.toBeNull();
    expect(await fresh.findOne('partyVariable', 'TX_2')).not.toBeNull();
  });

  it('no persiste nada si algo falla a mitad de camino', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert('partyVariable', variable('TX_3'));
        throw new Error('falla simulada después de la primera escritura');
      }),
    ).rejects.toThrow('falla simulada');

    expect(await new MemoryDataSource().findOne('partyVariable', 'TX_3')).toBeNull();
  });

  it('una violación de FK dentro de la transacción deja todo sin efecto', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert('partyVariable', variable('TX_4'));
        await tx.insert('zoneGroup', { country_id: 'PAIS_FANTASMA', code: 'X', name: 'X', zone_codes: [], status: 'active' });
      }),
    ).rejects.toThrow(ForeignKeyError);

    expect(await new MemoryDataSource().findOne('partyVariable', 'TX_4')).toBeNull();
  });

  it('las escrituras de la transacción son visibles dentro de ella antes de confirmar', async () => {
    await db.transaction(async (tx) => {
      await tx.insert('partyVariable', variable('TX_5'));
      expect(await tx.findOne('partyVariable', 'TX_5')).not.toBeNull();
      // Pero no para quien lee el almacén persistido todavía.
      expect(await new MemoryDataSource().findOne('partyVariable', 'TX_5')).toBeNull();
    });
    expect(await new MemoryDataSource().findOne('partyVariable', 'TX_5')).not.toBeNull();
  });
});
