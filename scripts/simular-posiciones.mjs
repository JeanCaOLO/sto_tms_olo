// Simula un camión: envía posiciones GPS a POST /api/v1/tracking/posiciones, como lo haría la app del chofer.
//
// Uso:
//   TMS_TOKEN=<jwt> node scripts/simular-posiciones.mjs --route <route_id> [--api http://localhost:4000]
//        [--from 9.93,-84.08] [--to 9.99,-84.2] [--steps 30] [--interval 3000]
//   TMS_TOKEN=<jwt> node scripts/simular-posiciones.mjs --route <route_id> --ruta-paradas [--steps-por-tramo 8]
//        recorre la sede (--from) y las paradas pendientes del viaje en orden (las lee de GET /viajes/{id}).
//
// El JWT sale de localStorage de la sesión web (clave de sesión de src/lib/supabase.ts) o de POST /api/auth/login.
// El usuario necesita `tracking:create`. El viaje debe estar "En tránsito" (iniciado desde Tracking).
import { randomUUID } from 'node:crypto';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const api = arg('api', 'http://localhost:4000').replace(/\/$/, '');
const route = arg('route');
const token = process.env.TMS_TOKEN;
const followStops = process.argv.includes('--ruta-paradas');
const [fromLat, fromLng] = arg('from', '9.93,-84.08').split(',').map(Number);
const [toLat, toLng] = arg('to', '9.99,-84.20').split(',').map(Number);
const intervalMs = Number(arg('interval', '3000'));

if (!route || !token) {
  console.error('Faltan --route <route_id> y la variable TMS_TOKEN.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

/** Puntos [lat, lng] a recorrer: línea recta from→to, o from→paradas pendientes en orden de secuencia. */
async function buildPath() {
  if (!followStops) {
    const steps = Number(arg('steps', '30'));
    return Array.from({ length: steps + 1 }, (_, i) => [fromLat + ((toLat - fromLat) * i) / steps, fromLng + ((toLng - fromLng) * i) / steps]);
  }
  const response = await fetch(`${api}/api/v1/tracking/viajes/${route}`, { headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`No se pudo leer el viaje (${response.status}): ${body?.error?.message ?? ''}`);
  const stops = body.data.stops
    .filter((s) => s.state === 'pending' && s.lat != null && s.lng != null)
    .sort((a, b) => a.sequence - b.sequence);
  if (!stops.length) throw new Error('El viaje no tiene paradas pendientes con coordenadas.');
  const perLeg = Number(arg('steps-por-tramo', '8'));
  const waypoints = [[fromLat, fromLng], ...stops.map((s) => [s.lat, s.lng])];
  const path = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const [aLat, aLng] = waypoints[leg];
    const [bLat, bLng] = waypoints[leg + 1];
    for (let i = leg === 0 ? 0 : 1; i <= perLeg; i++) path.push([aLat + ((bLat - aLat) * i) / perLeg, aLng + ((bLng - aLng) * i) / perLeg]);
  }
  return path;
}

const path = await buildPath();
const bearing = (a, b) => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360;

for (const [step, point] of path.entries()) {
  const next = path[Math.min(step + 1, path.length - 1)];
  const position = {
    client_id: randomUUID(),
    route_id: route,
    lat: point[0],
    lng: point[1],
    speed_mps: 11 + Math.random() * 3,
    heading_deg: bearing(point, next),
    accuracy_m: 8,
    battery_pct: Math.max(5, 90 - step),
    recorded_at: new Date().toISOString(),
  };
  const response = await fetch(`${api}/api/v1/tracking/posiciones`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ device_id: 'simulador', positions: [position] }),
  });
  const body = await response.json().catch(() => null);
  console.log(`#${step}/${path.length - 1} ${position.lat.toFixed(5)},${position.lng.toFixed(5)} → ${response.status}`, body?.data ?? body?.error ?? '');
  if (!response.ok) process.exit(1);
  await sleep(intervalMs);
}
