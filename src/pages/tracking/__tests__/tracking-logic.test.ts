import { describe, expect, it } from 'vitest';
import type { Viaje } from '../types';
import { ageSeconds, formatAge, positioned, readyToComplete, speedKmh, stateVariant, stopVariant } from '../tracking-logic';

const NOW = Date.parse('2026-10-16T15:00:00Z');

const viaje = (over: Partial<Viaje> = {}): Viaje => ({
  id: 'v1', route_number: 'VJ-1', state: 'active', status_raw: 'En tránsito', signal: 'online', color: 'green',
  driver_name: null, plate: null, carrier_name: null, zone_name: null, started_at: null, ended_at: null,
  route_date: null, position: null, progress: { total: 4, done: 2, delivered: 2, failed: 0, percent: 50 }, ...over,
});

describe('tracking-logic', () => {
  it('calcula la antigüedad de la señal en segundos y la formatea corto', () => {
    expect(ageSeconds('2026-10-16T14:59:30Z', NOW)).toBe(30);
    expect(ageSeconds('2026-10-16T15:00:30Z', NOW)).toBe(0);
    expect(ageSeconds(null, NOW)).toBeNull();
    expect(ageSeconds('no-fecha', NOW)).toBeNull();
    expect(formatAge('2026-10-16T14:59:30Z', NOW)).toBe('30 s');
    expect(formatAge('2026-10-16T14:50:00Z', NOW)).toBe('10 min');
    expect(formatAge('2026-10-16T12:00:00Z', NOW)).toBe('3 h');
    expect(formatAge('2026-10-13T15:00:00Z', NOW)).toBe('3 d');
    expect(formatAge(undefined, NOW)).toBeNull();
  });

  it('elige la variante del badge según estado y señal', () => {
    expect(stateVariant('active', 'online')).toBe('success');
    expect(stateVariant('active', 'stale')).toBe('warning');
    expect(stateVariant('active', 'offline')).toBe('danger');
    expect(stateVariant('active', 'none')).toBe('default');
    expect(stateVariant('completed', 'none')).toBe('info');
    expect(stateVariant('planned', 'none')).toBe('default');
    expect(stopVariant('delivered')).toBe('success');
    expect(stopVariant('failed')).toBe('danger');
    expect(stopVariant('pending')).toBe('default');
  });

  it('solo pinta en el mapa los viajes con posición', () => {
    const withPosition = viaje({ id: 'a', position: { lat: 9.9, lng: -84, speed_mps: 1, heading_deg: 0, battery_pct: 50, recorded_at: 'x' } });
    expect(positioned([withPosition, viaje({ id: 'b' })]).map((v) => v.id)).toEqual(['a']);
  });

  it('convierte m/s a km/h', () => {
    expect(speedKmh(10)).toBe(36);
    expect(speedKmh(null)).toBeNull();
  });

  it('un viaje está listo para completar solo si está activo y todas las paradas están cerradas', () => {
    expect(readyToComplete(viaje())).toBe(false);
    expect(readyToComplete(viaje({ progress: { total: 4, done: 4, delivered: 3, failed: 1, percent: 100 } }))).toBe(true);
    expect(readyToComplete(viaje({ state: 'completed', progress: { total: 4, done: 4, delivered: 4, failed: 0, percent: 100 } }))).toBe(false);
    expect(readyToComplete(viaje({ progress: { total: 0, done: 0, delivered: 0, failed: 0, percent: 0 } }))).toBe(false);
  });
});
