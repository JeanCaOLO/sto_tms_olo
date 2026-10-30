import { describe, expect, it, vi } from 'vitest';
import { decideProformas, groupProformasByCarrier, buildPhases, type ProformaRecord, type ProformaWithPhases } from '..';
import * as decide from '../decideProforma';

const row = (id: string, carrierId: string, total: number, currency = 'CRC'): ProformaWithPhases => ({
  proforma: { id, number: `PRO-${id}`, carrierId, carrierName: `T-${carrierId}`, currency, totalAmount: total, status: 'En Revisión' } as ProformaRecord,
  phases: buildPhases(id, [{ id: 't1', countryId: 'c', position: 1, name: 'F1', approverType: 'role', roleName: 'Jefe', userId: null, approverLabel: 'Jefe', active: true }], () => `${id}-ph`),
});

describe('groupProformasByCarrier', () => {
  it('junta las proformas de un mismo transportista y suma el total', () => {
    const groups = groupProformasByCarrier([row('1', 'b', 10.1), row('2', 'a', 5), row('3', 'b', 20.2)]);
    expect(groups.map((g) => g.carrierId)).toEqual(['a', 'b']);
    expect(groups[1].rows).toHaveLength(2);
    expect(groups[1].totalAmount).toBe(30.3);
  });

  it('separa por moneda', () => {
    expect(groupProformasByCarrier([row('1', 'a', 1, 'CRC'), row('2', 'a', 1, 'USD')])).toHaveLength(2);
  });
});

describe('decideProformas', () => {
  it('sigue con las demás cuando una falla y reporta cuál', async () => {
    vi.spyOn(decide, 'decideProforma').mockImplementation(async (id) => ({ error: id === '2' ? 'sin permiso' : null }));
    const res = await decideProformas([row('1', 'a', 1), row('2', 'a', 1), row('3', 'a', 1)], 'approve');
    expect(res.done).toBe(2);
    expect(res.failed).toEqual([{ number: 'PRO-2', error: 'sin permiso' }]);
  });
});
