// @vitest-environment jsdom
//
// Borrar una zona que un tarifario está usando.
//
// Esta prueba existe por una regresión que introdujo la absorción de las tarifas zona-a-zona: en el
// modelo viejo, la tabla guardaba el ID de la zona y el esquema impedía borrar una zona en uso. El
// tarifario guarda el CÓDIGO —es lo que el motor compara— y un código no es una clave foránea, así
// que la red del esquema dejó de cubrir este caso.
//
// Sin la reposición, borrar una zona dejaba filas apuntando a un código inexistente: filas que no
// le cobran a nadie y que nadie ve.

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteZone } from '../localRulesDataSource';
import { rowsUsingZone, saveRateRow, saveRateTable } from '../rateTablesDataSource';
import { db } from '../data';
import type { RateTable, RateTableRow } from '../types';

beforeEach(() => { localStorage.clear(); });

// ── La unidad pura ────────────────────────────────────────────────────────────────────────────

describe('rowsUsingZone', () => {
  const zonal: RateTable = {
    id: 'T1', countryId: 'CR', partyId: null, code: 'ZONAS', name: 'Zonas',
    keyColumns: ['originZone', 'destZone'], active: true,
  };
  const sinZonas: RateTable = {
    id: 'T2', countryId: 'CR', partyId: null, code: 'CAMIONES', name: 'Camiones',
    keyColumns: ['truckTypeId'], active: true,
  };
  const rows: RateTableRow[] = [
    { id: 'R1', tableId: 'T1', key: ['SJO', 'LIM'], amount: '100', order: 1, active: true },
    { id: 'R2', tableId: 'T1', key: ['*', 'SJO'], amount: '200', order: 2, active: true },
    { id: 'R3', tableId: 'T2', key: ['SJO'], amount: '300', order: 1, active: true },
  ];

  it('encuentra la zona en cualquiera de sus columnas', () => {
    // Aparece como origen en R1 y como destino en R2.
    expect(rowsUsingZone('SJO', [zonal], rows)).toHaveLength(2);
  });

  it('no distingue mayúsculas', () => {
    expect(rowsUsingZone('sjo', [zonal], rows)).toHaveLength(2);
  });

  it('ignora las columnas que no son de zona', () => {
    // "SJO" en la columna de camión es un código de camión que casualmente se escribe igual: no es
    // un uso de la zona y bloquear por él sería un falso positivo.
    expect(rowsUsingZone('SJO', [sinZonas], rows)).toHaveLength(0);
  });

  it('una zona que no usa nadie no aparece', () => {
    expect(rowsUsingZone('CAR', [zonal], rows)).toHaveLength(0);
  });

  it('un código vacío no bloquea nada', () => {
    expect(rowsUsingZone('  ', [zonal], rows)).toHaveLength(0);
  });

  it('dice en qué tarifario y con qué clave', () => {
    const [uso] = rowsUsingZone('LIM', [zonal], rows);
    expect(uso).toEqual({ tableCode: 'ZONAS', rowKey: ['SJO', 'LIM'] });
  });
});

// ── De punta a punta ──────────────────────────────────────────────────────────────────────────

describe('deleteZone', () => {
  async function zonaConTarifario() {
    const zone = await db().insert('zone', {
      country_id: 'CR', zone_group_id: null, code: 'PUN', name: 'Puntarenas', status: 'active',
    });
    const tabla = await saveRateTable({
      countryId: 'CR', partyId: null, code: 'PRUEBA', name: 'Prueba',
      keyColumns: ['originZone', 'destZone'], active: true,
    });
    if (tabla.status !== 'saved') throw new Error('no se guardó la tabla');
    await saveRateRow({ tableId: tabla.table.id, key: ['PUN', 'SJO'], amount: '900', active: true });
    return { zone, tableId: tabla.table.id };
  }

  it('rechaza el borrado y explica dónde se usa', async () => {
    const { zone } = await zonaConTarifario();

    const result = await deleteZone(zone.id);

    expect(result.error?.code).toBe('23503');
    expect(result.error?.message).toContain('PRUEBA');
    // Y la zona sigue ahí: el rechazo no puede dejar el borrado a medias.
    expect(await db().findOne('zone', zone.id)).not.toBeNull();
  });

  it('una vez quitada la fila, la zona se borra', async () => {
    const { zone, tableId } = await zonaConTarifario();
    const [fila] = await db().find('rateTableRow', {
      where: [{ column: 'table_id', op: 'eq', value: tableId }],
    });
    await db().delete('rateTableRow', fila!.id);

    expect((await deleteZone(zone.id)).error).toBeNull();
    expect(await db().findOne('zone', zone.id)).toBeNull();
  });

  it('una zona que no usa ningún tarifario se borra sin trabas', async () => {
    const zone = await db().insert('zone', {
      country_id: 'CR', zone_group_id: null, code: 'GUA', name: 'Guanacaste', status: 'active',
    });

    expect((await deleteZone(zone.id)).error).toBeNull();
  });
});
