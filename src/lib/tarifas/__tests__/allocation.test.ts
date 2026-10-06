// Reparto del total de un viaje entre las casas comerciales: tiene que cuadrar al centavo, siempre.

import { describe, expect, it } from 'vitest';
import { allocateTotal, allocationAddsUp } from '../allocation';
import { makeCountryVE } from './fixtures';
import type { CargoPart, CargoSummary } from '../types';

const country = makeCountryVE();

const part = (name: string, value: string, weightKg = 0, volumeM3 = 0, orders = 1): CargoPart => ({
  customerId: name, code: name, name, value, weightKg, volumeM3, items: 1, orders,
});
const cargo = (...parts: CargoPart[]): CargoSummary => ({
  value: '0', weightKg: 0, volumeM3: 0, orders: parts.length, parts,
});

describe('allocateTotal', () => {
  it('reparte por el valor de la mercancía', () => {
    const a = allocateTotal('1000.00', cargo(part('EPA', '3000'), part('COF', '1000')), 'VALUE', country)!;
    expect(a.basis).toBe('VALUE');
    expect(a.shares.map((s) => [s.code, s.share, s.amount])).toEqual([
      ['EPA', '0.750000', '750.00'], ['COF', '0.250000', '250.00'],
    ]);
    expect(allocationAddsUp(a)).toBe(true);
  });

  it('reparte por peso o por volumen cuando se pide', () => {
    const c = cargo(part('A', '1', 100, 9), part('B', '1', 300, 1));
    expect(allocateTotal('400.00', c, 'WEIGHT', country)!.shares.map((s) => s.amount)).toEqual(['100.00', '300.00']);
    expect(allocateTotal('100.00', c, 'VOLUME', country)!.shares.map((s) => s.amount)).toEqual(['90.00', '10.00']);
  });

  it('cuadra al centavo cuando el reparto no es exacto (el residuo va a la casa mayor)', () => {
    const c = cargo(part('A', '1'), part('B', '1'), part('C', '1'));
    const a = allocateTotal('100.00', c, 'VALUE', country)!;
    expect(a.shares.map((s) => s.amount)).toEqual(['33.34', '33.33', '33.33']);
    expect(allocationAddsUp(a)).toBe(true);
  });

  it('cuadra con cualquier mezcla de partes (propiedad)', () => {
    for (let n = 1; n <= 7; n += 1) {
      const parts = Array.from({ length: n }, (_v, i) => part(`C${i}`, String((i + 1) * 137.31)));
      for (const total of ['0.01', '1.00', '999.99', '12345.67']) {
        expect(allocationAddsUp(allocateTotal(total, cargo(...parts), 'VALUE', country)!)).toBe(true);
      }
    }
  });

  it('si la base elegida suma cero cae a repartir por pedidos y lo dice', () => {
    const c = cargo(part('A', '0', 0, 0, 3), part('B', '0', 0, 0, 1));
    const a = allocateTotal('400.00', c, 'VALUE', country)!;
    expect(a.basis).toBe('ORDERS');
    expect(a.shares.map((s) => s.amount)).toEqual(['300.00', '100.00']);
  });

  it('sin pedidos ni mercancía no hay reparto', () => {
    expect(allocateTotal('100.00', null, 'VALUE', country)).toBeNull();
    expect(allocateTotal('100.00', cargo(), 'VALUE', country)).toBeNull();
  });

  it('un solo cliente se queda con todo', () => {
    const a = allocateTotal('265.40', cargo(part('EPA', '10')), 'VALUE', country)!;
    expect(a.shares).toHaveLength(1);
    expect(a.shares[0]).toMatchObject({ share: '1.000000', amount: '265.40' });
  });
});
