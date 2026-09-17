// @vitest-environment jsdom
//
// Liquidaciones emitidas.
//
// Lo que arreglan: hasta ahora la liquidación se guardaba en una tabla que no tiene columnas para
// el desglose, así que la traza, los descartes, los subtotales y los avisos **se perdían al
// guardar**. Una liquidación emitida no se podía volver a explicar: quedaba un total y nada más.
//
// Lo segundo que cuidan: que el motor pueda FRENAR una emisión. Antes eso eran tres `alert()`
// dentro de un modal de 1.400 líneas, imposibles de probar.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  emitSettlement, getSettlement, listSettlements, nextSettlementNumber, updateSettlementStatus,
  validateSettlement, type SettlementInput,
} from '../settlementsDataSource';
import { calculate } from '../index';
import { db } from '../data';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalcResult, CalculateInput, MarginPolicy } from '../types';

// La semilla real trae liquidaciones de demo (docs/tarifador) — estos tests parten de una pizarra
// en blanco para esta colección puntual, sin tocar compañías/rutas/reglas reales.
async function limpiarLiquidacionesDeLaSemilla(): Promise<void> {
  for (const row of await db().find('settlement')) await db().delete('settlement', row.id);
}

function calcular(overrides: Partial<CalculateInput> = {}): CalcResult {
  const { zoneGroups, zones, locations } = makeGeoVE();
  return calculate({
    country: makeCountryVE(),
    trip: makeTrip(),
    rules: [makeRule({ code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '400.00' } })],
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    ...overrides,
  });
}

const entrada = (overrides: Partial<SettlementInput> = {}): SettlementInput => {
  const calc = overrides.calc ?? calcular();
  return {
    countryId: 'VE',
    partyId: 'SP_VE_OWN',
    routeId: null,
    driverId: null,
    tripNumber: 'V-88123',
    settlementDate: '2026-09-01',
    truckTypeId: 'NPR',
    status: 'Borrador',
    notes: null,
    marginReason: null,
    trip: makeTrip(),
    calc,
    totalAmount: calc.totalLiquidado,
    ...overrides,
  };
};

beforeEach(async () => { localStorage.clear(); await limpiarLiquidacionesDeLaSemilla(); });

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
    // La versión anterior vivía dentro del modal y ya produjo un "LIQ-0NaN" al toparse con esto.
    expect(nextSettlementNumber(['LIQ-0002', 'OTRO-9', 'LIQ-', '', 'LIQ-00A'])).toBe('LIQ-0003');
  });

  it('no se queda sin dígitos', () => {
    expect(nextSettlementNumber(['LIQ-9999'])).toBe('LIQ-10000');
  });
});

// ── Validación ────────────────────────────────────────────────────────────────────────────────

describe('validateSettlement', () => {
  it('exige compañía, país y una fecha con forma de fecha', () => {
    const errors = validateSettlement(entrada({ partyId: '', countryId: '', settlementDate: '01/09/2026' }));
    expect(Object.keys(errors).sort()).toEqual(['countryId', 'partyId', 'settlementDate']);
  });

  it('exige el motivo cuando la política de margen lo pide', () => {
    // No es una formalidad: es lo que queda escrito cuando alguien aprueba una liquidación floja.
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
  it('guarda el desglose COMPLETO, que es lo que hoy se pierde', async () => {
    const result = await emitSettlement(entrada());
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;

    const guardada = await getSettlement(result.settlement.id);
    expect(guardada?.trace.length).toBeGreaterThan(0);
    expect(guardada?.trace[0]).toMatchObject({ ruleCode: 'BASE', final: '400.00' });
    expect(guardada?.stageSubtotals).toBeTruthy();
    expect(guardada?.trip).toBeTruthy();
    expect(guardada?.costTotal).toBeTruthy();
    expect(guardada?.marginStatus).toBeTruthy();
  });

  it('numera sola y congela la moneda del país', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');

    expect(result.settlement.number).toBe('LIQ-0001');
    // El país de prueba liquida en USD (Venezuela, tras la unificación de moneda de §4.4): la
    // moneda se congela al emitir, porque el país podría cambiarla después y una liquidación
    // emitida no se reinterpreta.
    expect(result.settlement.currency).toBe('USD');
  });

  it('la numeración es por país', async () => {
    await emitSettlement(entrada());
    const segunda = await emitSettlement(entrada({ tripNumber: 'V-88124' }));
    if (segunda.status !== 'saved') throw new Error('no se emitió');

    expect(segunda.settlement.number).toBe('LIQ-0002');
  });

  it('guarda el nro de viaje de la guía, que es con el que la gente busca', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');
    expect(result.settlement.tripNumber).toBe('V-88123');
  });

  it('guarda las devoluciones informadas, aunque no cambien el pago', async () => {
    const result = await emitSettlement(entrada({
      returns: [{ invoiceNumber: 'F-1029', productCode: 'SKU-44', kind: 'PARCIAL' }],
    }));
    if (result.status !== 'saved') throw new Error('no se emitió');

    expect(result.settlement.returns).toEqual([
      { invoiceNumber: 'F-1029', productCode: 'SKU-44', kind: 'PARCIAL' },
    ]);
    // El total no las mira: el viaje se le paga igual al transportista.
    expect(result.settlement.totalAmount).toBe('400.00');
  });

  it('recuerda qué líneas se destildaron', async () => {
    // Destildar una línea cambia el total; sin registrarlo, la liquidación no se puede reproducir.
    const result = await emitSettlement(entrada({ excludedSeqs: [2, 3], totalAmount: '400.00' }));
    if (result.status !== 'saved') throw new Error('no se emitió');
    expect(result.settlement.excludedSeqs).toEqual([2, 3]);
  });
});

