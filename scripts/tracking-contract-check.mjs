// Verifica el contrato v2 de /api/v1/tracking contra un backend REAL (api:local con túnel, sandbox o qa) y mide
// tiempo y tamaño de cada respuesta. Es la contraparte de src/pages/tracking/__tests__/mock-backend.test.ts:
// lo que el mock garantiza en pruebas, este script lo comprueba contra Aurora. Solo lectura (GET).
//
// Uso:
//   TMS_TOKEN=<jwt> node scripts/tracking-contract-check.mjs [--api http://localhost:4000] [--pais CR] [--veces 5]
//
// El JWT sale del localStorage de la sesión web (clave de sesión de src/lib/supabase.ts) o de POST /api/auth/login.
// El usuario necesita `tracking:view`. Sale con código 1 si algún chequeo falla.

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const api = arg('api', 'http://localhost:4000').replace(/\/$/, '');
const pais = arg('pais', '');
const times = Number(arg('veces', '5'));
const token = process.env.TMS_TOKEN;
if (!token) {
  console.error('Falta la variable TMS_TOKEN.');
  process.exit(1);
}

const VIAJE_KEYS = ['alerts', 'color', 'country', 'delay_min', 'driver_name', 'ended_at', 'id', 'phase', 'planned_end_at', 'plate',
  'position', 'progress', 'route_date', 'route_number', 'signal', 'started_at', 'state', 'timezone', 'zone_name'];
const DETAIL_EXTRA = ['departed_at', 'next_stop_id', 'origin', 'stops'];
const SUMMARY_KEYS = ['active', 'completed_today', 'late', 'no_signal', 'on_time'];
const STOP_KEYS = ['address', 'arrived_at', 'city', 'customer_name', 'delay_min', 'distance_m', 'eta_at', 'evidences', 'guide_number', 'id',
  'invoice_number', 'lat', 'lng', 'order_number', 'planned_arrival_at', 'recipient_name', 'sequence', 'state'];
const ALERTS = new Set(['failed', 'no_signal', 'late', 'stopped']);
const EVIDENCE = new Set(['photo_invoice', 'signature']);

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const sameKeys = (object, expected) => {
  const got = Object.keys(object ?? {}).sort();
  const missing = expected.filter((k) => !got.includes(k));
  const extra = got.filter((k) => !expected.includes(k));
  return { ok: !missing.length && !extra.length, detail: [missing.length && `faltan ${missing}`, extra.length && `sobran ${extra}`].filter(Boolean).join('; ') };
};

