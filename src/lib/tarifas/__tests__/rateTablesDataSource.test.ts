// @vitest-environment jsdom
//
// Alta y carga de tarifarios.
//
// El motor ya sabía BUSCAR en una tabla; lo que se prueba acá es que se pueda CREAR una sin dejar
// las trampas que el motor solo puede avisar demasiado tarde: claves repetidas (dos filas igual de
// específicas, el importe sale por sorteo) y filas descolocadas al cambiar la clave de la tabla.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  bulkUpsertRows, deleteRateTable, listRateTableRows, listRateTables, normalizeKey,
  saveRateRow, saveRateTable, setRateTableActive, validateRateRow, validateRateTable,
  type RateTableInput,
} from '../rateTablesDataSource';
import { db } from '../data';
import type { RateTable, RateTableRow } from '../types';

const nuevaTabla = (overrides: Partial<RateTableInput> = {}): RateTableInput => ({
  countryId: 'CR',
  partyId: null,
  code: 'TARIFARIO_CR',
  name: 'Tarifario Costa Rica',
  keyColumns: ['originZone', 'truckTypeId'],
  active: true,
  ...overrides,
});

async function tablaConFilas(): Promise<RateTable> {
  const result = await saveRateTable(nuevaTabla());
  if (result.status !== 'saved') throw new Error('no se guardó la tabla');
  return result.table;
}

beforeEach(() => { localStorage.clear(); });

// ── Alta de la tabla ──────────────────────────────────────────────────────────────────────────

describe('validateRateTable', () => {
  it('exige código, nombre y clave', () => {
    const errors = validateRateTable(
      nuevaTabla({ code: '', name: '', keyColumns: [] }), [],
    );
    expect(Object.keys(errors).sort()).toEqual(['code', 'keyColumns', 'name']);
  });

  it('rechaza un código con espacios o acentos', () => {
    // Es el texto con el que una regla nombra la tabla: un espacio invisible rompe la referencia.
    expect(validateRateTable(nuevaTabla({ code: 'TARIFARIO CR' }), []).code).toBeDefined();
    expect(validateRateTable(nuevaTabla({ code: 'TARIFARÍO' }), []).code).toBeDefined();
    expect(validateRateTable(nuevaTabla({ code: 'TARIFARIO_CR_2' }), []).code).toBeUndefined();
  });

  it('rechaza una variable repetida en la clave', () => {
    const errors = validateRateTable(
      nuevaTabla({ keyColumns: ['originZone', 'originZone'] }), [],
    );
    expect(errors.keyColumns).toBeDefined();
  });

  it('rechaza el código repetido dentro del mismo ámbito', () => {
    const existentes = [
      { id: 'T1', code: 'TARIFARIO_CR', countryId: 'CR', partyId: null },
    ];
    expect(validateRateTable(nuevaTabla(), existentes).code).toBeDefined();
  });

  it('el mismo código en otro país o en otra compañía es válido', () => {
    const existentes = [
      { id: 'T1', code: 'TARIFARIO_CR', countryId: 'VE', partyId: null },
      { id: 'T2', code: 'TARIFARIO_CR', countryId: 'CR', partyId: 'P1' },
    ];
    expect(validateRateTable(nuevaTabla(), existentes).code).toBeUndefined();
  });

  it('no se choca consigo mismo al editar', () => {
    const existentes = [{ id: 'T1', code: 'TARIFARIO_CR', countryId: 'CR', partyId: null }];
    expect(validateRateTable(nuevaTabla(), existentes, 'T1').code).toBeUndefined();
  });
});

describe('alta y baja de tarifarios', () => {
  it('guarda, normaliza el código y persiste', async () => {
    const result = await saveRateTable(nuevaTabla({ code: 'tarifario_cr' }));
    expect(result.status).toBe('saved');

    // La semilla ya trae el tarifario ZONAS de cada país (ver `zoneLaneMigration.test.ts`), así que
    // lo que se busca es el recién creado, no "el único".
    const creada = (await listRateTables('CR')).find((t) => t.code === 'TARIFARIO_CR');
    expect(creada).toMatchObject({ keyColumns: ['originZone', 'truckTypeId'] });
  });

  it('la baja lógica lo saca de la lista sin borrarlo', async () => {
    const tabla = await tablaConFilas();
    await setRateTableActive(tabla.id, false);

    const activos = (await listRateTables('CR')).map((t) => t.id);
    const todos = (await listRateTables('CR', { includeInactive: true })).map((t) => t.id);
    expect(activos).not.toContain(tabla.id);
    expect(todos).toContain(tabla.id);
  });

  it('borrar la tabla se lleva sus filas', async () => {
    const tabla = await tablaConFilas();
    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });

    await deleteRateTable(tabla.id);

    expect(await listRateTableRows(tabla.id)).toHaveLength(0);
  });

  it('un tarifario de otro país no aparece', async () => {
    await saveRateTable(nuevaTabla());
    await saveRateTable(nuevaTabla({ countryId: 'VE', code: 'TARIFARIO_VE' }));

    const codigos = (await listRateTables('CR')).map((t) => t.code);
    expect(codigos).toContain('TARIFARIO_CR');
    expect(codigos).not.toContain('TARIFARIO_VE');
  });
});

