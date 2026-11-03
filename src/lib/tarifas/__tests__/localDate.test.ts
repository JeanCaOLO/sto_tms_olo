import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatLocalDate, formatLocalDateTime } from '../localDate';

afterEach(() => vi.unstubAllEnvs());

// El backend manda los instantes en UTC ("…Z"). Cortar el texto con slice(0, 10) mostraba el día UTC: un evento de
// las 18:30 en Costa Rica (UTC-6) aparecía con la fecha del día siguiente.
describe('formatLocalDate', () => {
  it('muestra el día de la zona del navegador, no el de UTC', () => {
    vi.stubEnv('TZ', 'America/Costa_Rica'); // UTC-6
    expect(formatLocalDate('2026-10-16T03:00:00Z')).toBe('2026-10-15'); // 21:00 del 15 en Costa Rica
    expect(formatLocalDate('2026-10-16T12:00:00Z')).toBe('2026-10-16');
    expect(formatLocalDate('2026-10-17T00:30:00Z')).toBe('2026-10-16'); // 18:30 del 16
  });

  it('una fecha sin hora (YYYY-MM-DD) no se desplaza por la zona', () => {
    vi.stubEnv('TZ', 'America/Costa_Rica');
    expect(formatLocalDate('2026-10-16')).toBe('2026-10-16');
  });

  it('vacío o inválido da cadena vacía', () => {
    expect(formatLocalDate(null)).toBe('');
    expect(formatLocalDate(undefined)).toBe('');
    expect(formatLocalDate('')).toBe('');
    expect(formatLocalDate('no es una fecha')).toBe('');
  });
});

describe('formatLocalDateTime', () => {
  it('muestra fecha y hora (HH:mm) de la zona del navegador', () => {
    vi.stubEnv('TZ', 'America/Costa_Rica');
    expect(formatLocalDateTime('2026-10-17T00:30:00Z')).toBe('2026-10-16 18:30');
    expect(formatLocalDateTime('2026-10-16T09:05:00Z')).toBe('2026-10-16 03:05');
  });

  it('vacío o inválido da cadena vacía', () => {
    expect(formatLocalDateTime(null)).toBe('');
    expect(formatLocalDateTime('x')).toBe('');
  });
});
