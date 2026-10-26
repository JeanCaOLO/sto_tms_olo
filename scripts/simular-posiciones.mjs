// Simula un camión: envía posiciones GPS a POST /api/v1/tracking/posiciones, como lo haría la app del chofer.
//
// Uso:
//   TMS_TOKEN=<jwt> node scripts/simular-posiciones.mjs --route <route_id> [--api http://localhost:4000]
//        [--from 9.93,-84.08] [--to 9.99,-84.2] [--steps 30] [--interval 3000]
//   TMS_TOKEN=<jwt> node scripts/simular-posiciones.mjs --route <route_id> --ruta-paradas [--steps-por-tramo 8]
//        recorre la sede (--from, o la sede del viaje: `origin` del detalle) y las paradas pendientes en orden
//        (las lee de GET /viajes/{id}).
//   ... --ruta-paradas --por-calles [--paso-m 150] [--osrm https://router.project-osrm.org]
//        igual, pero siguiendo las calles (OSRM) con un punto cada --paso-m metros, como un camión real.
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
const byStreets = process.argv.includes('--por-calles');
const osrm = arg('osrm', process.env.VITE_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const fromGiven = process.argv.includes('--from');
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
  const origin = !fromGiven && body.data.origin ? [body.data.origin.lat, body.data.origin.lng] : [fromLat, fromLng];
  const waypoints = [origin, ...stops.map((s) => [s.lat, s.lng])];
  if (byStreets) return streetPath(waypoints, Number(arg('paso-m', '150')));
  const perLeg = Number(arg('steps-por-tramo', '8'));
  const path = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const [aLat, aLng] = waypoints[leg];
    const [bLat, bLng] = waypoints[leg + 1];
    for (let i = leg === 0 ? 0 : 1; i <= perLeg; i++) path.push([aLat + ((bLat - aLat) * i) / perLeg, aLng + ((bLng - aLng) * i) / perLeg]);
  }
  return path;
}

const meters = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2
    + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

/** Ruta por calles (OSRM /route) remuestreada a un punto cada `step` metros. */
async function streetPath(waypoints, step) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const response = await fetch(`${osrm}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  const line = (await response.json().catch(() => null))?.routes?.[0]?.geometry?.coordinates;
  if (!response.ok || !Array.isArray(line)) throw new Error(`OSRM no devolvió ruta (${response.status}); usa sin --por-calles.`);
  const points = line.map(([lng, lat]) => [lat, lng]);
  const out = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = meters(a, b);
    let at = step - carry;
    while (at <= length) {
      const f = at / length;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      at += step;
    }
    carry = length - (at - step);
  }
  out.push(points[points.length - 1]);
  return out;
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
