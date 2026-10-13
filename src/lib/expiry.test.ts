import { describe, it, expect } from 'vitest';
import { daysUntil, expiryStatus } from './expiry';

const TODAY = new Date('2026-10-12T09:00:00');

describe('daysUntil', () => {
  it('cuenta días calendario a futuro', () => {
    expect(daysUntil('2026-10-22', TODAY)).toBe(10);
  });
  it('es negativo para fechas pasadas', () => {
    expect(daysUntil('2026-10-01', TODAY)).toBe(-11);
  });
  it('devuelve null sin fecha o fecha inválida', () => {
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('no-es-fecha', TODAY)).toBeNull();
  });
});

describe('expiryStatus', () => {
  it('ok cuando faltan más de 30 días', () => {
    expect(expiryStatus('2026-12-01', TODAY)).toBe('ok');
  });
  it('due_soon cuando falta 1 mes o menos', () => {
    expect(expiryStatus('2026-11-11', TODAY)).toBe('due_soon'); // 30 días
    expect(expiryStatus('2026-10-13', TODAY)).toBe('due_soon'); // mañana
  });
  it('expired cuando ya pasó', () => {
    expect(expiryStatus('2026-10-11', TODAY)).toBe('expired');
  });
  it('none sin fecha', () => {
    expect(expiryStatus(null, TODAY)).toBe('none');
    expect(expiryStatus('', TODAY)).toBe('none');
  });
  it('hoy mismo cuenta como due_soon, no expired', () => {
    expect(expiryStatus('2026-10-12', TODAY)).toBe('due_soon');
  });
});
