// @vitest-environment jsdom
//
// Liquidaciones de viajes.
//
// Lo que cuidan:
//   1. Que se guarde el desglose COMPLETO y la foto del viaje: una liquidación emitida se tiene que
//      poder volver a explicar aunque después cambien las reglas o el viaje.
//   2. Que el motor pueda FRENAR una emisión.
//   3. Que un viaje tenga UNA liquidación vigente y que re-liquidar deje historial (ROADMAP §8).

import { beforeEach, describe, expect, it } from 'vitest';
import {
  emitSettlement, getSettlement, listSettlements, listTripSettlements, nextSettlementNumber,
  reliquidateSettlement, updateSettlementStatus, validateSettlement, type SettlementInput,
} from '../settlementsDataSource';
import { getTrip, listLiquidableTrips } from '../tripsDataSource';
import { calculate } from '../index';
import { db } from '../data';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type { CalcResult, CalculateInput, MarginPolicy, TripRecord } from '../types';

function calcular(overrides: Partial<CalculateInput> = {}): CalcResult {
  const { zoneGroups, zones, locations } = makeGeoVE();
  return calculate({
    country: makeCountryVE(),
    trip: makeTrip(),
    rules: [makeRule({ code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '400.00' } })],
    zones,
    zoneGroups,
    locations,
    ...makeOwnCostStructure(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    ...overrides,
  });
}

/** Dos viajes completados de Venezuela de la semilla. */
let viaje: TripRecord;
let otroViaje: TripRecord;

const entrada = (overrides: Partial<SettlementInput> = {}): SettlementInput => {
  const calc = overrides.calc ?? calcular();
  return {
    trip: viaje,
    partyId: viaje.carrierId,
    edits: { customVars: { 'custom:peajes': 2 } },
    status: 'Borrador',
    notes: null,
    marginReason: null,
    context: makeTrip(),
    calc,
    totalAmount: calc.totalLiquidado,
    ...overrides,
  };
};

beforeEach(async () => {
  localStorage.clear();
  const [a, b] = await listLiquidableTrips({ countryId: 'VE' });
  viaje = a;
  otroViaje = b;
});

// ── Numeración ────────────────────────────────────────────────────────────────────────────────

describe('nextSettlementNumber', () => {
  it('arranca en LIQ-0001', () => {
    expect(nextSettlementNumber([])).toBe('LIQ-0001');
  });

  it('sigue al máximo, no a la cantidad', () => {
    // Con una liquidación anulada de por medio, contar daría un número ya usado.
    expect(nextSettlementNumber(['LIQ-0001', 'LIQ-0007', 'LIQ-0003'])).toBe('LIQ-0008');
  });

  it('ignora lo que no tenga la forma esperada, en vez de arrastrarlo', () => {
    expect(nextSettlementNumber(['LIQ-0002', 'OTRO-9', 'LIQ-', '', 'LIQ-00A'])).toBe('LIQ-0003');
  });

  it('no se queda sin dígitos', () => {
    expect(nextSettlementNumber(['LIQ-9999'])).toBe('LIQ-10000');
  });
});

// ── Validación ────────────────────────────────────────────────────────────────────────────────

describe('validateSettlement', () => {
  it('exige el viaje', () => {
    expect(validateSettlement(entrada({ trip: { ...viaje, id: '' } })).trip).toBeDefined();
  });

  it('exige el motivo cuando la política de margen lo pide', () => {
    const exigente: MarginPolicy = {
      countryId: 'VE', warnBelow: 0.9, criticalBelow: 0.8, requireReasonBelow: 0.9, blockOnLoss: false,
    };
    const calc = calcular({ marginPolicy: exigente });
    expect(calc.margin.action).toBe('REQUIRE_REASON');

    expect(validateSettlement(entrada({ calc })).marginReason).toBeDefined();
    expect(validateSettlement(entrada({ calc, marginReason: 'Acuerdo comercial' })).marginReason).toBeUndefined();
  });
});

// ── Emisión ───────────────────────────────────────────────────────────────────────────────────

