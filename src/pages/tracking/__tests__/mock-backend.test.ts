import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeTrackingBackend } from '../mock/fakeTrackingBackend';
import { driveMinutes, getSimulation, haversineM, resetSimulation, setRoadProvider, setSimulation, simNow, simPlanClose } from '../mock/sim';
import type { ViajeDetalle, ViajesPage } from '../types';

const backend = createFakeTrackingBackend({ latencyMs: 0 });
const get = async <T>(path: string) => {
  const res = await backend(`/v1/tracking${path}`);
  if (!res.ok) throw Object.assign(new Error(res.body.error.message), { status: res.status });
  return res.body.data as T;
};

beforeEach(() => { setRoadProvider(null); resetSimulation(); });

describe('backend simulado del tracking (contrato v2)', () => {
  it('calcula distancias y tiempos con la regla del backend', () => {
    expect(Math.round(haversineM([9.93, -84.08], [9.93, -84.07]))).toBeGreaterThan(1000);
    expect(driveMinutes(1000)).toBeCloseTo(2.7, 1); // 1 km x 1,35 a 30 km/h
  });

  it('lista activos con fases, señales y alertas (sin novedades ni revisión)', async () => {
    const { items } = await get<ViajesPage>('/viajes?activos=1&limit=50');
    const by = (n: string) => items.find((v) => v.route_number === `VJ-DEMO-${n}`)!;
    expect(items.every((v) => v.state === 'active')).toBe(true);
    expect(by('CR-04').phase).toBe('por_salir');
    expect(by('CR-01').phase).toBe('en_ruta');
    expect(by('CR-03').alerts.map((a) => a.code)).toContain('no_signal');
    expect(by('CR-05').alerts.map((a) => a.code)).toContain('stopped');
    expect(by('CR-06').alerts.map((a) => a.code)).toEqual(['failed']);
    expect(by('VN-02').alerts.map((a) => a.code)).toContain('late');
    expect(by('CR-01')).toMatchObject({ signal: 'online', color: 'green', country: 'CR', timezone: 'America/Costa_Rica' });
    expect(by('CR-01')).not.toHaveProperty('review');
    expect(by('CR-01')).not.toHaveProperty('incidents');
  });

  it('el resumen cuenta VIAJES y respeta el país', async () => {
    const all = await get<ViajesPage>('/viajes?activos=1&limit=50&include=summary');
    const s = all.summary!;
    expect(s.active).toBe(all.items.length);
    expect(s.on_time + s.late).toBe(s.active);
    expect(Object.keys(s).sort()).toEqual(['active', 'completed_today', 'late', 'no_signal', 'on_time']);
    const cr = await get<ViajesPage>('/viajes?activos=1&limit=50&pais=CR&include=summary');
    expect(cr.items.every((v) => v.country === 'CR')).toBe(true);
    expect(cr.summary!.active).toBeLessThan(s.active);
    expect((await get<ViajesPage>('/viajes?limit=5')).summary).toBeUndefined();
  });

  it('pagina con cursor sin repetir viajes', async () => {
    const first = await get<ViajesPage>('/viajes?limit=5');
    expect(first.next_cursor).not.toBeNull();
    const second = await get<ViajesPage>(`/viajes?limit=5&cursor=${first.next_cursor}`);
    const ids = new Set(first.items.map((v) => v.id));
    expect(second.items.some((v) => ids.has(v.id))).toBe(false);
    await expect(get('/viajes?limit=0')).rejects.toMatchObject({ status: 400 });
  });

  it('el detalle trae sede, siguiente parada por secuencia y solo factura + firma', async () => {
    const d = await get<ViajeDetalle>('/viajes/demo-cr-01');
    expect(d.origin).toMatchObject({ name: 'CD-CR' });
    expect(d.next_stop_id).toBe(d.stops.find((s) => s.state === 'pending')!.id);
    const kinds = d.stops.flatMap((s) => s.evidences.map((e) => e.kind));
    expect(new Set(kinds)).toEqual(new Set(['photo_invoice', 'signature']));
    expect(d).not.toHaveProperty('events');
    expect(d).not.toHaveProperty('trail');
    expect(d.stops[0]).not.toHaveProperty('incidents');
    await expect(get('/viajes/no-existe')).rejects.toMatchObject({ status: 404 });
  });

  it('inicia un plan (idempotente) y deja de ofrecerlo', async () => {
    const [plan] = await get<{ plan_trip_id: string }[]>('/planificados');
    const first = await backend(`/v1/tracking/viajes/${plan.plan_trip_id}/iniciar`, { method: 'POST', body: '{}' });
    expect(first.status).toBe(201);
    const again = await backend(`/v1/tracking/viajes/${plan.plan_trip_id}/iniciar`, { method: 'POST', body: '{}' });
    expect(again.body.data.created).toBe(false);
    expect((await get<{ plan_trip_id: string }[]>('/planificados')).some((p) => p.plan_trip_id === plan.plan_trip_id)).toBe(false);
  });

  it('los planificados respetan el país', async () => {
    const all = await get<{ plan_trip_id: string }[]>('/planificados');
    const vn = await get<{ plan_trip_id: string }[]>('/planificados?pais=VN');
    const none = await get<{ plan_trip_id: string }[]>('/planificados?pais=XX');
    expect(vn.length).toBeGreaterThan(0);
    expect(vn.length).toBeLessThanOrEqual(all.length);
    expect(none).toEqual([]);
  });

  it('valida el país y solo manda KPIs en la primera página', async () => {
    await expect(get('/viajes?pais=C1')).rejects.toMatchObject({ status: 400 });
    expect((await get<ViajesPage>('/viajes?pais=cr&limit=50')).items.every((v) => v.country === 'CR')).toBe(true);
    const first = await get<ViajesPage>('/viajes?limit=3&include=summary');
    expect(first.summary).toBeDefined();
    const second = await get<ViajesPage>(`/viajes?limit=3&include=summary&cursor=${first.next_cursor}`);
    expect(second.summary).toBeUndefined();
  });

  it('un viaje sin GPS todavía: sin posición, señal none, sin alerta ni ETA', async () => {
    const { items } = await get<ViajesPage>('/viajes?activos=1&limit=50');
    const v = items.find((x) => x.route_number === 'VJ-DEMO-CR-07')!;
    expect(v).toMatchObject({ position: null, signal: 'none', color: 'gray', alerts: [], delay_min: null, phase: 'por_salir' });
    const d = await get<ViajeDetalle>(`/viajes/${v.id}`);
    expect(d.stops.every((s) => s.eta_at === null)).toBe(true);
  });

  it('Planificación termina o cancela un viaje: Tracking lo muestra cerrado y fuera de Activos', async () => {
    const before = (await get<ViajesPage>('/viajes?activos=1&limit=50&include=summary')).summary!;
    simPlanClose('demo-cr-01', 'completed');
    simPlanClose('demo-cr-02', 'cancelled');
    const after = await get<ViajesPage>('/viajes?activos=1&limit=50&include=summary');
    expect(after.items.some((v) => v.id === 'demo-cr-01' || v.id === 'demo-cr-02')).toBe(false);
    expect(after.summary!.active).toBe(before.active - 2);
    expect(after.summary!.completed_today).toBe(before.completed_today + 1); // la cancelada no cuenta
    const all = (await get<ViajesPage>('/viajes?limit=50')).items;
    expect(all.find((v) => v.id === 'demo-cr-01')).toMatchObject({ state: 'completed', color: 'blue', alerts: [] });
    expect(all.find((v) => v.id === 'demo-cr-02')).toMatchObject({ state: 'cancelled', color: 'gray' });
    expect(() => simPlanClose('demo-cr-01', 'cancelled')).toThrow(/ya está cerrado/);
  });

  it('cerrar la última parada no termina el viaje (lo termina Planificación)', async () => {
    const d = await get<ViajeDetalle>('/viajes/demo-cr-c1');
    expect(d.state).toBe('completed'); // escenario ya cerrado del JSON
    const { items } = await get<ViajesPage>('/viajes?activos=1&limit=50');
    expect(items.every((v) => v.state === 'active')).toBe(true);
  });

  it('rutas desconocidas responden 404 y la pausa congela el reloj', async () => {
    expect((await backend('/v1/tracking/viajes/x/completar', { method: 'POST' })).status).toBe(404);
    setSimulation({ paused: true });
    const t0 = simNow();
    await new Promise((r) => setTimeout(r, 20));
    expect(simNow()).toBe(t0);
    expect(getSimulation().paused).toBe(true);
  });
});
