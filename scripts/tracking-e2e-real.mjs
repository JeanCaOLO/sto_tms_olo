// E2E de la ingesta de Tracking contra un backend REAL (api:local con túnel, sandbox o qa).
// Inicia UN viaje planificado del país, mueve el camión por POST /posiciones y comprueba salida de sede, ETA,
// idempotencia, puntos mock/imprecisos, geocerca y paradas fallidas. Deja el viaje de prueba creado: bórralo con
//   node --env-file=.env.local scripts/limpiar-tracking-prueba.mjs --route <route_number> --execute
//
// Uso: TMS_TOKEN=<jwt> node scripts/tracking-e2e-real.mjs [--api http://localhost:4001] [--pais CR]
// El usuario del token necesita tracking:view/create/edit. Sale con código 1 si algún chequeo falla.
import { randomUUID } from 'node:crypto';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const api = arg('api', 'http://localhost:4000').replace(/\/$/, '');
const pais = arg('pais', 'CR');
const token = process.env.TMS_TOKEN;
const planArg = arg('plan', null); // plan_trip_id con paradas geocodificadas (si no, el primero con >= 3 paradas)
if (!token) { console.error('Falta TMS_TOKEN.'); process.exit(1); }

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
async function call(method, path, body) {
  const response = await fetch(`${api}/api/v1/tracking${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, data: json?.data, error: json?.error?.message };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const metersPerDegLat = 110574;
const offset = ([lat, lng], northM, eastM) => [lat + northM / metersPerDegLat, lng + eastM / (111320 * Math.cos((lat * Math.PI) / 180))];
const pos = (route_id, [lat, lng], minutesAgo, extra = {}) => ({
  client_id: randomUUID(), route_id, lat, lng, accuracy_m: 10, speed_mps: 8,
  recorded_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), ...extra,
});

// --- 1. elegir e iniciar -------------------------------------------------------------------------------
const planned = await call('GET', `/planificados?pais=${pais}`);
check(planned.status === 200, `GET /planificados?pais=${pais}`, `${planned.data?.length ?? 0} viajes`);
const plan = planArg ? { plan_trip_id: planArg } : (planned.data ?? []).find((p) => p.stops >= 3) ?? (planned.data ?? [])[0];
if (!plan) { console.log(`Sin viajes planificados sin iniciar en ${pais}.`); process.exit(1); }

const [a, b] = await Promise.all([call('POST', `/viajes/${plan.plan_trip_id}/iniciar`, {}), call('POST', `/viajes/${plan.plan_trip_id}/iniciar`, {})]);
const created = [a, b].filter((r) => r.data?.created === true).length;
check([a, b].every((r) => r.status < 300) && created === 1, 'dos "iniciar" simultáneos: uno crea, el otro recupera (sin 500)', `${a.status}/${b.status}, creados ${created}`);
const routeId = (a.data?.route_id ?? b.data?.route_id);
const again = await call('POST', `/viajes/${plan.plan_trip_id}/iniciar`, {});
check(again.status === 200 && again.data?.created === false && again.data?.route_id === routeId, '"iniciar" repetido es idempotente');
if (!routeId) process.exit(1);

// --- 2. estado inicial ---------------------------------------------------------------------------------
let { data: d } = await call('GET', `/viajes/${routeId}`);
console.log(`     viaje ${d.route_number} · ${d.stops.length} paradas · sede ${d.origin ? 'con' : 'SIN'} coordenadas`);
check(d.phase === 'por_salir' && d.signal === 'none', 'antes de moverse: por_salir y sin GPS', `${d.phase}/${d.signal}`);
check(!d.alerts.some((x) => ['no_signal', 'late', 'stopped'].includes(x.code)), 'sin GPS no hay alertas de señal/retraso/detenido');
const stops = [...d.stops].sort((x, y) => x.sequence - y.sequence).filter((s) => s.lat != null);
const start = d.origin ? [d.origin.lat, d.origin.lng] : offset([stops[0].lat, stops[0].lng], 3000, 0);

// --- 3. salida de sede y movimiento --------------------------------------------------------------------
const near = pos(routeId, offset(start, 20, 0), 12);            // en la sede (< 300 m)
const out1 = pos(routeId, offset(start, 600, 0), 8);            // > 300 m: salió
const out2 = pos(routeId, offset(start, 1500, 300), 4);
const batch = [near, out1, out2];
let r = await call('POST', '/posiciones', { positions: batch, device_id: 'e2e-real' });
check(r.status === 200 && r.data.accepted === 3, 'POST /posiciones acepta 3', JSON.stringify(r.data));
({ data: d } = await call('GET', `/viajes/${routeId}`));
check(d.departed_at != null, 'departed_at se llena al salir > 300 m', d.departed_at ?? 'null');
check(d.phase === 'en_ruta' && d.signal === 'online', 'fase en_ruta y señal online', `${d.phase}/${d.signal}`);
const firstDist = d.stops.find((s) => s.id === d.next_stop_id)?.distance_m;
check(d.position && Math.abs(d.position.lat - out2.lat) < 1e-6, 'la última posición es la más reciente');
check(firstDist != null, 'la siguiente parada tiene distancia y ETA', `${firstDist} m`);

// --- 4. idempotencia, mock, impreciso, lote grande, futuro ---------------------------------------------
r = await call('POST', '/posiciones', { positions: batch });
check(r.data?.duplicates === 3 && r.data?.accepted === 0, 'reenviar el mismo lote: 3 duplicados, 0 aceptados', JSON.stringify(r.data));
const mock = pos(routeId, offset(start, 5000, 5000), 2, { is_mock: true });
const rough = pos(routeId, offset(start, -5000, 5000), 1, { accuracy_m: 500 });
r = await call('POST', '/posiciones', { positions: [mock, rough] });
check(r.data?.accepted === 2, 'punto mock e impreciso se guardan');
({ data: d } = await call('GET', `/viajes/${routeId}`));
check(Math.abs(d.position.lat - out2.lat) < 1e-6, 'mock e impreciso NO mueven el camión');
r = await call('POST', '/posiciones', { positions: Array.from({ length: 201 }, () => pos(routeId, start, 1)) });
check(r.status === 400, 'lote de 201 → 400', `HTTP ${r.status}`);
r = await call('POST', '/posiciones', { positions: [pos(routeId, start, -60)] });
check(r.data?.rejected?.length === 1 && r.data.accepted === 0, 'punto en el futuro se rechaza', r.data?.rejected?.[0]?.reason);
r = await call('POST', '/posiciones', { positions: [pos(randomUUID(), start, 1)] });
check(r.data?.rejected?.[0]?.reason === 'viaje no encontrado', 'viaje inexistente se rechaza');

// --- 5. paradas: geocerca y fallida --------------------------------------------------------------------
const [s1, s2] = stops;
r = await call('POST', `/paradas/${s1.id}/transicion`, { to: 'delivered', lat: out2.lat, lng: out2.lng });
check(r.status === 400, 'entregar a > 150 m sin motivo → 400', r.error ?? '');
r = await call('POST', `/paradas/${s1.id}/transicion`, { to: 'delivered', lat: out2.lat, lng: out2.lng, reason: 'e2e: fuera de geocerca' });
check(r.status === 200 && r.data.distance_m > 150, 'entregar lejos con motivo → 200 y distance_m medido', `${r.data?.distance_m} m`);
r = await call('POST', `/paradas/${s2.id}/transicion`, { to: 'failed' });
check(r.status === 400, 'fallida sin motivo → 400');
r = await call('POST', `/paradas/${s2.id}/transicion`, { to: 'failed', reason: 'e2e: cliente ausente', lat: s2.lat, lng: s2.lng });
check(r.status === 200, 'fallida con motivo → 200');
({ data: d } = await call('GET', `/viajes/${routeId}`));
check(d.alerts.some((x) => x.code === 'failed'), 'aparece la alerta "failed"');
check(d.progress.done === 2 && d.progress.failed === 1, 'progreso 2 cerradas, 1 fallida', JSON.stringify(d.progress));
check(d.state === 'active', 'cerrar paradas no cierra el viaje (lo cierra Planificación)');
if (stops[2]) {
  r = await call('POST', `/paradas/${stops[2].id}/transicion`, { to: 'delivered', lat: stops[2].lat, lng: stops[2].lng });
  check(r.status === 200 && r.data.distance_m <= 150, 'entregar en el punto (< 150 m) sin motivo → 200', `${r.data?.distance_m} m`);
}

// --- 6. evidencias: validaciones (la subida real necesita el bucket desplegado) -------------------------
r = await call('POST', `/paradas/${s1.id}/evidencias/upload-url`, { kind: 'photo_other', mime_type: 'image/jpeg' });
check(r.status === 422, 'photo_other → 422', `HTTP ${r.status}`);
r = await call('POST', `/paradas/${s1.id}/evidencias/upload-url`, { kind: 'otra', mime_type: 'image/jpeg' });
check(r.status === 400, 'kind inválido → 400', `HTTP ${r.status}`);
r = await call('POST', `/paradas/${s1.id}/evidencias`, { kind: 'photo_invoice', key: 'tracking/x/y/z.jpg' });
check(r.status === 400, 'confirmar con llave ajena → 400', `HTTP ${r.status}`);

// --- 7. lista: el viaje aparece, con país y filtros ----------------------------------------------------
const list = await call('GET', `/viajes?activos=1&pais=${pais}&q=${encodeURIComponent(d.route_number)}&include=summary&limit=5`);
check(list.data?.items?.length === 1 && list.data.items[0].id === routeId, 'búsqueda q por número de viaje lo encuentra');
check(list.data?.summary?.active >= 1, 'KPIs con el viaje activo', JSON.stringify(list.data?.summary));

console.log(`\nViaje de prueba: ${d.route_number} (${routeId}). Límpialo con scripts/limpiar-tracking-prueba.mjs --route ${d.route_number} --execute`);
console.log(failures ? `\n${failures} chequeo(s) fallaron.` : '\nIngesta real OK.');
process.exit(failures ? 1 : 0);
