import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackingApiError } from '../api-remote';
import {
  driveMinutes, getSimulation, haversineM, localComplete, localDetail, localList, localPlanned, localReview, localStart, localSummary, resetLocalData, setSimulation, simNow,
} from '../local-store';

beforeEach(() => {
  vi.useRealTimers();
  resetLocalData();
});

describe('datos locales del tracking', () => {
  it('calcula distancias y tiempos con la regla del backend', () => {
    expect(Math.round(haversineM([9.93, -84.08], [9.93, -84.07]))).toBeGreaterThan(1000);
    expect(driveMinutes(1000)).toBeCloseTo(2.7, 1); // 1 km x 1,35 a 30 km/h
  });

  it('lista activos con fases, señales y alertas de los escenarios', () => {
    const { items } = localList('active', '', 50);
    const by = (n: string) => items.find((v) => v.route_number === `VJ-DEMO-${n}`)!;
    expect(items.every((v) => v.state === 'active')).toBe(true);
    expect(by('CR-04').phase).toBe('por_salir');
    expect(by('CR-01').phase).toBe('en_ruta');
    expect(by('CR-03').alerts.map((a) => a.code)).toContain('no_signal');
    expect(by('CR-05').alerts.map((a) => a.code)).toContain('stopped');
    expect(by('CR-06').alerts.map((a) => a.code)).toEqual(expect.arrayContaining(['incident', 'failed']));
    expect(by('VN-02').alerts.map((a) => a.code)).toContain('late');
    expect(by('CR-01').signal).toBe('online');
    expect(by('CR-01').color).toBe('green');
  });

  it('asigna semáforo verde, ámbar y rojo a los completados', () => {
    const { items } = localList('all', '', 50);
    const color = (n: string) => items.find((v) => v.route_number === `VJ-DEMO-${n}`)!.review!;
    expect(color('CR-C1').color).toBe('green');
    expect(color('VN-C2').color).toBe('amber');
    expect(color('VN-C2').reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['returns', 'pickups', 'incidents']));
    expect(color('CR-C3').color).toBe('red');
    expect(color('VN-C4').reviewed_at).not.toBeNull();
  });

  it('filtra por revisar y por búsqueda', () => {
    const review = localList('review', '', 50).items;
    expect(review.map((v) => v.route_number).sort()).toEqual(['VJ-DEMO-CR-C1', 'VJ-DEMO-CR-C3', 'VJ-DEMO-VN-C2']);
    expect(localList('all', 'mora', 50).items.every((v) => v.driver_name === 'Luis Mora Castillo')).toBe(true);
    expect(localList('all', '', 3).items).toHaveLength(3);
  });

  it('filtra viajes, KPIs y planificados por el país del selector global', () => {
    const cr = localList('all', '', 50, 'CR').items;
    const ve = localList('all', '', 50, 'VE').items;
    expect(cr.length + ve.length).toBe(localList('all', '', 50).items.length);
    expect(cr.every((v) => v.route_number.includes('-CR-'))).toBe(true);
    expect(ve.every((v) => v.route_number.includes('-VN-'))).toBe(true);
    expect(localList('all', '', 50, 'CO').items).toHaveLength(0);
    expect(localSummary('CR').active + localSummary('VE').active).toBe(localSummary().active);
    expect(localSummary('VE').to_review).toBe(1);
    expect(localPlanned('VE').map((p) => p.plan_trip_id)).toEqual(['plan-vn-01']);
    expect(localPlanned('CR')).toHaveLength(2);
  });

  it('devuelve detalle con paradas, ETA y evidencias', () => {
    const detail = localDetail('demo-cr-01');
    expect(detail.stops).toHaveLength(4);
    expect(detail.stops[0].evidences.map((e) => e.kind)).toEqual(['photo_invoice', 'signature']);
    const pending = detail.stops.filter((s) => s.state === 'pending');
    expect(pending.every((s) => s.eta_at && s.distance_m != null && s.planned_arrival_at)).toBe(true);
    const nearest = [...pending].sort((a, b) => a.distance_m! - b.distance_m!)[0];
    expect(detail.next_stop_id).toBe(nearest.id);
    expect(() => localDetail('no-existe')).toThrow(TrackingApiError);
  });

  it('resume los KPIs', () => {
    const r = localSummary();
    expect(r.active).toBe(9);
    expect(r.departing).toBe(2);
    expect(r.to_review).toBe(3);
    expect(r.on_time + r.late).toBe(r.active);
  });

  it('inicia un viaje planificado y no lo ofrece de nuevo', () => {
    expect(localPlanned()).toHaveLength(3);
    expect(localStart('plan-cr-01').created).toBe(true);
    expect(localStart('plan-cr-01').created).toBe(false);
    expect(localPlanned().map((p) => p.plan_trip_id)).not.toContain('plan-cr-01');
    expect(localDetail('trip-plan-cr-01').phase).toBe('por_salir');
    expect(() => localStart('x')).toThrow(TrackingApiError);
  });

  it('el camión avanza y completa el viaje al pasar el tiempo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    resetLocalData();
    for (let i = 0; i < 400; i++) {
      vi.advanceTimersByTime(10_000);
      localList('active', '', 50);
    }
    const detail = localDetail('demo-cr-01');
    expect(detail.state).toBe('completed');
    expect(detail.stops.every((s) => s.state === 'delivered')).toBe(true);
    expect(detail.review).not.toBeNull();
  });

  it('completa con confirmación y revisa solo completados', () => {
    expect(() => localComplete('demo-cr-02', false)).toThrow(/pendientes/);
    expect(localComplete('demo-cr-02', true).pending).toBe(3);
    expect(localDetail('demo-cr-02').state).toBe('completed');
    expect(() => localReview('demo-cr-03', 'x')).toThrow(TrackingApiError);
    localReview('demo-cr-c1', 'ok');
    expect(localDetail('demo-cr-c1').review).toMatchObject({ reviewed_by: 'Administrador OLO', note: 'ok' });
    expect(localSummary().to_review).toBe(3); // C3 y C2 + el CR-02 recién completado
  });

  it('la pausa congela el reloj y los camiones; la velocidad lo acelera', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    resetLocalData();
    const t0 = simNow();
    vi.advanceTimersByTime(10_000);
    expect(simNow() - t0).toBe(50_000); // 5x por defecto

    setSimulation({ paused: true });
    const before = localDetail('demo-cr-01');
    vi.advanceTimersByTime(60_000);
    const after = localDetail('demo-cr-01');
    expect(after.position).toEqual(before.position);
    expect(after.progress).toEqual(before.progress);

    setSimulation({ paused: false, speed: 60 });
    const t1 = simNow();
    vi.advanceTimersByTime(1000);
    expect(simNow() - t1).toBe(60_000);
    expect(setSimulation({ speed: 7 }).speed).toBe(60); // velocidad no permitida: se ignora
    expect(getSimulation()).toEqual({ speed: 60, paused: false });
  });

  it('el estado del viaje cambia mientras avanza (entregas y evidencias)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    resetLocalData();
    setSimulation({ speed: 60 });
    const start = localDetail('demo-cr-01');
    for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(2000); localList('active', '', 50); }
    const later = localDetail('demo-cr-01');
    expect(later.progress.done).toBeGreaterThan(start.progress.done);
    expect(start.stops[1].state).toBe('pending');
    expect(later.stops[1].state).toBe('delivered');
    expect(later.stops[1].evidences.length).toBeGreaterThan(0);
  });
});
