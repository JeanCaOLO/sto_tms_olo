// Simula un camión: envía posiciones GPS a POST /api/v1/tracking/posiciones, como lo haría la app del chofer.
//
// Uso:
//   TMS_TOKEN=<jwt> node scripts/simular-posiciones.mjs --route <route_id> [--api http://localhost:4000]
//        [--from 9.93,-84.08] [--to 9.99,-84.2] [--steps 30] [--interval 3000]
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
const [fromLat, fromLng] = arg('from', '9.93,-84.08').split(',').map(Number);
const [toLat, toLng] = arg('to', '9.99,-84.20').split(',').map(Number);
const steps = Number(arg('steps', '30'));
const intervalMs = Number(arg('interval', '3000'));

if (!route || !token) {
  console.error('Faltan --route <route_id> y la variable TMS_TOKEN.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const heading = (Math.atan2(toLng - fromLng, toLat - fromLat) * 180) / Math.PI;

for (let step = 0; step <= steps; step++) {
  const k = step / steps;
  const position = {
    client_id: randomUUID(),
    route_id: route,
    lat: fromLat + (toLat - fromLat) * k,
    lng: fromLng + (toLng - fromLng) * k,
    speed_mps: 11 + Math.random() * 3,
    heading_deg: (heading + 360) % 360,
    accuracy_m: 8,
    battery_pct: Math.max(5, 90 - step),
    recorded_at: new Date().toISOString(),
  };
  const response = await fetch(`${api}/api/v1/tracking/posiciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_id: 'simulador', positions: [position] }),
  });
  const body = await response.json().catch(() => null);
  console.log(`#${step}/${steps} ${position.lat.toFixed(5)},${position.lng.toFixed(5)} → ${response.status}`, body?.data ?? body?.error ?? '');
  if (!response.ok) process.exit(1);
  await sleep(intervalMs);
}
