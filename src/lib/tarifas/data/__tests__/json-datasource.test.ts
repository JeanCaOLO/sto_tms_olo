// @vitest-environment jsdom
//
// jsdom (no node) porque el driver JSON persiste en localStorage: sin él, `persist()` es un no-op
// y no se estaría probando la persistencia real, que es justo lo que puede romperse.

import { beforeEach, describe, expect, it } from 'vitest';
import { JsonDataSource } from '../json-datasource';
import { AppendOnlyError, ForeignKeyError, NotFoundError } from '../datasource';

const db = new JsonDataSource();

/** Fila mínima válida de compañía a liquidar, para los casos que solo necesitan "una entidad". */
function party(id: string, name: string, countryId = 'CR') {
  return {
    id,
    country_id: countryId,
    classification: 'OUTSOURCED',
    code: id,
    name,
    tax_id: null,
    tax_id_type: null,
    carrier_id: null,
    contact_name: null,
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
  };
}

beforeEach(() => {
  // Vuelve a la semilla embebida: sin clave en localStorage, `loadDatabase()` la clona.
  localStorage.clear();
});

describe('JsonDataSource — consultas', () => {
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
    const byIn = await db.find('country', { where: [{ column: 'iso2', op: 'in', value: ['CR', 'CO'] }] });
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
});

describe('JsonDataSource — escrituras', () => {
  it('insert genera el id con el prefijo de la entidad y persiste', async () => {
    const created = await db.insert('zone', {
      country_id: 'CR',
      zone_group_id: 'ZG_CR_VALLE',
      code: 'HER',
      name: 'Heredia',
      status: 'active',
    });

    expect(created.id).toMatch(/^zone_/);
    // Una instancia nueva lee de localStorage: si no persistió, esto falla.
    expect(await new JsonDataSource().findOne('zone', created.id)).toMatchObject({ code: 'HER' });
  });

  it('insert respeta un id provisto', async () => {
    const created = await db.insert('settlementParty', party('CARRIER_X', 'Transportes X'));
    expect(created.id).toBe('CARRIER_X');
  });

  it('insert rechaza un id duplicado', async () => {
    await expect(
      db.insert('settlementParty', party('CARRIER_VE_1', 'Duplicado', 'VE')),
    ).rejects.toThrow(ForeignKeyError);
  });

  it('update mezcla los campos y nunca cambia el id', async () => {
    const updated = await db.update('zone', 'Z_CR_SJO', { name: 'San José (capital)', id: 'OTRO_ID' });
    expect(updated.id).toBe('Z_CR_SJO');
    expect(updated.name).toBe('San José (capital)');
    expect(updated.code).toBe('SJO'); // campo no enviado: se conserva
    expect(await db.findOne('zone', 'OTRO_ID')).toBeNull();
  });

  it('update falla con NotFoundError si el id no existe', async () => {
    await expect(db.update('zone', 'NO_EXISTE', { name: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('delete elimina y persiste', async () => {
    const fila = await db.insert('rateTableRow', {
      table_id: 'RT_ZONAS_CR', key: ['SJO', 'LIM'], amount: '1', row_order: 99, active: true,
    });
    await db.delete('rateTableRow', fila.id);
    expect(await new JsonDataSource().findOne('rateTableRow', fila.id)).toBeNull();
  });
});

describe('JsonDataSource — integridad referencial derivada del esquema', () => {
  it('insert rechaza una FK que apunta a una fila inexistente', async () => {
    await expect(
      db.insert('zone', { country_id: 'PAIS_FANTASMA', code: 'X', name: 'X', status: 'active' }),
    ).rejects.toThrow(ForeignKeyError);
  });

  it('delete rechaza borrar un tarifario usado por... nada: la FK protege al revés', async () => {
    // Las zonas dejaron de estar protegidas por una FK del esquema cuando las tarifas zona-a-zona
    // se absorbieron en los tarifarios: un tarifario guarda el CÓDIGO de la zona (que es lo que el
    // motor compara) y un código no es una clave foránea. Esa protección se repuso a mano en
    // `localRulesDataSource.deleteZone` y se prueba en `zoneDeletion.test.ts`.
    //
    // Acá se sigue probando la maquinaria de FK del esquema, con un par que sí la tiene.
    await expect(db.delete('settlementParty', 'CARRIER_CR_1')).rejects.toThrow(ForeignKeyError);
    expect(await db.findOne('settlementParty', 'CARRIER_CR_1')).not.toBeNull();
  });

  it('el error de FK usa el código 23503, que es el que la UI ya reconoce', async () => {
    await expect(db.delete('settlementParty', 'CARRIER_CR_1')).rejects.toMatchObject({ code: '23503' });
  });

  it('delete de un grupo de zona pone en null la FK de sus zonas (onDelete: set null)', async () => {
    await db.delete('zoneGroup', 'ZG_CR_VALLE');
    const sjo = await db.findOne('zone', 'Z_CR_SJO');
    expect(sjo?.zone_group_id).toBeNull();
  });

  it('delete permite borrar una zona que nadie referencia', async () => {
    await db.delete('zone', 'Z_CR_SIN_ZONA');
    expect(await db.findOne('zone', 'Z_CR_SIN_ZONA')).toBeNull();
  });
});

describe('JsonDataSource — append-only', () => {
  it('la bitácora acepta insert', async () => {
    const row = await db.insert('auditLog', {
      entity: 'zone',
      entity_id: 'Z_CR_SJO',
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

describe('JsonDataSource — transacciones', () => {
  it('confirma todo junto', async () => {
    await db.transaction(async (tx) => {
      await tx.insert('settlementParty', party('TX_1', 'Uno'));
      await tx.insert('settlementParty', party('TX_2', 'Dos'));
    });

    const fresh = new JsonDataSource();
    expect(await fresh.findOne('settlementParty', 'TX_1')).not.toBeNull();
    expect(await fresh.findOne('settlementParty', 'TX_2')).not.toBeNull();
  });

  it('no persiste nada si algo falla a mitad de camino', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert('settlementParty', party('TX_3', 'Tres'));
        throw new Error('falla simulada después de la primera escritura');
      }),
    ).rejects.toThrow('falla simulada');

    // La primera escritura no debe haber sobrevivido.
    expect(await new JsonDataSource().findOne('settlementParty', 'TX_3')).toBeNull();
  });

  it('una violación de FK dentro de la transacción deja todo sin efecto', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert('settlementParty', party('TX_4', 'Cuatro'));
        await tx.insert('zone', { country_id: 'PAIS_FANTASMA', code: 'X', name: 'X', status: 'active' });
      }),
    ).rejects.toThrow(ForeignKeyError);

    expect(await new JsonDataSource().findOne('settlementParty', 'TX_4')).toBeNull();
  });

  it('las escrituras de la transacción son visibles dentro de ella antes de confirmar', async () => {
    await db.transaction(async (tx) => {
      await tx.insert('settlementParty', party('TX_5', 'Cinco'));
      expect(await tx.findOne('settlementParty', 'TX_5')).not.toBeNull();
      // Pero no para quien lee el almacén persistido todavía.
      expect(await new JsonDataSource().findOne('settlementParty', 'TX_5')).toBeNull();
    });
    expect(await new JsonDataSource().findOne('settlementParty', 'TX_5')).not.toBeNull();
  });
});
