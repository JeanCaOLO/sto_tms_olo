// Modelo de 3 valores de costo por km (operativo / facturable / venta).

import { describe, expect, it } from 'vitest';
import { computePerKm, PerKmInputError } from '../cost/perKm';

describe('computePerKm', () => {
  it('sin km vacíos ni margen, los tres valores coinciden', () => {
    const r = computePerKm({ operatingPerKm: '100' });
    expect(r.operatingPerKm.toString()).toBe('100');
    expect(r.billablePerKm.toString()).toBe('100');
    expect(r.salePerKm.toString()).toBe('100');
  });

  it('facturable = operativo ÷ proporción con carga', () => {
    const r = computePerKm({ operatingPerKm: '100', loadedKmRatio: '0.8' });
    expect(r.billablePerKm.toFixed(2)).toBe('125.00');
  });

  it('venta = facturable ÷ (1 − margen)', () => {
    const r = computePerKm({ operatingPerKm: '100', loadedKmRatio: '0.8', margin: '0.2' });
    expect(r.salePerKm.toFixed(2)).toBe('156.25'); // 125 ÷ 0.8
  });

  it('el margen es sobre la venta: la utilidad es margen × venta', () => {
    const r = computePerKm({ operatingPerKm: '60', margin: '0.4' });
    expect(r.salePerKm.toFixed(2)).toBe('100.00');
    expect(r.salePerKm.minus(r.billablePerKm).dividedBy(r.salePerKm).toFixed(2)).toBe('0.40');
  });

  it.each([
    [{ operatingPerKm: '-1' }],
    [{ operatingPerKm: 'abc' }],
    [{ operatingPerKm: '10', margin: '1' }],
    [{ operatingPerKm: '10', margin: '1.5' }],
    [{ operatingPerKm: '10', margin: '-0.1' }],
    [{ operatingPerKm: '10', loadedKmRatio: '0' }],
    [{ operatingPerKm: '10', loadedKmRatio: '1.2' }],
  ])('rechaza datos inválidos %j', (input) => {
    expect(() => computePerKm(input)).toThrow(PerKmInputError);
  });
});
