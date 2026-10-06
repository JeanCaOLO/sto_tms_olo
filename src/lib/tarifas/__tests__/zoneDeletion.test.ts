// @vitest-environment jsdom
//
// Zonas: son del catálogo del TMS y el liquidador NO las crea ni las borra (ROADMAP §8). Lo que el
// liquidador sí administra son los GRUPOS de zona (por código), y lo que hay que vigilar es que un
// tarifario no nombre una zona que ya no existe: `rowsUsingZone` lo detecta.

import { beforeEach, describe, expect, it } from 'vitest';
import { listZones, saveZoneGroup } from '../localRulesDataSource';
import { rowsUsingZone } from '../rateTablesDataSource';
import { db, ReadOnlyEntityError } from '../data';
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
    // "SJO" en la columna de camión es un código de camión que casualmente se escribe igual.
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

// ── Zonas del catálogo y grupos del cálculo ──────────────────────────────────────────────────

describe('zonas del catálogo', () => {
  it('se leen por la capa de datos y no se pueden crear, editar ni borrar desde el liquidador', async () => {
    const [zona] = await db().find('zone');
    await expect(db().insert('zone', { code: 'X' })).rejects.toThrow(ReadOnlyEntityError);
    await expect(db().update('zone', zona.id, { name: 'X' })).rejects.toThrow(ReadOnlyEntityError);
    await expect(db().delete('zone', zona.id)).rejects.toThrow(ReadOnlyEntityError);
  });

  it('la lista muestra el grupo de cada zona, resuelto por código', async () => {
    const zonas = await listZones('org');
    expect(zonas.find((z) => z.id === 'Z_VE_CCS')?.zone_groups?.name).toBe('Centro');
  });
});

describe('saveZoneGroup', () => {
  it('guarda los códigos de zona del grupo', async () => {
    const result = await saveZoneGroup('org', { country_id: 'CR', code: 'COSTA', name: 'Costa', zone_codes: ['SIN_ZONA_NUEVA'] });
    expect(result.error).toBeNull();
    expect((await db().find('zoneGroup')).find((g) => g.code === 'COSTA')?.zone_codes).toEqual(['SIN_ZONA_NUEVA']);
    expect((await listZones('org')).find((z) => z.code === 'PUN')?.zone_groups?.name).toBe('Guanacaste');
  });

  it('rechaza poner una zona en dos grupos del mismo país', async () => {
    // El motor tomaría uno arbitrario y la regla por grupo cobraría según el orden de carga.
    // PUN ya está en el grupo Guanacaste de la semilla.
    const result = await saveZoneGroup('org', { country_id: 'CR', code: 'OTRO', name: 'Otro', zone_codes: ['PUN'] });
    expect(result.error?.code).toBe('23505');
    expect(result.error?.message).toContain('Guanacaste');
  });
});