describe('emitir', () => {
  it('guarda el desglose COMPLETO y la foto del viaje', async () => {
    const result = await emitSettlement(entrada());
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;

    const guardada = await getSettlement(result.settlement.id);
    expect(guardada?.trace[0]).toMatchObject({ ruleCode: 'BASE', final: '400.00' });
    expect(guardada?.stageSubtotals).toBeTruthy();
    expect(guardada?.trip).toBeTruthy();
    expect(guardada?.costTotal).toBeTruthy();
    expect(guardada?.marginStatus).toBeTruthy();
    // La foto del viaje: con qué datos se calculó, aunque guía de despacho lo corrija después.
    expect(guardada?.tripId).toBe(viaje.id);
    expect(guardada?.tripInfo.km).toBe(viaje.km);
    expect(guardada?.tripInfo.carrierName).toBe(viaje.carrierName);
    // Lo cargado a mano.
    expect(guardada?.tripEdits.customVars).toEqual({ 'custom:peajes': 2 });
  });

  it('el número y la fecha salen del viaje, no del formulario', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');
    expect(result.settlement.tripNumber).toBe(viaje.routeNumber);
    expect(result.settlement.settlementDate).toBe(viaje.routeDate);
  });

  it('numera sola, por país, y congela la moneda', async () => {
    const primera = await emitSettlement(entrada());
    const segunda = await emitSettlement(entrada({ trip: otroViaje, partyId: otroViaje.carrierId }));
    if (primera.status !== 'saved' || segunda.status !== 'saved') throw new Error('no se emitió');

    expect(primera.settlement.number).toBe('LIQ-0001');
    expect(segunda.settlement.number).toBe('LIQ-0002');
    expect(primera.settlement.currency).toBe('USD');
  });

  it('guarda las devoluciones informadas, aunque no cambien el pago', async () => {
    const result = await emitSettlement(entrada({
      returns: [{ invoiceNumber: 'F-1029', productCode: 'SKU-44', kind: 'PARCIAL' }],
    }));
    if (result.status !== 'saved') throw new Error('no se emitió');

    expect(result.settlement.returns).toEqual([{ invoiceNumber: 'F-1029', productCode: 'SKU-44', kind: 'PARCIAL' }]);
    expect(result.settlement.totalAmount).toBe('400.00');
  });

  it('recuerda qué líneas se destildaron', async () => {
    const result = await emitSettlement(entrada({ excludedSeqs: [2, 3], totalAmount: '400.00' }));
    if (result.status !== 'saved') throw new Error('no se emitió');
    expect(result.settlement.excludedSeqs).toEqual([2, 3]);
  });

  it('deja registro en la bitácora', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');
    const eventos = await db().find('auditLog', { where: [{ column: 'entity_id', op: 'eq', value: result.settlement.id }] });
    expect(eventos.map((e) => e.action)).toEqual(['CREATE']);
  });

  it('el viaje liquidado sale de la bandeja de "por liquidar"', async () => {
    await emitSettlement(entrada());
    const pendientes = await listLiquidableTrips({ countryId: 'VE' });
    expect(pendientes.map((t) => t.id)).not.toContain(viaje.id);
    expect((await getTrip(viaje.id))?.settlementId).toBeTruthy();
  });
});

// ── Lo que frena una emisión ──────────────────────────────────────────────────────────────────

describe('bloqueos', () => {
  const ciclo = () => calcular({
    rules: [
      makeRule({ code: 'A', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'B' } } }),
      makeRule({ code: 'B', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'A' } } }),
    ],
  });

  it('un problema del motor impide emitir, y NO es un error del formulario', async () => {
    const result = await emitSettlement(entrada({ calc: ciclo() }));
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.issues[0]?.code).toBe('REFERENCIA_CIRCULAR');
  });

  it('el margen en pérdida no se aprueba, pero sí se guarda como borrador', async () => {
    const calc = calcular({ ...makeOwnCostStructure({ driverDaily: '99999' }) });
    expect(calc.margin.status).toBe('LOSS');

    expect((await emitSettlement(entrada({ calc, status: 'Aprobado' }))).status).toBe('blocked');
    expect((await emitSettlement(entrada({ calc, status: 'Borrador' }))).status).toBe('saved');
  });

  it('un viaje que no está completado no se liquida', async () => {
    const planificado = await getTrip('TRIP_PLANIFICADO_1');
    expect(planificado?.status).toBe('planned');
    const result = await emitSettlement(entrada({ trip: planificado! }));
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.issues[0]?.message).toContain('no está completado');
  });

  it('un viaje ya liquidado no se liquida dos veces: se re-liquida', async () => {
    expect((await emitSettlement(entrada())).status).toBe('saved');
    const segunda = await emitSettlement(entrada());
    expect(segunda.status).toBe('blocked');
    if (segunda.status !== 'blocked') return;
    expect(segunda.issues[0]?.message).toContain('re-liquidalo');
  });

  it('un viaje inexistente no se liquida', async () => {
    const result = await emitSettlement(entrada({ trip: { ...viaje, id: 'NO_EXISTE' } }));
    expect(result.status).toBe('blocked');
  });
});

// ── Re-liquidar: una vigente + historial ──────────────────────────────────────────────────────

