import { describe, expect, it } from 'vitest';
import type { SettlementRecord } from '../../types';
import { canManageProformas, detectIrregularities, SettlementRecordLike } from './irregularityTestApi';

describe('detectIrregularities', () => {
  const codes = (overrides: Partial<SettlementRecord>, extras = {}) =>
    detectIrregularities(SettlementRecordLike(overrides), extras).map((f) => f.code);

  it('una liquidación típica no trae alertas', () => {
    expect(codes({})).toEqual([]);
  });

  it('margen: solo avisa con valor de mercancía conocido', () => {
    expect(codes({ marginStatus: 'LOSS', cargoValue: '100' })).toEqual(['MARGIN_LOSS']);
    expect(codes({ marginStatus: 'CRITICAL', cargoValue: '100' })).toEqual(['MARGIN_CRITICAL']);
    expect(codes({ marginStatus: 'LOSS', cargoValue: null })).toEqual([]);
  });

  it('pedidos anulados o diferidos, y entrega parcial', () => {
    const order = { orderId: 'o', orderNumber: '1', guideNumber: null, customerName: null, value: '1', reason: null };
    expect(codes({ orders: [{ ...order, status: 'ANULADO', deliveryStatus: 'failed' }] })).toContain('ORDERS_CUT');
    expect(codes({ orders: [{ ...order, status: 'INCLUIDO', deliveryStatus: 'in_transit' }] })).toContain('ORDERS_NOT_DELIVERED');
    expect(codes({ tripInfo: { totalStops: 4, completedStops: 3, guideCount: 0, deliveredGuides: 0, returnCount: 0 } as never })).toContain('PARTIAL_STOPS');
  });

  it('devoluciones y notas', () => {
    expect(codes({ tripInfo: { totalStops: 1, completedStops: 1, guideCount: 0, deliveredGuides: 0, returnCount: 2 } as never })).toContain('RETURNS');
    expect(codes({ notes: 'Cliente pidió esperar' })).toContain('NOTES');
    expect(codes({ notes: '   ' })).toEqual([]);
  });

  it('clasifica los avisos del motor por patrón', () => {
    expect(codes({ warnings: ['Se usó la tarifa de respaldo'] })).toContain('FALLBACK_RATE');
    expect(codes({ warnings: ['Los tramos no cubren el valor 90'] })).toContain('TIERS_GAP');
    expect(codes({ warnings: ['Algo inesperado'] })).toContain('WARNINGS');
  });

  it('montos a mano, reglas puntuales, base cambiada y contrato vencido', () => {
    expect(codes({ overrides: { R1: { value: '5', reason: 'x' } } as never })).toContain('OVERRIDES');
    expect(codes({ adhocRules: [{}] as never })).toContain('ADHOC_RULES');
    const base = { method: 'X', changedBy: null, changedAt: '2026-10-01', contractExpiry: '2026-09-30' } as never;
    expect(codes({ baseChange: base, settlementDate: '2026-10-10' })).toEqual(expect.arrayContaining(['BASE_CHANGED', 'CONTRACT_EXPIRED']));
    expect(codes({ baseChange: { ...(base as object), contractExpiry: '2026-12-31' } as never, settlementDate: '2026-10-10' })).not.toContain('CONTRACT_EXPIRED');
  });

  it('incidentes y extras cargados a mano', () => {
    expect(codes({ tripEdits: { customVars: { 'custom:incidencias': 2, 'custom:peajes': 0 } } })).toEqual(['INCIDENTS']);
    expect(codes({ tripEdits: { customVars: { 'custom:peajes': 15 } } })).toEqual(['EXTRAS']);
  });

  it('viene de un reclamo, antes anulada y proforma reclamada', () => {
    expect(codes({ fromClaimId: 'prc_1' })).toEqual(['FROM_CLAIM']);
    expect(codes({}, { priorAnnulled: true, priorExcluded: true, proformaHadClaim: true }))
      .toEqual(['PRIOR_ANNULLED', 'PRIOR_EXCLUDED', 'PROFORMA_CLAIM']);
  });

  it('sin perfil de cálculo', () => {
    expect(codes({ partyId: null })).toEqual(['NO_PARTY']);
  });
});

describe('canManageProformas', () => {
  it('el Liquidador y los administradores gestionan; el resto no', () => {
    expect(canManageProformas('Liquidador')).toBe(true);
    expect(canManageProformas(' liquidador ')).toBe(true);
    expect(canManageProformas('SuperAdministrador')).toBe(true);
    expect(canManageProformas('Jefe de Almacén')).toBe(false);
    expect(canManageProformas(null)).toBe(false);
  });
});