// ── Cambiar la clave de una tabla que ya tiene filas ──────────────────────────────────────────

describe('reacomodo de filas al cambiar la clave', () => {
  it('conserva el valor de las columnas que siguen estando', async () => {
    const tabla = await tablaConFilas(); // clave: originZone, truckTypeId
    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });

    // Se agrega una columna al medio y se saca ninguna.
    await saveRateTable(
      nuevaTabla({ keyColumns: ['originZone', 'serviceType', 'truckTypeId'] }),
      tabla.id,
    );

    const [fila] = await listRateTableRows(tabla.id);
    // SJO sigue en originZone, NPR sigue en truckTypeId, y la columna nueva entra como comodín.
    expect(fila?.key).toEqual(['SJO', '*', 'NPR']);
  });

  it('una columna que se quita se pierde, y el resto no se corre', async () => {
    const tabla = await tablaConFilas();
    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });

    await saveRateTable(nuevaTabla({ keyColumns: ['truckTypeId'] }), tabla.id);

    const [fila] = await listRateTableRows(tabla.id);
    // Sin reacomodo, la fila habría quedado con 'SJO' en la columna del CAMIÓN: un tarifario que
    // cobra la tarifa de San José a cualquier camión llamado SJO, es decir a ninguno.
    expect(fila?.key).toEqual(['NPR']);
  });
});

// ── Filas ─────────────────────────────────────────────────────────────────────────────────────

describe('normalizeKey', () => {
  it('rellena con comodín hasta completar la clave', () => {
    expect(normalizeKey(['SJO'], 3)).toEqual(['SJO', '*', '*']);
  });

  it('una celda vacía es un comodín', () => {
    expect(normalizeKey(['SJO', '  ', 'NPR'], 3)).toEqual(['SJO', '*', 'NPR']);
  });

  it('recorta lo que sobra de la clave', () => {
    expect(normalizeKey(['A', 'B', 'C'], 2)).toEqual(['A', 'B']);
  });
});

describe('validateRateRow', () => {
  const tabla: RateTable = {
    id: 'T1', countryId: 'CR', partyId: null, code: 'T', name: 'T',
    keyColumns: ['originZone', 'truckTypeId'], active: true,
  };
  const existentes: RateTableRow[] = [
    { id: 'R1', tableId: 'T1', key: ['SJO', 'NPR'], amount: '400', order: 1, active: true },
  ];
  const fila = { tableId: 'T1', key: ['SJO', 'NPR'], amount: '500', active: true };

  it('rechaza la clave repetida', () => {
    // Dos filas igual de específicas: el motor avisaría y elegiría una. Que acierte es casualidad.
    expect(validateRateRow(fila, tabla, existentes).key).toBeDefined();
  });

  it('la repetición no distingue mayúsculas', () => {
    expect(validateRateRow({ ...fila, key: ['sjo', 'npr'] }, tabla, existentes).key).toBeDefined();
  });

  it('una clave con comodín en otra posición no es la misma', () => {
    expect(validateRateRow({ ...fila, key: ['SJO', '*'] }, tabla, existentes).key).toBeUndefined();
  });

  it('no se choca consigo misma al editar', () => {
    expect(validateRateRow(fila, tabla, existentes, 'R1').key).toBeUndefined();
  });

  it('exige un importe numérico', () => {
    expect(validateRateRow({ ...fila, key: ['LIM', 'NPR'], amount: '' }, tabla, existentes).amount).toBeDefined();
    expect(validateRateRow({ ...fila, key: ['LIM', 'NPR'], amount: '₡400' }, tabla, existentes).amount).toBeDefined();
    expect(validateRateRow({ ...fila, key: ['LIM', 'NPR'], amount: '-50.25' }, tabla, existentes).amount).toBeUndefined();
  });
});