describe('re-liquidar', () => {
  it('anula la vigente, emite la nueva y las enlaza', async () => {
    const primera = await emitSettlement(entrada());
    if (primera.status !== 'saved') throw new Error('no se emitió');

    const recalculo = calcular({
      rules: [makeRule({ code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '450.00' } })],
    });
    const segunda = await reliquidateSettlement(primera.settlement.id, entrada({ calc: recalculo }), 'Se cargaron 3 peajes que faltaban');
    expect(segunda.status).toBe('saved');
    if (segunda.status !== 'saved') return;

    const vieja = await getSettlement(primera.settlement.id);
    expect(vieja?.status).toBe('Anulado');
    expect(vieja?.supersededBy).toBe(segunda.settlement.id);
    // La vieja conserva su snapshot: lo que se calculó antes no se reinterpreta.
    expect(vieja?.totalAmount).toBe('400.00');

    expect(segunda.settlement.totalAmount).toBe('450.00');
    expect(segunda.settlement.number).toBe('LIQ-0002');

    const historial = await listTripSettlements(viaje.id);
    expect(historial).toHaveLength(2);
    expect(historial.filter((s) => s.status !== 'Anulado')).toHaveLength(1);
    expect((await getTrip(viaje.id))?.settlementId).toBe(segunda.settlement.id);
  });

  it('exige un motivo', async () => {
    const primera = await emitSettlement(entrada());
    if (primera.status !== 'saved') throw new Error('no se emitió');
    expect((await reliquidateSettlement(primera.settlement.id, entrada(), '  ')).status).toBe('invalid');
  });

  it('si el cálculo nuevo está bloqueado, la vigente queda intacta', async () => {
    const primera = await emitSettlement(entrada());
    if (primera.status !== 'saved') throw new Error('no se emitió');

    const ciclo = calcular({
      rules: [
        makeRule({ code: 'A', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'B' } } }),
        makeRule({ code: 'B', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'A' } } }),
      ],
    });
    expect((await reliquidateSettlement(primera.settlement.id, entrada({ calc: ciclo }), 'x')).status).toBe('blocked');
    expect((await getSettlement(primera.settlement.id))?.status).toBe('Borrador');
    expect(await listTripSettlements(viaje.id)).toHaveLength(1);
  });

  it('no re-liquida una que ya está anulada, ni la de otro viaje', async () => {
    const primera = await emitSettlement(entrada());
    if (primera.status !== 'saved') throw new Error('no se emitió');

    expect((await reliquidateSettlement(primera.settlement.id, entrada({ trip: otroViaje }), 'x')).status).toBe('failed');

    await updateSettlementStatus(primera.settlement.id, 'Anulado');
    expect((await reliquidateSettlement(primera.settlement.id, entrada(), 'x')).status).toBe('blocked');
  });

  it('una reemplazada no se puede reactivar', async () => {
    const primera = await emitSettlement(entrada());
    if (primera.status !== 'saved') throw new Error('no se emitió');
    await reliquidateSettlement(primera.settlement.id, entrada(), 'corrección');

    const intento = await updateSettlementStatus(primera.settlement.id, 'Borrador');
    expect(intento.error).toContain('reemplazada');
  });

  it('deja registro de la anulación y de la nueva en la bitácora', async () => {
    const primera = await emitSettlement(entrada());
    if (primera.status !== 'saved') throw new Error('no se emitió');
    const segunda = await reliquidateSettlement(primera.settlement.id, entrada(), 'corrección de peajes');
    if (segunda.status !== 'saved') throw new Error('no se re-liquidó');

    const deLaVieja = await db().find('auditLog', { where: [{ column: 'entity_id', op: 'eq', value: primera.settlement.id }] });
    expect(deLaVieja.map((e) => e.action)).toEqual(['CREATE', 'UPDATE']);
    expect(deLaVieja[1].reason).toBe('corrección de peajes');
  });
});

// ── Consulta y cambio de estado ───────────────────────────────────────────────────────────────

describe('lista y estados', () => {
  it('filtra por perfil, viaje, estado y rango de fechas', async () => {
    await emitSettlement(entrada());
    await emitSettlement(entrada({ trip: otroViaje, partyId: otroViaje.carrierId }));

    expect(await listSettlements({ tripId: viaje.id })).toHaveLength(1);
    expect(await listSettlements({ partyId: viaje.carrierId! })).toHaveLength(
      viaje.carrierId === otroViaje.carrierId ? 2 : 1,
    );
    expect(await listSettlements({ from: viaje.routeDate, to: viaje.routeDate })).toHaveLength(
      viaje.routeDate === otroViaje.routeDate ? 2 : 1,
    );
  });

  it('cambia de estado', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');

    expect((await updateSettlementStatus(result.settlement.id, 'Aprobado')).error).toBeNull();
    expect((await getSettlement(result.settlement.id))?.status).toBe('Aprobado');
  });

  it('desde la lista tampoco se aprueba una liquidación en pérdida', async () => {
    const calc = calcular({ ...makeOwnCostStructure({ driverDaily: '99999' }) });
    const result = await emitSettlement(entrada({ calc, status: 'Borrador' }));
    if (result.status !== 'saved') throw new Error('no se emitió');

    const cambio = await updateSettlementStatus(result.settlement.id, 'Pagado');
    expect(cambio.error).toContain('pérdida');
    expect((await getSettlement(result.settlement.id))?.status).toBe('Borrador');
  });

  it('una liquidación se ANULA, no se borra, y el viaje vuelve a quedar por liquidar', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');

    await updateSettlementStatus(result.settlement.id, 'Anulado');

    expect((await getSettlement(result.settlement.id))?.status).toBe('Anulado');
    expect(await listSettlements({})).toHaveLength(1);
    expect(await listSettlements({ includeVoided: false })).toHaveLength(0);
    expect((await listLiquidableTrips({ countryId: 'VE' })).map((t) => t.id)).toContain(viaje.id);
  });
});
