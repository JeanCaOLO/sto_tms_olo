// Copia el snapshot REAL de EFLOW QA (ya cacheado en
// src/pages/planificacion/fallback-{rutas,catalogos}.ts desde una sesión
// anterior — nombres de transportistas, placas y choferes con cédula real;
// capacidades sintetizadas por tamaño de camión) hacia las tablas reales de
// Aurora (route_types, carriers, vehicles, drivers).
//
// No requiere red hacia EFLOW: ya no hay conexión en vivo (10.17.224.224
// solo es alcanzable desde la red interna/VPN de la empresa — confirmado en
// docs/guides/eflow-qa-data.md; el bastion EC2 de este entorno no tiene ruta
// hacia esa red). Este script es la alternativa aprobada: usar el snapshot
// ya extraído en vez de re-consultar EFLOW en vivo.
//
// NO toca los route_types existentes (GAM/Rural) — inserta las 15 rutas de
// EFLOW como filas NUEVAS con UUID propio, nunca reutiliza esos 2 IDs.
//
// Campos que el snapshot NO tenía (license_number, phone de choferes) se
// llenan con 'PENDIENTE' en vez de inventar un valor realista — son
// columnas NOT NULL en el esquema real pero el dato no existe en el
// snapshot; no se fabrica un valor que parezca real.
//
// Uso:
//   node --env-file=.env.local scripts/copy-eflow-snapshot.mjs            (dry-run)
//   node --env-file=.env.local scripts/copy-eflow-snapshot.mjs --execute  (aplica)

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

// --- datos (idénticos a los fallback-*.ts, ver comentarios ahí sobre qué es real) ---

const RUTAS = [
  { code: 'eflow-rt-01', name: '01 · Casco Central' },
  { code: 'eflow-rt-02', name: '02 · Desamparados San José Sur-Oeste' },
  { code: 'eflow-rt-03', name: '03 · Guadalupe San José Norte-Oeste' },
  { code: 'eflow-rt-04', name: '04 · Alajuela' },
  { code: 'eflow-rt-05', name: '05 · Heredia' },
  { code: 'eflow-rt-06', name: '06 · Cartago' },
  { code: 'eflow-rt-07', name: '07 · Carretera' },
  { code: 'eflow-rt-08', name: '08 · San Carlos' },
  { code: 'eflow-rt-09', name: '09 · Limón' },
  { code: 'eflow-rt-10', name: '10 · Guanacaste Altura' },
  { code: 'eflow-rt-11', name: '11 · Guanacaste Bajura' },
  { code: 'eflow-rt-12', name: '12 · Zona Sur' },
  { code: 'eflow-rt-13', name: '13 · Puntarenas' },
  { code: 'eflow-rt-15', name: '15 · Turrialba' },
  { code: 'eflow-rt-16', name: '16 · Corralillo' },
];

const CARRIERS = [
  { eflowId: 'eflow-car-3', name: 'Transosa de Alajuela S.A.' },
  { eflowId: 'eflow-car-8', name: 'Inversiones Acuña y Salazar del Caribe S.R.L.' },
  { eflowId: 'eflow-car-9', name: 'Edison Miguel Ureña Ureña' },
  { eflowId: 'eflow-car-16', name: 'Pedro Hernández Castro' },
  { eflowId: 'eflow-car-7', name: 'Javier Martín Ulloa Serrano' },
  { eflowId: 'eflow-car-4', name: 'Luis Carlos Martín Mora Castillo' },
  { eflowId: 'eflow-car-37', name: 'María Jiménez Ramírez' },
  { eflowId: 'eflow-car-29', name: 'OLO' },
  { eflowId: 'eflow-car-38', name: 'Transmajori' },
];

