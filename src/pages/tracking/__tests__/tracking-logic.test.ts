import { describe, expect, it } from 'vitest';
import type { Viaje } from '../types';
import {
  ageSeconds, driverLoggedOut, formatAge, formatClock, formatDay, formatDistance, lastSignalAt, matchesKpi, positioned, stateVariant,
  stopVariant,
} from '../tracking-logic';

const NOW = Date.parse('2026-10-16T15:00:00Z');
const t = (key: string, o?: Record<string, unknown>) => `${o?.count}${key.replace('tracking.age', '')[0].toLowerCase()}`;

const viaje = (over: Partial<Viaje> = {}): Viaje => ({
  id: 'v1', route_number: 'VJ-1', state: 'active', phase: 'en_ruta', signal: 'online', color: 'green', driver_name: null, plate: null,
  zone_name: null, country: 'CR', timezone: 'America/Costa_Rica', started_at: null, ended_at: null, planned_end_at: null,
  route_date: null, due_date: null, assigned_at: null, days_late: 0, position: null, progress: { total: 4, done: 2, delivered: 2, failed: 0, percent: 50 }, delay_min: null, alerts: [],
  ...over,
});

describe('presencia del chofer', () => {
  const at = (iso: string) => ({ lat: 1, lng: 1, speed_mps: null, recorded_at: iso });

  it('la última señal es la más reciente entre el punto GPS y el latido en línea', () => {
    expect(lastSignalAt({ position: at('2026-10-16T14:48:00Z'), presence: { status: 'online', last_seen_at: '2026-10-16T14:59:00Z' } }))
      .toBe('2026-10-16T14:59:00Z');
    expect(lastSignalAt({ position: at('2026-10-16T14:59:30Z'), presence: { status: 'online', last_seen_at: '2026-10-16T14:50:00Z' } }))
      .toBe('2026-10-16T14:59:30Z');
    expect(lastSignalAt({ position: null, presence: { status: 'online', last_seen_at: '2026-10-16T14:59:00Z' } })).toBe('2026-10-16T14:59:00Z');
  });

  it('un latido de una sesión ya cerrada no cuenta, y sin datos no hay señal', () => {
    expect(lastSignalAt({ position: at('2026-10-16T14:48:00Z'), presence: { status: 'offline', last_seen_at: '2026-10-16T14:59:00Z' } }))
      .toBe('2026-10-16T14:48:00Z');
    expect(lastSignalAt({ position: null, presence: null })).toBeNull();
    expect(lastSignalAt({ position: null })).toBeNull();
    expect(lastSignalAt({ position: null, presence: { status: 'online', last_seen_at: 'no-fecha' } })).toBeNull();
  });

  it('detecta el cierre de sesión solo en viajes activos sin señal por ese motivo', () => {
    const out = { status: 'offline' as const, last_seen_at: '2026-10-16T14:59:00Z' };
    expect(driverLoggedOut(viaje({ signal: 'offline', presence: out }))).toBe(true);
    expect(driverLoggedOut(viaje({ signal: 'online', presence: out }))).toBe(false); // salió de nuevo: la señal manda
    expect(driverLoggedOut(viaje({ signal: 'offline', presence: null }))).toBe(false);
    expect(driverLoggedOut(viaje({ state: 'completed', signal: 'offline', presence: out }))).toBe(false);
  });
});

describe('tracking-logic', () => {
  it('calcula la antigüedad de la señal y la formatea con i18n', () => {
    expect(ageSeconds('2026-10-16T14:59:30Z', NOW)).toBe(30);
    expect(ageSeconds('2026-10-16T15:00:30Z', NOW)).toBe(0);
    expect(ageSeconds(null, NOW)).toBeNull();
    expect(ageSeconds('no-fecha', NOW)).toBeNull();
    expect(formatAge('2026-10-16T14:59:30Z', NOW, t)).toBe('30s');
    expect(formatAge('2026-10-16T14:50:00Z', NOW, t)).toBe('10m');
    expect(formatAge('2026-10-16T12:00:00Z', NOW, t)).toBe('3h');
    expect(formatAge('2026-10-13T15:00:00Z', NOW, t)).toBe('3d');
    expect(formatAge(undefined, NOW, t)).toBeNull();
  });

  it('muestra la hora en la zona del viaje', () => {
    expect(formatClock('2026-10-16T15:00:00Z', 'America/Costa_Rica')).toBe('09:00');
    expect(formatClock('2026-10-16T15:00:00Z', 'America/Caracas')).toBe('11:00');
    expect(formatClock(null)).toBeNull();
    expect(formatClock('2026-10-16T15:00:00Z', 'Zona/Inexistente')).not.toBeNull();
  });

  it('elige variantes de badge y filtra viajes con posición', () => {
    expect(stateVariant('active', 'online')).toBe('success');
    expect(stateVariant('active', 'stale')).toBe('warning');
    expect(stateVariant('active', 'offline')).toBe('danger');
    expect(stateVariant('completed', 'none')).toBe('info');
    expect(stopVariant('failed')).toBe('danger');
    expect(positioned([viaje(), viaje({ id: 'v2', position: { lat: 1, lng: 2, speed_mps: null, recorded_at: '' } })])).toHaveLength(1);
    expect(formatDay('2026-10-02')).toMatch(/2/);
    expect(formatDay('2026-10-02T03:00:00Z', 'America/Costa_Rica')).toBe(formatDay('2026-10-01'));  // 21:00 del día anterior
    expect(formatDay(null)).toBeNull();
    expect(formatDay('x')).toBeNull();
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(12400)).toBe('12.4 km');
  });

  it('los KPIs filtran por viaje con la misma definición que el backend', () => {
    const late = viaje({ alerts: [{ code: 'late', count: 30 }] });
    const noSignal = viaje({ alerts: [{ code: 'no_signal' }] });
    const doneToday = viaje({ state: 'completed', ended_at: '2026-10-16T14:00:00Z' });
    const doneYesterday = viaje({ state: 'completed', ended_at: '2026-10-15T14:00:00Z' });
    expect(matchesKpi(late, 'late', NOW)).toBe(true);
    expect(matchesKpi(late, 'on_time', NOW)).toBe(false);
    expect(matchesKpi(noSignal, 'no_signal', NOW)).toBe(true);
    expect(matchesKpi(viaje(), 'active', NOW)).toBe(true);
    expect(matchesKpi(doneToday, 'completed_today', NOW)).toBe(true);
    expect(matchesKpi(doneYesterday, 'completed_today', NOW)).toBe(false);
    expect(matchesKpi(doneToday, 'active', NOW)).toBe(false);
  });
});