async function get(path, { gzip = true } = {}) {
  const started = performance.now();
  const response = await fetch(`${api}/api/v1/tracking${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': gzip ? 'gzip' : 'identity' },
  });
  const text = await response.text();
  const ms = Math.round(performance.now() - started);
  let body = null;
  try { body = JSON.parse(text); } catch { /* cuerpo no JSON */ }
  return { status: response.status, body, ms, bytes: Buffer.byteLength(text), encoding: response.headers.get('content-encoding') ?? '-' };
}

async function measure(label, path) {
  const runs = [];
  for (let i = 0; i < times; i++) runs.push(await get(path));
  const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
  const plain = await get(path, { gzip: false });
  console.log(`     ${label}: p50 ${ms[Math.floor(ms.length / 2)]} ms · máx ${ms[ms.length - 1]} ms · ${runs[0].bytes} B decodificados (encoding ${runs[0].encoding}; sin gzip ${plain.encoding})`);
}

const q = pais ? `&pais=${pais}` : '';

// --- lista + KPIs --------------------------------------------------------------------------------------
const list = await get(`/viajes?activos=1&limit=30&include=summary${q}`);
check(list.status === 200, 'GET /viajes?activos=1&include=summary', `HTTP ${list.status} ${list.body?.error?.message ?? ''}`);
const page = list.body?.data ?? {};
const items = page.items ?? [];
check(Array.isArray(items), 'items es una lista', `${items.length} viajes`);
const summaryKeys = sameKeys(page.summary, SUMMARY_KEYS);
check(summaryKeys.ok, 'summary con los 5 KPIs por viaje', summaryKeys.detail);
if (page.summary) check(page.summary.on_time + page.summary.late === page.summary.active, 'on_time + late = active');
for (const viaje of items.slice(0, 5)) {
  const keys = sameKeys(viaje, VIAJE_KEYS);
  check(keys.ok, `forma del viaje ${viaje.route_number}`, keys.detail);
  check(viaje.alerts.every((a) => ALERTS.has(a.code)), `alertas válidas en ${viaje.route_number}`, viaje.alerts.map((a) => a.code).join(','));
  check(viaje.signal !== 'none' || !viaje.alerts.some((a) => a.code === 'no_signal'), `sin GPS no alerta "sin señal" (${viaje.route_number})`);
}
if (pais) check(items.every((v) => v.country === pais.toUpperCase()), `todos los viajes son de ${pais}`);
const second = page.next_cursor ? await get(`/viajes?activos=1&limit=30&include=summary&cursor=${encodeURIComponent(page.next_cursor)}${q}`) : null;
if (second) check(second.status === 200 && second.body?.data?.summary === undefined, 'la 2.ª página no repite los KPIs');
const bad = await get('/viajes?pais=C1');
check(bad.status === 400, 'pais inválido → 400', `HTTP ${bad.status}`);

// --- detalle y recorrido -----------------------------------------------------------------------------------
const sample = items.find((v) => v.position) ?? items[0];
if (sample) {
  const detail = await get(`/viajes/${sample.id}`);
  check(detail.status === 200, `GET /viajes/${sample.route_number}`, `HTTP ${detail.status}`);
  const d = detail.body?.data ?? {};
  const keys = sameKeys(d, [...VIAJE_KEYS, ...DETAIL_EXTRA]);
  check(keys.ok, 'forma del detalle (sin events/trail)', keys.detail);
  const stop = d.stops?.[0];
  if (stop) {
    const stopKeys = sameKeys(stop, STOP_KEYS);
    check(stopKeys.ok, 'forma de la parada (sin novedades/devoluciones)', stopKeys.detail);
  }
  const kinds = (d.stops ?? []).flatMap((s) => s.evidences.map((e) => e.kind));
  check(kinds.every((k) => EVIDENCE.has(k)), 'evidencias: solo factura firmada y firma', [...new Set(kinds)].join(',') || 'ninguna');
  const pending = (d.stops ?? []).filter((s) => s.state === 'pending').sort((a, b) => a.sequence - b.sequence)[0];
  if (d.state === 'active' && pending) check(d.next_stop_id === pending.id, 'next_stop_id = siguiente pendiente por secuencia');
  const again = await get(`/viajes/${sample.id}`);
  const urls = (x) => (x.body?.data?.stops ?? []).flatMap((s) => s.evidences.map((e) => e.url));
  if (urls(detail).length) check(JSON.stringify(urls(detail)) === JSON.stringify(urls(again)), 'URLs firmadas estables entre dos lecturas');
  const recorrido = await get(`/viajes/${sample.id}/recorrido`);
  const points = recorrido.body?.data?.points;
  check(recorrido.status === 200 && Array.isArray(points) && points.length <= 2000, 'GET /recorrido (≤ 2000 puntos)', `${points?.length ?? '?'} puntos`);
  if (points?.length > 1) check(points.every((p, i) => i === 0 || p.at >= points[i - 1].at), 'recorrido en orden cronológico');
  console.log('\nTiempos y tamaños:');
  await measure('lista + KPIs', `/viajes?activos=1&limit=30&include=summary${q}`);
  await measure('detalle', `/viajes/${sample.id}`);
  await measure('recorrido', `/viajes/${sample.id}/recorrido`);
} else {
  console.log('Sin viajes activos: no se verifican detalle ni recorrido (inicia uno o usa el seed).');
}

const planned = await get(`/planificados${pais ? `?pais=${pais}` : ''}`);
check(planned.status === 200 && Array.isArray(planned.body?.data), 'GET /planificados', `HTTP ${planned.status}`);

console.log(failures ? `\n${failures} chequeo(s) fallaron.` : '\nContrato v2 OK.');
process.exit(failures ? 1 : 0);