const VEHICLES = [
  { code: 'eflow-veh-2', plate: 'CL188786', brand: 'Toyota', model: 'Dyna', vehicle_type: 'Camión liviano', capacity_weight: 4500, capacity_volume: 20 },
  { code: 'eflow-veh-3', plate: 'C162414', brand: 'Freightliner', model: 'M2', vehicle_type: 'Camión pesado', capacity_weight: 8000, capacity_volume: 32 },
  { code: 'eflow-veh-4', plate: 'CL244242', brand: 'Hyundai', model: 'HD65', vehicle_type: 'Camión liviano', capacity_weight: 3500, capacity_volume: 16 },
  { code: 'eflow-veh-6', plate: 'CL300011', brand: 'KIA', model: 'Bongo', vehicle_type: 'Camión pequeño', capacity_weight: 2500, capacity_volume: 12 },
  { code: 'eflow-veh-7', plate: 'CL345361', brand: 'Isuzu', model: 'QRL', vehicle_type: 'Camión liviano', capacity_weight: 4500, capacity_volume: 20 },
  { code: 'eflow-veh-8', plate: 'CL186068', brand: 'Toyota', model: 'Dyna', vehicle_type: 'Camión liviano', capacity_weight: 4500, capacity_volume: 20 },
  { code: 'eflow-veh-9', plate: 'CL272155', brand: 'Isuzu', model: 'QKR', vehicle_type: 'Camión pequeño', capacity_weight: 2800, capacity_volume: 13 },
  { code: 'eflow-veh-12', plate: 'CL190087', brand: 'Isuzu', model: 'NPR', vehicle_type: 'Camión liviano', capacity_weight: 5000, capacity_volume: 22 },
  { code: 'eflow-veh-14', plate: 'C132239', brand: 'Nissan', model: 'UD', vehicle_type: 'Camión pesado', capacity_weight: 8000, capacity_volume: 32 },
  { code: 'eflow-veh-21', plate: 'C177642', brand: 'JAC', model: 'N-Series', vehicle_type: 'Camión liviano', capacity_weight: 4200, capacity_volume: 19 },
  { code: 'eflow-veh-23', plate: 'C162179', brand: 'Mitsubishi', model: 'Canter', vehicle_type: 'Camión liviano', capacity_weight: 4000, capacity_volume: 18 },
  { code: 'eflow-veh-24', plate: 'CL228091', brand: 'KIA', model: 'Bongo', vehicle_type: 'Camión pequeño', capacity_weight: 2500, capacity_volume: 12 },
];

const DRIVERS = [
  { code: 'eflow-drv-4', full_name: 'Luis Diego Solórzano Gómez', document: '204300699', carrierEflowId: 'eflow-car-3' },
  { code: 'eflow-drv-5', full_name: 'Gerardo Alonso Durán Alfaro', document: '205400666', carrierEflowId: 'eflow-car-3' },
  { code: 'eflow-drv-6', full_name: 'Diego Ricardo Solórzano Sánchez', document: '206590907', carrierEflowId: 'eflow-car-3' },
  { code: 'eflow-drv-7', full_name: 'Víctor Manuel Vega Chaves', document: '601730907', carrierEflowId: 'eflow-car-3' },
  { code: 'eflow-drv-8', full_name: 'Heber Fernando Mena Mena', document: '108960212', carrierEflowId: 'eflow-car-3' },
  { code: 'eflow-drv-9', full_name: 'Luis Gerardo Vallejos Castro', document: '603930431', carrierEflowId: 'eflow-car-3' },
  { code: 'eflow-drv-12', full_name: 'David José Vargas Borbón', document: '116350274', carrierEflowId: 'eflow-car-16' },
  { code: 'eflow-drv-11', full_name: 'Merwin Rafael Ortega Rangel', document: '186201041419', carrierEflowId: 'eflow-car-16' },
  { code: 'eflow-drv-22', full_name: 'Edison Miguel Ureña Ureña', document: '114090799', carrierEflowId: 'eflow-car-9' },
  { code: 'eflow-drv-24', full_name: 'Francisco Arguedas Morales', document: '111790453', carrierEflowId: 'eflow-car-9' },
  { code: 'eflow-drv-23', full_name: 'Jonathan Jesús Álvarez Torres', document: '111000137', carrierEflowId: 'eflow-car-9' },
  { code: 'eflow-drv-31', full_name: 'Javier Martín Ulloa Serrano', document: '106380244', carrierEflowId: 'eflow-car-7' },
  { code: 'eflow-drv-14', full_name: 'Luis Carlos Mora Castillo', document: '106510512', carrierEflowId: 'eflow-car-4' },
  { code: 'eflow-drv-21', full_name: 'Randal Acuña Jiménez', document: '205680638', carrierEflowId: 'eflow-car-8' },
  { code: 'eflow-drv-20', full_name: 'Yeiner Enrique González Fernández', document: '702060910', carrierEflowId: 'eflow-car-8' },
  { code: 'eflow-drv-30', full_name: 'Federico José Ulloa Umaña', document: '116080706', carrierEflowId: 'eflow-car-37' },
  { code: 'eflow-drv-34', full_name: 'Robier Alonso Colomer Olivas', document: '701180253', carrierEflowId: 'eflow-car-29' },
  { code: 'eflow-drv-69', full_name: 'Gerardo Stanley Sánchez', document: '206440829', carrierEflowId: 'eflow-car-38' },
];

