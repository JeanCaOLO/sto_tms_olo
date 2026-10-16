import { describe, expect, it } from 'vitest';
import { formatMoney, groupThousands } from '../format';

describe('groupThousands', () => {
  it('agrupa los miles y conserva los decimales exactos', () => {
    expect(groupThousands('28224.00')).toBe('28,224.00');
    expect(groupThousands('100000.00')).toBe('100,000.00');
    expect(groupThousands('1234567.891')).toBe('1,234,567.891');
  });

  it('no toca importes cortos, negativos ni enteros', () => {
    expect(groupThousands('999.50')).toBe('999.50');
    expect(groupThousands('-12345.60')).toBe('-12,345.60');
    expect(groupThousands('5000')).toBe('5,000');
  });

  it('devuelve igual lo que no es un decimal', () => {
    expect(groupThousands('')).toBe('');
    expect(groupThousands('abc')).toBe('abc');
    expect(groupThousands('1e6')).toBe('1e6');
  });

  it('no pierde precisión en importes de más de 15 dígitos', () => {
    expect(groupThousands('12345678901234567.89')).toBe('12,345,678,901,234,567.89');
  });
});

describe('formatMoney', () => {
  it('antepone el símbolo y agrupa los miles', () => {
    expect(formatMoney('28224.00', 'USD')).toBe('$28,224.00');
    expect(formatMoney('150000.00', 'CRC')).toBe('₡150,000.00');
  });

  it('en Venezuela usa Bs. y separadores es-VE (punto miles, coma decimales)', () => {
    expect(formatMoney('1500.00', 'VES')).toBe('Bs.1.500,00');
    expect(formatMoney('1234567.5', 'VES')).toBe('Bs.1.234.567,5');
  });

  it('con una moneda sin símbolo la pone al final', () => {
    expect(formatMoney('1500.00', 'PEN')).toBe('1,500.00 PEN');
  });
});
