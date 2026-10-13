// @vitest-environment jsdom
//
// Regresiones de precisión: el dinero nunca pasa por `number` en los bordes (importación, formularios,
// reparto de mercancía) y la carga masiva de tarifarios es atómica.

import { beforeEach, describe, expect, it } from 'vitest';
import { parseAmount } from '../costSheetParser';
import { pctToDisplay, cmpMoney, parseMoneyInput, sumMoney, toDecimal } from '../money';
import { percentToFraction, validateBuilder } from '../rule-builder';
import { cargoFromOrders } from '../tripOrders';
import { bulkUpsertRows, listRateTableRows, saveRateTable } from '../rateTablesDataSource';
import type { RuleBuilderForm, TripOrder } from '../types';

beforeEach(() => { localStorage.clear(); });

describe('money helpers', () => {
  it('suma centavos sin error de coma flotante', () => {
    expect(sumMoney(['0.1', '0.2']).toFixed()).toBe('0.3');
    expect(sumMoney([]).toFixed()).toBe('0');
  });
  it('compara montos exactos', () => {
    expect(cmpMoney('0.30', '0.3')).toBe(0);
    expect(cmpMoney('1.01', '1.1')).toBe(-1);
  });
  it('convierte fracciones a porcentaje', () => {
    expect(pctToDisplay('0.155')).toBe('15.50');
  });
  it('rechaza valores no finitos y texto inválido', () => {
    expect(() => toDecimal(Number.NaN)).toThrow();
    expect(() => toDecimal(Number.POSITIVE_INFINITY)).toThrow();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('12,5')?.toFixed()).toBe('12.5');
  });
});

describe('parseAmount', () => {
  it('conserva más de 15 cifras significativas', () => {
    expect(parseAmount('12345678901234567.89', 'en')).toBe('12345678901234567.89');
  });
  it('no genera notación exponencial', () => {
    expect(parseAmount(0.0000001)).toBe('0.0000001');
  });
  it('maneja paréntesis, formato es y basura', () => {
    expect(parseAmount('(1.234,50)', 'es')).toBe('-1234.5');
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1-2')).toBeNull();
    expect(parseAmount('-0')).toBe('0');
  });
});

describe('percentToFraction', () => {
  it('no arrastra error de float (1.1 / 100)', () => {
    expect(percentToFraction('1.1', 'INCREASE')).toBe('0.011');
    expect(percentToFraction('1.1', 'DECREASE')).toBe('-0.011');
  });
  it('texto inválido da 0', () => {
    expect(percentToFraction('x', 'INCREASE')).toBe('0');
  });
});

describe('validateBuilder: tope y piso', () => {
  const form = (min: string, max: string): RuleBuilderForm => ({
    variable: null, operator: 'FIXED', value: '10', effect: 'INCREASE', clamp: { min, max },
  } as RuleBuilderForm);

  it('rechaza piso mayor que tope y valores no numéricos', () => {
    expect(validateBuilder(form('10', '5')).clamp).toMatch(/mayor/);
    expect(validateBuilder(form('abc', '5')).clamp).toMatch(/números/);
  });
  it('acepta un rango válido', () => {
    expect(validateBuilder(form('5', '10')).clamp).toBeUndefined();
  });
});

describe('cargoFromOrders: suma exacta', () => {
  const order = (id: string, value: string, weightKg: number): TripOrder => ({
    guideId: `g-${id}`, guideNumber: `GD-${id}`, sequence: Number(id), deliveryStatus: 'delivered',
    orderId: `o-${id}`, orderNumber: `PED-${id}`, customerId: 'EPA', customerCode: 'EPA', customerName: 'EPA',
    value, weightKg, volumeM3: 0.1, items: 1, mark: null, markReason: null,
  });

  it('no redondea a 2 decimales por pedido ni suma floats', () => {
    const cargo = cargoFromOrders([order('1', '0.005', 0.1), order('2', '0.005', 0.2)])!;
    expect(cargo.value).toBe('0.01');
    expect(cargo.weightKg).toBe(0.3);
    expect(cargo.volumeM3).toBe(0.2);
  });
  it('conserva el formato de 2 decimales', () => {
    expect(cargoFromOrders([order('1', '3000', 1)])!.value).toBe('3000.00');
  });
});

describe('bulkUpsertRows', () => {
  it('una clave repetida en el archivo pisa (gana la última) en vez de duplicar', async () => {
    const saved = await saveRateTable({
      countryId: 'CR', partyId: null, code: 'DUP', name: 'Dup', keyColumns: ['truckTypeId'], active: true,
    });
    if (saved.status !== 'saved') throw new Error('no se guardó la tabla');

    const result = await bulkUpsertRows(saved.table.id, [
      { key: ['NPR'], amount: '10' }, { key: ['NPR'], amount: '20' }, { key: ['NKR'], amount: '5' },
    ], 'replace');

    expect(result).toMatchObject({ inserted: 2, replaced: 0, error: null });
    const rows = await listRateTableRows(saved.table.id);
    expect(rows.map((r) => [r.key[0], r.amount]).sort()).toEqual([['NKR', '5'], ['NPR', '20']]);
  });
});
