// Datos MOCK para la Bandeja de pedidos y para Planificación.
//
// Crea pedidos nuevos en `orders` (+ `order_items`) que están en la bandeja: DISP/DISP, sin planificar
// (planning_run_id NULL, sin viaje) y con fecha de entrega en los próximos días hábiles. Son la entrada
// del planificador; al correr Planificación pasan a la cola del OMS (planning_run_id IS NOT NULL).
//
// La geografía (dirección, zona, coordenadas, cliente destino) se clona de pedidos reales de eFlow ya
// cargados, del mismo cliente (Cofersa/EPA), para que el mock sea coherente con los maestros.
//
// Marca: orders.notes = 'mock-bandeja' (ver --limpiar). Llaves eFlow '99NNNNNN' + mismas llaves de almacén/
// compañía/sucursal que los pedidos reales; no choca con las llaves reales (empiezan por 22/28).
// NO es idempotente: re-correr agrega otro lote (la llave depende del cliente sorteado). Para regenerar,
// corre primero --limpiar --execute (solo borra mock sin planificar).
//
//   node --env-file=.env.local scripts/seed-bandeja-mock.mjs                 (dry-run: solo resume)
//   node --env-file=.env.local scripts/seed-bandeja-mock.mjs --execute       (aplica)
//   node --env-file=.env.local scripts/seed-bandeja-mock.mjs --limpiar --execute   (borra el mock NO planificado)
//   opciones: --por-dia 10  --dias 7  --desde 2026-11-02

import pg from 'pg';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const limpiar = args.includes('--limpiar');
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const POR_DIA = Number(opt('por-dia', 10));
const DIAS = Number(opt('dias', 7));
const NOTE = 'mock-bandeja';
const ORG = '11111111-1111-1111-1111-111111111111';
const WAREHOUSE = '56ce1ef7-cdc5-4b20-89dc-30362101ab3b';

// Cofersa pesa más que EPA, como en los datos reales (577 vs 31).
const CLIENTES = [
  { nombre: 'Cofersa', id: 'e59e4979-470e-4331-8ce6-ca8e6eff68bf', compania: '0109', branch: '1d4bcae4-ac21-4ee2-9db1-52e4a2aa6cf2', peso: 0.75 },
  { nombre: 'EPA', id: 'ff5af1a6-7d48-4b82-b7c7-e771d49081a1', compania: '0029', branch: '7cc368e5-f12f-4332-839d-dd35078ab8e1', peso: 0.25 },
];
const OBSERVACIONES = [
  ...Array(14).fill(''),
  'NEGOCIACION ESPECIAL',
  'urgente',
  'urgente, entregar antes de las 10am',
  'CLIENTE RETIRA EN BODEGA',
  'cliente retira',
  'Llamar al cliente antes de entregar',
];
const PRODUCTOS = [
  ['FER-0101', 'Cemento gris 50 kg', 'SACO', 50, 0.035, 6900],
  ['FER-0230', 'Varilla corrugada 3/8" 6 m', 'UND', 4.2, 0.002, 3200],
  ['FER-0412', 'Pintura látex blanca 4 L', 'CUBETA', 6.1, 0.006, 21500],
  ['FER-0518', 'Tubo PVC 1/2" 6 m', 'UND', 1.8, 0.004, 2300],
  ['FER-0777', 'Lámina zinc 3.0 m', 'UND', 9.5, 0.03, 8900],
  ['FER-0824', 'Clavos 2" caja 1 kg', 'CAJA', 1, 0.001, 1800],
  ['FER-0903', 'Cable THHN #12 rollo 100 m', 'ROLLO', 7.8, 0.012, 38000],
  ['FER-1015', 'Cerámica 45x45 caja', 'CAJA', 24, 0.03, 14500],
];

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20261030);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

