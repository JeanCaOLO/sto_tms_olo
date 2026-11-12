// Apoyo de los tests de irregularidad: una liquidación "típica" (sin ninguna alerta) que cada test modifica.

import type { SettlementRecord } from '../../types';

export { canManageProformas } from '../canManageProformas';
export { detectIrregularities } from '../irregularity';

export const SettlementRecordLike = (overrides: Partial<SettlementRecord> = {}): SettlementRecord => ({
  id: 'stl_1',
  countryId: 'c1',
  tripId: 't1',
  partyId: 'party_1',
  number: 'LIQ-001',
  tripNumber: 'V-1',
  settlementDate: '2026-10-20',
  status: 'En Revisión',
  tripInfo: { totalStops: 3, completedStops: 3, guideCount: 3, deliveredGuides: 3, returnCount: 0 } as SettlementRecord['tripInfo'],
  tripEdits: { customVars: {} },
  supersededBy: null,
  currency: 'CRC',
  totalAmount: '1000',
  notes: null,
  marginReason: null,
  marginStatus: null,
  marginAmount: null,
  marginPct: null,
  costTotal: null,
  costModelId: null,
  cargoValue: null,
  allocation: null,
  orders: null,
  trip: {} as SettlementRecord['trip'],
  trace: [],
  discarded: [],
  stageSubtotals: {} as SettlementRecord['stageSubtotals'],
  warnings: [],
  overrides: {},
  adhocRules: [],
  rulesUsed: [],
  excludedSeqs: [],
  baseChange: null,
  returns: [],
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
  ...overrides,
});

export type SettlementRecordLike = SettlementRecord;
