// Seed de desarrollo para wms_expediciones (staging que espeja el WMS real).
//
// Las primeras 16 filas de EXPEDICIONES_REALES son EXACTAMENTE las visibles
// en la captura de pantalla del WMS real compartida 2026-09-22
// (Expediciones (Salidas), 62 expediciones / 248 líneas totales — acá solo
// se ven las primeras 16 antes del scroll). El resto de EXPEDICIONES_EXTRA
// son sintéticas pero siguen los mismos patrones reales (mismos códigos de
// compañía/cliente/ruta/muelle, mismos valores de situación) — es dato de
// DESARROLLO, no una copia de producción.
//
// Los 6 códigos de tienda EPA (T002/T003/T004/T005/T006/T008) y sus
// ciudades son reales, confirmados en la misma captura, y coinciden con la
// nota de reunión de negocio ("EPA: compañía direccionado a un
// cliente/tienda — 002=Curridabat, 003=Escazú...").
//
// Uso:
//   node --env-file=.env.local scripts/seed-wms-expediciones.mjs            (dry-run)
//   node --env-file=.env.local scripts/seed-wms-expediciones.mjs --execute  (aplica)

import pg from 'pg';

const execute = process.argv.includes('--execute');

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

// --- Clientes finales EPA (códigos de tienda REALES, ver captura) ---
const EPA_STORES = [
  { code: 'T002', name: 'T002 CURRIDABAT', region: 'San José' },
  { code: 'T003', name: 'T003 ESCAZU', region: 'San José' },
  { code: 'T004', name: 'T004 BELEN', region: 'Heredia' },
  { code: 'T005', name: 'T005 TIBAS', region: 'San José' },
  { code: 'T006', name: 'T006 DESAMPARADOS', region: 'San José' },
  { code: 'T008', name: 'T008 CARTAGO', region: 'Cartago' },
];

// --- Clientes finales COFERSA (nombres REALES observados en la captura,
// truncados en la vista original tal cual aparecen) ---
const COFERSA_CLIENTS = [
  { code: '020205008', name: 'NELSON GONZALEZ (obs.)' },
  { code: '020308011', name: 'KARLA INCES B (obs.)' },
  { code: '020101002', name: 'ALMACENES UNIDOS (obs.)' },
  { code: '020101276', name: 'ALMACENES UNIDOS - sucursal (obs.)' },
  { code: '020101362', name: 'FERRETERIA BA (obs.)' },
  { code: '020404013', name: '3-102-789737 S.A.' },
  { code: '020301017', name: 'INVERSIONES F (obs.)' },
];

// Las 16 filas EXACTAS de la captura real (Id Compañía, Expedición, Tipo,
// Estado, Situación, Avance%, Ruta, ClienteCode, CantLineas, Muelle).
const EXPEDICIONES_REALES = [
  ['0109', 'PL0000003081-M', 'EXPERP', 'DISP', 'GENE', 0, '07', '020205008', 3, 'PURT23'],
  ['0029', '2000018103', 'EXPERP', 'DISP', 'DISP', 0, null, 'T005', 11, 'PURT12'],
  ['0029', '2000018104', 'EXPERP', 'DISP', 'DISP', 0, null, 'T006', 8, 'PURT12'],
  ['0109', 'P0002002260922', 'EXPERP', 'DISP', 'PREP', 100, '26', '020308011', 1, 'PURT26'],
  ['0029', '2000018105', 'EXPERP', 'DISP', 'DISP', 0, null, 'T002', 7, 'PURT12'],
  ['0029', '2000018106', 'EXPERP', 'DISP', 'DISP', 0, null, 'T008', 13, 'PURT12'],
  ['0029', '2000018107', 'EXPERP', 'DISP', 'DISP', 0, null, 'T003', 13, 'PURT12'],
  ['0109', 'P0156156260922', 'EXPERP', 'DISP', 'GENE', 0, '22', '020101002', 1, 'PURT28'],
  // misma expedición P0156156260922 aparece dos veces en la captura real, con
  // ruta/muelle distintos (probablemente dos líneas de despacho de la misma
  // expedición) - se preserva igual, con id_sucursal distinto para no violar
  // la llave natural (warehouse_id, id_compania, id_sucursal, expedicion).
  ['0109', 'P0156156260922', 'EXPERP', 'DISP', 'GENE', 0, '21', '020101276', 1, 'PURT29', '0002'],
  ['0029', '2000018108', 'EXPERP', 'DISP', 'DISP', 0, null, 'T004', 16, 'PURT12'],
  ['0109', 'VS032753-O', 'EXPERP', 'DISP', 'PREP', 100, '01', '020101362', 2, 'PURT29'],
  ['0109', 'VS032754-M', 'EXPERP', 'DISP', 'GENE', 0, '01', '020101362', 5, 'PURT29'],
  ['0109', 'PL0000003082-M', 'EXPERP', 'DISP', 'GENE', 0, '05', '020404013', 3, 'PURT22'],
  ['0109', 'VS032754-N', 'EXPERP', 'DISP', 'GENE', 0, '01', '020101362', 1, 'PURT29'],
  ['0109', 'VS032754-O', 'EXPERP', 'DISP', 'PREP', 77, '01', '020101362', 9, 'PURT29'],
  ['0109', 'P0002002260922', 'EXPERP', 'DISP', 'DISP', 0, '26', '020301017', 1, 'PURT12', '0002'],
];

