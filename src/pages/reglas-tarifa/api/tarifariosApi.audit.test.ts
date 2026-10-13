// @vitest-environment jsdom
//
// Los cambios de tarifarios y de sus filas dejan rastro en la bitácora (A7 de la auditoría con backend).

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/tarifas/data';
import { setActorName, setActorRole } from '../../../lib/tarifas/actor';
import type { RateTableInput } from '../../../lib/tarifas/rateTablesDataSource';
import {
  createOrUpdateRateRow, removeRateRow, removeRateTable, saveRateTableWithAudit, toggleRateTable,
} from './tarifariosApi';

const tabla = (overrides: Partial<RateTableInput> = {}): RateTableInput => ({
  countryId: 'CR', partyId: null, code: 'TARIFARIO_AUDIT', name: 'Tarifario de auditoría',
  keyColumns: ['originZone'], active: true, ...overrides,
});

const eventos = async () => (await db().find('auditLog')).map((e) => ({
  entity: e.entity, action: e.action, user: e.user_name, role: e.role, id: e.entity_id,
}));

beforeEach(() => {
  localStorage.clear();
  setActorName('Ana Auditora');
  setActorRole('Desarrollador');
});

describe('bitácora de tarifarios', () => {
  it('crear, editar, desactivar y eliminar un tarifario deja un evento cada vez', async () => {
    const created = await saveRateTableWithAudit(tabla());
    if (created.status !== 'saved') throw new Error('no se guardó');
    const { table } = created;

    await saveRateTableWithAudit(tabla({ name: 'Otro nombre' }), table.id, table);
    await toggleRateTable(table.id, true, table.code);
    await removeRateTable(table.id, table.code);

    const mine = (await eventos()).filter((e) => e.entity === 'tarifas_rate_tables');
    expect(mine.map((e) => e.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE', 'DELETE']);
    expect(mine.every((e) => e.id === table.id && e.user === 'Ana Auditora' && e.role === 'Desarrollador')).toBe(true);
  });

  it('agregar, editar y quitar una fila deja un evento cada vez', async () => {
    const created = await saveRateTableWithAudit(tabla({ code: 'TARIFARIO_FILAS' }));
    if (created.status !== 'saved') throw new Error('no se guardó');
    const tableId = created.table.id;

    const added = await createOrUpdateRateRow({ tableId, key: ['Z1'], amount: '100.00', values: {}, active: true });
    if (added.status !== 'saved') throw new Error(JSON.stringify(added));
    await createOrUpdateRateRow({ tableId, key: ['Z1'], amount: '120.00', values: {}, active: true }, added.row.id);
    await removeRateRow(added.row.id, tableId);

    const rows = (await eventos()).filter((e) => e.entity === 'tarifas_rate_table_rows');
    expect(rows.map((e) => e.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
  });

  it('un cambio inválido no deja evento', async () => {
    const before = (await eventos()).length;
    const result = await saveRateTableWithAudit(tabla({ code: '', name: '' }));
    expect(result.status).toBe('invalid');
    expect((await eventos()).length).toBe(before);
  });
});