async function main() {
  const client = await pool.connect();
  const report = { route_types: 0, carriers: 0, vehicles: 0, drivers: 0 };
  try {
    await client.query('BEGIN');

    const { rows: orgRows } = await client.query('SELECT id FROM organizations LIMIT 1');
    if (!orgRows[0]) throw new Error('No hay ninguna organización.');
    const organizationId = orgRows[0].id;

    const { rows: crRows } = await client.query(`SELECT id FROM countries WHERE code = 'CR' LIMIT 1`);
    if (!crRows[0]) throw new Error('No existe el país CR.');
    const countryId = crRows[0].id;

    // route_types — nunca toca GAM/Rural existentes, siempre filas nuevas.
    for (const r of RUTAS) {
      const { rowCount } = await client.query(
        `INSERT INTO route_types (organization_id, name, status)
         SELECT $1, $2, 'active'
         WHERE NOT EXISTS (SELECT 1 FROM route_types WHERE organization_id = $1 AND name = $2)`,
        [organizationId, r.name],
      );
      report.route_types += rowCount;
    }

    // carriers
    const carrierIdByEflowId = new Map();
    for (const c of CARRIERS) {
      const code = `EFLOW-${c.eflowId.replace('eflow-car-', '')}`;
      const { rows } = await client.query(
        `INSERT INTO carriers (organization_id, country_id, name, code, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [organizationId, countryId, c.name, code],
      );
      carrierIdByEflowId.set(c.eflowId, rows[0].id);
      report.carriers++;
    }

    // vehicles — carrier_id queda NULL (el snapshot no vincula vehículo->transportista).
    for (const v of VEHICLES) {
      const { rowCount } = await client.query(
        `INSERT INTO vehicles (organization_id, plate, brand, model, vehicle_type, capacity_weight, capacity_volume, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         ON CONFLICT (organization_id, plate) DO NOTHING`,
        [organizationId, v.plate, v.brand, v.model, v.vehicle_type, v.capacity_weight, v.capacity_volume],
      );
      report.vehicles += rowCount;
    }

    // drivers — license_number/phone NOT NULL en el esquema pero ausentes en
    // el snapshot: 'PENDIENTE' explícito, no un valor inventado que parezca real.
    for (const d of DRIVERS) {
      const carrierId = carrierIdByEflowId.get(d.carrierEflowId) ?? null;
      const code = `DRV-${d.code.replace('eflow-drv-', 'EFLOW-')}`;
      const { rowCount } = await client.query(
        `INSERT INTO drivers (organization_id, carrier_id, code, full_name, document, license_number, phone, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', 'PENDIENTE', 'active')
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [organizationId, carrierId, code, d.full_name, d.document],
      );
      report.drivers += rowCount;
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
