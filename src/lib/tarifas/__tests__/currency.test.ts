import { describe, expect, it } from 'vitest';
import { settlementCurrency } from '../currency';

describe('settlementCurrency', () => {
  it('Costa Rica con USD en el catálogo se liquida en colones', () => {
    expect(settlementCurrency('CR', 'USD')).toBe('CRC');
    expect(settlementCurrency('cr', 'USD')).toBe('CRC');
  });

  it('si el catálogo ya trae CRC, no cambia nada', () => {
    expect(settlementCurrency('CR', 'CRC')).toBe('CRC');
  });

  it('los demás países conservan la moneda del catálogo', () => {
    expect(settlementCurrency('VN', 'USD')).toBe('USD');
    expect(settlementCurrency('VE', 'VES')).toBe('VES');
  });

  it('sin código de país devuelve la moneda del catálogo', () => {
    expect(settlementCurrency(null, 'USD')).toBe('USD');
    expect(settlementCurrency(undefined, 'COP')).toBe('COP');
  });
});