// ── Lo que frena una emisión ──────────────────────────────────────────────────────────────────

describe('bloqueos', () => {
  it('un problema del motor impide emitir, y NO es un error del formulario', async () => {
    // Un ciclo entre reglas da un total plausible y falso. Quien liquida no puede arreglarlo
    // corrigiendo un campo: por eso se devuelve 'blocked' y no 'invalid'.
    const calc = calcular({
      rules: [
        makeRule({ code: 'A', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'B' } } }),
        makeRule({ code: 'B', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'A' } } }),
      ],
    });
    expect(calc.blockingIssues.length).toBeGreaterThan(0);

    const result = await emitSettlement(entrada({ calc }));
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.issues[0]?.code).toBe('REFERENCIA_CIRCULAR');
  });

  it('el margen en pérdida no se aprueba, pero sí se guarda como borrador', async () => {
    const calc = calcular({ ownCostParams: { ...makeOwnCostParams(), driverDaily: '99999' } });
    expect(calc.margin.status).toBe('LOSS');

    expect((await emitSettlement(entrada({ calc, status: 'Aprobado' }))).status).toBe('blocked');
    expect((await emitSettlement(entrada({ calc, status: 'Borrador' }))).status).toBe('saved');
  });

  it('un problema bloqueante manda sobre la validación del formulario', async () => {
    // Si se validara primero el formulario, el usuario arreglaría campos sin enterarse de que el
    // total no es confiable.
    const calc = calcular({
      rules: [
        makeRule({ code: 'A', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'B' } } }),
        makeRule({ code: 'B', stage: 'BASE', expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RULE', ruleCode: 'A' } } }),
      ],
    });
    expect((await emitSettlement(entrada({ calc, partyId: '' }))).status).toBe('blocked');
  });
});

// ── Consulta y cambio de estado ───────────────────────────────────────────────────────────────

describe('lista y estados', () => {
  it('filtra por compañía, estado y rango de fechas', async () => {
    await emitSettlement(entrada({ settlementDate: '2026-08-15' }));
    await emitSettlement(entrada({ settlementDate: '2026-09-20', partyId: 'CARRIER_VE_1', tripNumber: 'V-2' }));

    expect(await listSettlements({ partyId: 'SP_VE_OWN' })).toHaveLength(1);
    expect(await listSettlements({ from: '2026-09-01' })).toHaveLength(1);
    expect(await listSettlements({ to: '2026-08-31' })).toHaveLength(1);
    expect(await listSettlements({ from: '2026-08-01', to: '2026-09-30' })).toHaveLength(2);
  });

  it('cambia de estado', async () => {
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');

    expect((await updateSettlementStatus(result.settlement.id, 'Aprobado')).error).toBeNull();
    expect((await getSettlement(result.settlement.id))?.status).toBe('Aprobado');
  });

  it('desde la lista tampoco se aprueba una liquidación en pérdida', async () => {
    // La protección vive en los dos caminos: emitir y cambiar el estado después.
    const calc = calcular({ ownCostParams: { ...makeOwnCostParams(), driverDaily: '99999' } });
    const result = await emitSettlement(entrada({ calc, status: 'Borrador' }));
    if (result.status !== 'saved') throw new Error('no se emitió');

    const cambio = await updateSettlementStatus(result.settlement.id, 'Pagado');
    expect(cambio.error).toContain('pérdida');
    expect((await getSettlement(result.settlement.id))?.status).toBe('Borrador');
  });

  it('una liquidación se ANULA, no se borra', async () => {
    // Borrarla dejaría un hueco en la numeración y borraría la prueba de lo que se pagó.
    const result = await emitSettlement(entrada());
    if (result.status !== 'saved') throw new Error('no se emitió');

    await updateSettlementStatus(result.settlement.id, 'Anulado');

    expect((await getSettlement(result.settlement.id))?.status).toBe('Anulado');
    expect(await listSettlements({})).toHaveLength(1);
  });
});