describe('alta de filas', () => {
  it('guarda la clave normalizada y numera el orden sola', async () => {
    const tabla = await tablaConFilas();
    await saveRateRow({ tableId: tabla.id, key: ['SJO', ''], amount: '400', active: true });
    await saveRateRow({ tableId: tabla.id, key: ['LIM', 'NPR'], amount: '520', active: true });

    const filas = await listRateTableRows(tabla.id);
    expect(filas.map((f) => f.key)).toEqual([['SJO', '*'], ['LIM', 'NPR']]);
    expect(filas.map((f) => f.order)).toEqual([1, 2]);
  });

  it('editar una fila no la manda al final de la tabla', async () => {
    const tabla = await tablaConFilas();
    const primera = await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });
    await saveRateRow({ tableId: tabla.id, key: ['LIM', 'NPR'], amount: '520', active: true });
    if (primera.status !== 'saved') throw new Error('no se guardó');

    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '450', active: true }, primera.row.id);

    const filas = await listRateTableRows(tabla.id);
    expect(filas.map((f) => f.amount)).toEqual(['450', '520']);
  });

  it('una fila de un tarifario borrado no se guarda a la nada', async () => {
    const result = await saveRateRow({ tableId: 'NO_EXISTE', key: ['A'], amount: '1', active: true });
    expect(result.status).toBe('failed');
  });
});

// ── Carga masiva ──────────────────────────────────────────────────────────────────────────────

describe('bulkUpsertRows', () => {
  it('replace vacía la tabla antes de cargar', async () => {
    const tabla = await tablaConFilas();
    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });

    const result = await bulkUpsertRows(tabla.id, [{ key: ['LIM', 'FRR'], amount: '600' }], 'replace');

    expect(result).toMatchObject({ inserted: 1, replaced: 0, error: null });
    const filas = await listRateTableRows(tabla.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.key).toEqual(['LIM', 'FRR']);
  });

  it('merge pisa la fila de la misma clave y agrega el resto', async () => {
    const tabla = await tablaConFilas();
    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });

    const result = await bulkUpsertRows(tabla.id, [
      { key: ['SJO', 'NPR'], amount: '450' },
      { key: ['LIM', 'FRR'], amount: '600' },
    ], 'merge');

    expect(result).toMatchObject({ inserted: 1, replaced: 1 });
    const filas = await listRateTableRows(tabla.id);
    expect(filas).toHaveLength(2);
    expect(filas.find((f) => f.key[0] === 'SJO')?.amount).toBe('450');
  });

  it('una clave repetida DENTRO del archivo pisa en vez de duplicar', async () => {
    // Si no, la importación mete justo la ambigüedad que el alta manual rechaza.
    const tabla = await tablaConFilas();

    await bulkUpsertRows(tabla.id, [
      { key: ['SJO', 'NPR'], amount: '400' },
      { key: ['SJO', 'NPR'], amount: '450' },
    ], 'replace');

    const filas = await listRateTableRows(tabla.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.amount).toBe('450');
  });

  it('completa la clave corta con comodines', async () => {
    const tabla = await tablaConFilas();
    await bulkUpsertRows(tabla.id, [{ key: ['SJO'], amount: '400' }], 'replace');

    expect((await listRateTableRows(tabla.id))[0]?.key).toEqual(['SJO', '*']);
  });

  it('un tarifario que ya no existe no rompe la importación', async () => {
    const result = await bulkUpsertRows('NO_EXISTE', [{ key: ['A'], amount: '1' }], 'replace');
    expect(result.error).toBeTruthy();
  });
});

// ── El motor encuentra lo que la pantalla guardó ──────────────────────────────────────────────

describe('lo guardado es lo que el motor busca', () => {
  it('la fila queda con la forma que espera lookupRateTable', async () => {
    const tabla = await tablaConFilas();
    await saveRateRow({ tableId: tabla.id, key: ['SJO', 'NPR'], amount: '400', active: true });

    const filas = await db().find('rateTableRow', {
      where: [{ column: 'table_id', op: 'eq', value: tabla.id }],
    });
    expect(filas[0]).toMatchObject({
      table_id: tabla.id,
      key: ['SJO', 'NPR'],
      amount: '400',
      active: true,
    });
  });
});
