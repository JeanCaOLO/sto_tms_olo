// Helper de DEMO: agrega pedidos nuevos a un dia para mostrar la REGENERACION.
// Uso:  node agregar_viajes_para_recalcular.js [YYYY-MM-DD] [cuantos]
// Default: fecha 2026-10-13, 3 pedidos. Tras correrlo, vuelve a planificacion
// en ese dia y pulsa "Regenerar plan": los pedidos nuevos entran al plan.
//
// Requiere: tunel Aurora en localhost:15432 y TMS_DB_PASSWORD en .env.local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- leer .env.local (solo TMS_DB_*) ---
const env = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
} catch { /* sin .env.local */ }

const fecha = process.argv[2] || '2026-10-13';
const cuantos = Number(process.argv[3] || 3);
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
  console.error('Fecha invalida. Uso: node agregar_viajes_para_recalcular.js [YYYY-MM-DD] [cuantos]');
  process.exit(1);
}

const PRODUCTS = [
  ['FER-001', 'Cemento gris 50kg'], ['FER-014', 'Varilla #3 corrugada'],
  ['PIN-003', 'Pintura latex blanco 1gal'], ['PLO-045', 'Tubo PVC 4 pulg'],
  ['ELE-200', 'Cable THHN #12'], ['JAR-071', 'Saco abono 25kg'],
];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const client = new pg.Client({
  host: env.TMS_DB_HOST || 'localhost',
  port: Number(env.TMS_DB_PORT || 15432),
  database: env.TMS_DB_NAME || 'tms_olo',
  user: env.TMS_DB_USER || 'tms_app',
  password: env.TMS_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, // Aurora exige TLS (via tunel SSM)
});

async function main() {
  await client.connect();
  // plantillas: pedidos existentes con geo real (delivery_point/zona/store por cliente)
  const { rows: tpls } = await client.query(
    `SELECT customer_id, store_id, delivery_point_id, delivery_address, delivery_city,
            delivery_latitude, delivery_longitude, delivery_zone, organization_id
       FROM orders WHERE order_number LIKE 'SEED-2026%' LIMIT 40`);
  if (!tpls.length) { console.error('No hay pedidos plantilla (SEED-*).'); process.exit(1); }

  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const creados = [];
  for (let i = 1; i <= cuantos; i++) {
    const t = pick(tpls);
    const totalW = +rnd(120, 820).toFixed(2);
    const totalV = +rnd(0.8, 3.6).toFixed(2);
    const totalAmt = +(totalW * rnd(2, 4)).toFixed(2);
    const nItems = 1 + Math.floor(Math.random() * 3);
    const priority = String(pick([1, 1, 2, 2, 3]));
    const onum = `RECALC-${fecha.replace(/-/g, '')}-${stamp}-${i}`;
    const { rows: [o] } = await client.query(
      `INSERT INTO orders
        (id, organization_id, store_id, customer_id, order_number, order_date, delivery_date,
         total_weight, total_volume, total_items, total_amount, delivery_address, delivery_city,
         delivery_latitude, delivery_longitude, delivery_zone, priority, status, created_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'assigned',now(),now())
       RETURNING id`,
      [t.organization_id, t.store_id, t.customer_id, onum, fecha, totalW, totalV, nItems, totalAmt,
       t.delivery_address, t.delivery_city, t.delivery_latitude, t.delivery_longitude, t.delivery_zone, priority]);
    // items (suma = peso/volumen del pedido, que es lo que usa el planificador)
    for (let k = 0; k < nItems; k++) {
      const [pc, pn] = pick(PRODUCTS);
      const qty = 1 + Math.floor(Math.random() * 20);
      const up = +rnd(3, 60).toFixed(2);
      await client.query(
        `INSERT INTO order_items (id, order_id, product_code, product_name, quantity, weight, volume, unit_price, total_price, created_at)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [o.id, pc, pn, qty, +(totalW / nItems).toFixed(2), +(totalV / nItems).toFixed(2), up, +(up * qty).toFixed(2)]);
    }
    creados.push(`${onum}  (${t.delivery_zone}, ${totalW}kg)`);
  }
  console.log(`\n✅ ${cuantos} pedidos nuevos para ${fecha}:`);
  creados.forEach((c) => console.log('   - ' + c));
  console.log('\n→ Abre planificacion en ese dia y pulsa "Regenerar plan" para incorporarlos.\n');
  await client.end();
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
