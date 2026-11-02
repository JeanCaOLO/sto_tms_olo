import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viaje } from '../types';
import {
  ageSeconds, driverLoggedOut, formatAge, formatClock, formatDay, formatDistance, colorVariant, COLOR_HEX, lastSignalAt, legDone, matchesKpi, positioned,
  stopVariant, failedStopsOfActive,
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
    expect(colorVariant('green')).toBe('success');
    expect(colorVariant('amber')).toBe('warning');
    expect(colorVariant('gray')).toBe('default');
    expect(colorVariant('blue')).toBe('blue');
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

// El color del viaje lo calcula el backend (`map_color`) y es la única fuente: el punto del mapa, la leyenda y la
// insignia salen de él. Antes la insignia tenía su propio mapeo (activo sin señal en rojo, cancelado en rojo) y
// contradecía al mapa, que los pinta grises.
describe('un solo color por viaje', () => {
  const BADGE_OF_COLOR = { green: 'success', amber: 'warning', gray: 'default', blue: 'blue' } as const;

  it('cada color del mapa tiene una sola insignia y todas son distintas', () => {
    const colors = Object.keys(COLOR_HEX) as (keyof typeof COLOR_HEX)[];
    expect(colors.sort()).toEqual(['amber', 'blue', 'gray', 'green']);
    for (const color of colors) expect(colorVariant(color)).toBe(BADGE_OF_COLOR[color]);
    expect(new Set(colors.map(colorVariant)).size).toBe(colors.length);
  });

  it('un viaje activo sin señal o cancelado no sale rojo: es gris como en el mapa', () => {
    expect(colorVariant(viaje({ state: 'active', signal: 'offline', color: 'gray' }).color)).toBe('default');
    expect(colorVariant(viaje({ state: 'cancelled', signal: 'none', color: 'gray' }).color)).toBe('default');
    expect(colorVariant(viaje({ state: 'completed', signal: 'none', color: 'blue' }).color)).toBe('blue');
  });
});

describe('zona horaria y reloj', () => {
  afterEach(() => vi.unstubAllEnvs());

  // El backend cuenta "completados hoy" en la zona del país y, si el país no la tiene, en UTC. La pantalla usaba
  // la zona del navegador cuando faltaba: dos personas veían un número distinto al del tile.
  it('un viaje sin zona se cuenta como "hoy" en UTC, no en la zona del navegador', () => {
    vi.stubEnv('TZ', 'America/Costa_Rica'); // navegador en UTC-6
    const ahora = Date.parse('2026-10-16T15:00:00Z');
    // 21:00 del día 16 en el navegador, pero ya es el día 17 en UTC.
    const sinZona = viaje({ state: 'completed', timezone: null, ended_at: '2026-10-17T03:00:00Z' });
    expect(matchesKpi(sinZona, 'completed_today', ahora)).toBe(false);
    // Mismo día UTC: sí cuenta.
    expect(matchesKpi({ ...sinZona, ended_at: '2026-10-16T23:30:00Z' }, 'completed_today', ahora)).toBe(true);
  });

  it('con zona del país cuenta por el día local de ese país', () => {
    const ahora = Date.parse('2026-10-16T15:00:00Z'); // 09:00 del 16 en Costa Rica
    const cr = viaje({ state: 'completed', timezone: 'America/Costa_Rica', ended_at: '2026-10-17T03:00:00Z' }); // 21:00 del 16
    expect(matchesKpi(cr, 'completed_today', ahora)).toBe(true);
  });

  it('a medianoche el reloj marca 00:05 y no 24:05', () => {
    expect(formatClock('2026-10-31T00:05:00Z', 'UTC')).toBe('00:05');
    expect(formatClock('2026-10-31T06:05:00Z', 'America/Costa_Rica')).toBe('00:05');
  });
});

describe('tramo de la ruta hecho', () => {
  it('solo lo está si la parada de destino existe y ya no está pendiente', () => {
    expect(legDone('delivered')).toBe(true);
    expect(legDone('failed')).toBe(true);
    expect(legDone('pending')).toBe(false);
    // Una parada que no está en el detalle no es una parada "hecha".
    expect(legDone(undefined)).toBe(false);
  });
});

// El resumen del backend cuenta como "hechas" las entregadas MÁS las fallidas; para decir cuántas fallaron hay que sumarlas
// de los viajes cargados, y solo se puede si están todos los activos.
describe('paradas fallidas de los viajes en curso', () => {
  const con = (state: Viaje['state'], failed: number) => viaje({ state, progress: { total: 4, done: 2 + failed, delivered: 2, failed, percent: 50 } });

  it('suma las fallidas de los viajes activos cargados cuando están todos', () => {
    const viajes = [con('active', 1), con('active', 2), con('completed', 3)];
    expect(failedStopsOfActive(viajes, { active: 2 })).toBe(3);
  });

  it('con menos viajes activos cargados que los del resumen no se sabe: null', () => {
    expect(failedStopsOfActive([con('active', 1)], { active: 5 })).toBeNull();
  });

  it('sin resumen no se sabe', () => {
    expect(failedStopsOfActive([con('active', 1)], null)).toBeNull();
  });

  it('sin fallidas es 0, no null', () => {
    expect(failedStopsOfActive([con('active', 0)], { active: 1 })).toBe(0);
  });
});