// Filas sintéticas extra (mismos patrones reales) para tener volumen
// razonable de prueba - no son de la captura.
const RUTAS_EXTRA = ['02', '04', '09', '10', '11', '13', '15', '16'];
const MUELLES = ['PURT12', 'PURT22', 'PURT23', 'PURT26', 'PURT28', 'PURT29'];
const SITUACIONES = ['GENE', 'DISP', 'PREP'];

function generarExtra(n) {
  const filas = [];
  for (let i = 0; i < n; i++) {
    const esEpa = i % 2 === 0;
    const compania = esEpa ? '0029' : '0109';
    const situacion = SITUACIONES[i % SITUACIONES.length];
    const avance = situacion === 'PREP' ? [50, 77, 100][i % 3] : 0;
    const ruta = RUTAS_EXTRA[i % RUTAS_EXTRA.length];
    const cliente = esEpa
      ? EPA_STORES[i % EPA_STORES.length].code
      : COFERSA_CLIENTS[i % COFERSA_CLIENTS.length].code;
    const expedicion = esEpa
      ? `20000181${(20 + i).toString().padStart(2, '0')}`
      : `P00${(200 + i)}${(2260922 + i)}`;
    filas.push([
      compania, expedicion, 'EXPERP', 'DISP', situacion, avance,
      ruta, cliente, 1 + (i % 12), MUELLES[i % MUELLES.length],
    ]);
  }
  return filas;
}

async function main() {
  const client = await pool.connect();
  const report = { final_customers: 0, wms_expediciones: 0 };
  try {
    await client.query('BEGIN');

    const { rows: whRows } = await client.query(
      `SELECT w.id, w.organization_id FROM warehouses w
       JOIN countries c ON c.id = w.country_id WHERE c.code = 'CR' LIMIT 1`,
    );
    if (!whRows[0]) throw new Error('No existe warehouse para CR - corré primero sql/06_fase1_multicountry_foundation.sql');
    const { id: warehouseId, organization_id: organizationId } = whRows[0];

    const { rows: epaRows } = await client.query(`SELECT id FROM customers WHERE code = 'EPA' AND warehouse_id = $1`, [warehouseId]);
    const { rows: cofersaRows } = await client.query(`SELECT id FROM customers WHERE code = 'COFERSA' AND warehouse_id = $1`, [warehouseId]);
    if (!epaRows[0] || !cofersaRows[0]) throw new Error('No se encontró EPA/COFERSA bajo el warehouse de CR.');
    const epaId = epaRows[0].id;
    const cofersaId = cofersaRows[0].id;

    // --- final_customers: tiendas EPA reales + clientes Cofersa observados ---
    const finalCustomerIdByCode = new Map(); // 'EPA:T002' / 'COFERSA:020205008' -> id
    const upsertFinalCustomer = async (customerId, prefix, code, name) => {
      const { rows } = await client.query(
        `INSERT INTO final_customers (customer_id, external_code, name, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (customer_id, external_code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [customerId, code, name],
      );
      finalCustomerIdByCode.set(`${prefix}:${code}`, rows[0].id);
      report.final_customers++;
    };
    for (const s of EPA_STORES) await upsertFinalCustomer(epaId, 'EPA', s.code, s.name);
    for (const c of COFERSA_CLIENTS) await upsertFinalCustomer(cofersaId, 'COFERSA', c.code, c.name);

    // --- wms_expediciones ---
    const todasLasFilas = [...EXPEDICIONES_REALES, ...generarExtra(34)];
    for (const fila of todasLasFilas) {
      const [idCompania, expedicion, tipo, estado, situacion, avance, ruta, clienteCode, cantLineas, muelle, idSucursal] = fila;
      const prefix = idCompania === '0029' ? 'EPA' : 'COFERSA';
      const finalCustomerId = finalCustomerIdByCode.get(`${prefix}:${clienteCode}`) ?? null;
      const nombreCliente = prefix === 'EPA'
        ? EPA_STORES.find((s) => s.code === clienteCode)?.name ?? clienteCode
        : COFERSA_CLIENTS.find((c) => c.code === clienteCode)?.name ?? clienteCode;

      const { rowCount } = await client.query(
        `INSERT INTO wms_expediciones (
           organization_id, warehouse_id, id_compania, id_sucursal, expedicion, tipo_expedicion,
           estado, situacion, avance_pct, ruta, cliente_code, nombre_cliente, final_customer_id,
           cant_lineas, muelle_asignado
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (warehouse_id, id_compania, id_sucursal, expedicion) DO NOTHING`,
        [
          organizationId, warehouseId, idCompania, idSucursal ?? '0001', expedicion, tipo,
          estado, situacion, avance, ruta, clienteCode, nombreCliente, finalCustomerId,
          cantLineas, muelle,
        ],
      );
      report.wms_expediciones += rowCount;
    }

    console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'}:`, report);

    if (execute) {
      await client.query('COMMIT');
      console.log('Aplicado.');
    } else {
      await client.query('ROLLBACK');
      console.log('DRY RUN completado sin errores. Base de datos SIN cambios (ROLLBACK). Reintenta con --execute para aplicar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR — ROLLBACK aplicado:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