function diasHabiles(desde, n) {
  const out = [];
  const d = new Date(`${desde}T12:00:00Z`);
  while (out.length < n) {
    if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
  application_name: 'seed-bandeja-mock',
});

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    if (limpiar) {
      const { rows } = await c.query(
        `SELECT id FROM tbl_orders WHERE notes = $1 AND planning_run_id IS NULL AND oms_processed_at IS NULL`, [NOTE]);
      const ids = rows.map((r) => r.id);
      await c.query('DELETE FROM tbl_order_items WHERE order_id = ANY($1)', [ids]);
      await c.query('DELETE FROM tbl_orders WHERE id = ANY($1)', [ids]);
      console.log(`Mock sin planificar a borrar: ${ids.length}`);
      await finish(c);
      return;
    }

    // Plantillas de geografía: pedidos reales de eFlow por cliente, con coordenadas.
    const plantillas = {};
    for (const cl of CLIENTES) {
      const { rows } = await c.query(
        `SELECT final_customer_id, delivery_address, delivery_city, delivery_zone, delivery_latitude, delivery_longitude
           FROM tbl_orders
          WHERE customer_id = $1 AND eflow_id_expedicion IS NOT NULL AND notes IS DISTINCT FROM $2
            AND final_customer_id IS NOT NULL
          ORDER BY (delivery_latitude IS NULL), eflow_id_expedicion
          LIMIT 400`, [cl.id, NOTE]);
      if (!rows.length) throw new Error(`Sin pedidos reales con coordenadas para ${cl.nombre}: no hay plantilla de geografía.`);
      plantillas[cl.id] = rows;
    }

    // EPA no trae zona ni coordenadas en eFlow real: se las presta una plantilla georreferenciada de Cofersa.
    const geo = plantillas[CLIENTES[0].id].filter((t) => t.delivery_latitude != null && t.delivery_zone != null);
    if (!geo.length) throw new Error('Sin plantillas georreferenciadas de Cofersa.');

    const fechas = diasHabiles(opt('desde', '2026-11-02'), DIAS);
    const hoy = new Date().toISOString().slice(0, 10);
    let seq = 0;
    let creados = 0;
    let existentes = 0;
    let lineas = 0;
    const porDia = {};

    for (const fecha of fechas) {
      for (let i = 0; i < POR_DIA; i++) {
        seq++;
        const cl = rnd() < CLIENTES[0].peso ? CLIENTES[0] : CLIENTES[1];
        const t0 = pick(plantillas[cl.id]);
        const g = t0.delivery_latitude != null && t0.delivery_zone != null ? t0 : pick(geo);
        const t = { ...t0, delivery_zone: g.delivery_zone, delivery_latitude: g.delivery_latitude, delivery_longitude: g.delivery_longitude };
        const expedicion = `99${String(seq).padStart(8, '0')}`;

        const { rows: dup } = await c.query(
          `SELECT 1 FROM tbl_orders WHERE eflow_id_almacen='0001' AND eflow_id_compania=$1 AND eflow_id_sucursal='0001' AND eflow_id_expedicion=$2`,
          [cl.compania, expedicion]);
        if (dup.length) { existentes++; continue; }

        const nLineas = 1 + Math.floor(rnd() * 5);
        const items = Array.from({ length: nLineas }, (_, k) => {
          const [code, name, pres, kg, m3, precio] = pick(PRODUCTOS);
          const qty = 1 + Math.floor(rnd() * 12);
          return { k: k + 1, code, name, pres, qty, weight: +(kg * qty).toFixed(3), volume: +(m3 * qty).toFixed(4), price: precio, total: precio * qty };
        });
        const peso = +items.reduce((s, x) => s + x.weight, 0).toFixed(3);
        const vol = +items.reduce((s, x) => s + x.volume, 0).toFixed(4);
        const monto = items.reduce((s, x) => s + x.total, 0);
        const obs = pick(OBSERVACIONES);
        const retira = /retira/i.test(obs);
        const jitter = () => between(-0.006, 0.006); // ~600 m: no todos en el mismo punto

        const { rows: [o] } = await c.query(
          `INSERT INTO tbl_orders (organization_id, customer_id, order_number, order_date, delivery_date, total_weight, total_volume,
              total_items, total_amount, delivery_address, delivery_city, delivery_latitude, delivery_longitude, delivery_zone,
              priority, status, notes, warehouse_id, branch_id, final_customer_id,
              eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion,
              wms_status, wms_situation, planned_dispatch_at, observaciones, es_cliente_retira)
           VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,'pending',$15,$16,$17,$18,
                   '0001',$19,'0001',$20,'DISP','DISP',$5::date,$21,$22)
           RETURNING id`,
          [ORG, cl.id, expedicion, hoy, fecha, peso, vol, nLineas, monto, t.delivery_address, t.delivery_city,
           +t.delivery_latitude + jitter(), +t.delivery_longitude + jitter(), t.delivery_zone,
           NOTE, WAREHOUSE, cl.branch, t.final_customer_id, cl.compania, expedicion, obs, retira]);

        for (const x of items) {
          await c.query(
            `INSERT INTO tbl_order_items (order_id, product_code, product_name, quantity, weight, volume, unit_price, total_price,
                line_number, presentation, wms_status, wms_situation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DISP','DISP')`,
            [o.id, x.code, x.name, x.qty, x.weight, x.volume, x.price, x.total, x.k, x.pres]);
          lineas++;
        }
        creados++;
        porDia[fecha] = (porDia[fecha] ?? 0) + 1;
      }
    }

    console.log(`Pedidos nuevos: ${creados} (ya existían: ${existentes}) · líneas: ${lineas}`);
    console.log('Por fecha de entrega:', porDia);
    await finish(c);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

async function finish(c) {
  if (execute) {
    await c.query('COMMIT');
    console.log('APLICADO (COMMIT).');
  } else {
    await c.query('ROLLBACK');
    console.log('Dry-run: ROLLBACK. Usa --execute para aplicar.');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
