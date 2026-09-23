// Pruebas de conectividad e integridad de esquema contra AWS Aurora (tms_olo).
//
// Requieren el túnel SSM local a Aurora activo en localhost:5432 (ver
// server/README.md y docs/guides/tunel-ssm-a-rds.md) y las variables
// TMS_DB_* en el entorno (server/tms-db.mjs las lee igual). Si no hay
// conexión disponible, la suite se salta entera con un mensaje explícito
// en vez de fallar en rojo sin contexto — así CI sin túnel no rompe, pero
// un desarrollador con el túnel activo sí ve resultados reales.
//
// Objetivo (pedido explícito): verificar la conexión a la BD de AWS y
// encontrar dónde se rompe el flujo. No es una suite de lógica de negocio.

import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// vitest no carga .env.local automáticamente (a diferencia de
// `node --env-file=.env.local server/index.mjs`), así que esta suite se
// autoabastece de las mismas variables TMS_DB_* que usa server/tms-db.mjs.
try {
  process.loadEnvFile(new URL('../../.env.local', import.meta.url));
} catch {
  // .env.local ausente o Node sin soporte de loadEnvFile — las variables
  // pueden venir igual del entorno del shell; si no, dbAvailable quedará en false.
}

// Todas las tablas que el frontend referencia hoy vía `supabase.from('<tabla>')`
// (barrido exhaustivo de src/pages/**, ver docs/reference/analisis-sistema-tms.md §5.4).
// Se listan agrupadas por módulo para que un fallo señale el módulo afectado.
const TABLES_BY_MODULE: Record<string, string[]> = {
  transportistas: ['carriers', 'countries', 'app_users'],
  vehiculos: ['vehicles', 'vehicle_types', 'carriers'],
  conductores: ['drivers', 'carriers', 'driver_license_types', 'app_users'],
  clientes: ['customers', 'countries'],
  tiendas: ['stores', 'countries', 'app_users'],
  paises: ['countries', 'stores', 'app_users'],
  pedidos: ['orders'],
  zonas: ['zones', 'countries'],
  licencias: ['driver_license_types', 'countries'],
  guias: ['dispatch_guides', 'routes', 'drivers', 'vehicles'],
  devoluciones: ['returns', 'orders'],
  liquidaciones: ['settlements', 'routes', 'carriers', 'drivers', 'dispatch_guides', 'returns', 'stores', 'zones', 'vehicles'],
  contratos: ['contracts', 'contract_documents'],
  configuracion: ['organizations', 'roles', 'app_users'],
  tracking: ['routes', 'zones', 'tracking_events', 'dispatch_guides'],
  dashboard: ['orders', 'routes', 'dispatch_guides', 'returns'],
  reportes: ['orders', 'routes', 'returns'],
  planificacion: ['drivers', 'routes', 'dispatch_guides', 'orders'],
};

// Tablas referenciadas por el frontend pero que NO existen en el esquema real —
// documentan una rotura de flujo conocida en vez de dejarla pasar en silencio.
// `zones` ya existe (sql/09, renombre de route_types) — ya no está ausente.
const KNOWN_MISSING_TABLES: string[] = [];

// Backend whitelist (server/tms-relations.mjs) — cualquier tabla del esquema
// que no esté aquí es rechazada por la API aunque exista en Postgres.
const BACKEND_WHITELIST = new Set([
  'app_users', 'carriers', 'contract_documents', 'contracts', 'costos_fijos',
  'costos_variables', 'countries', 'customers', 'depreciacion', 'dispatch_guides',
  'drivers', 'order_items', 'orders', 'organizations', 'parametros_globales',
  'rates', 'returns', 'roles', 'zones', 'routes', 'rutas_costeo', 'tariff_types',
  'settlements', 'sku_cotizaciones', 'stores', 'tipos_camion', 'tracking_events',
  'vehicle_types', 'vehicles', 'v_costo_fijo_mensual', 'v_costo_variable_por_km',
  // Fase 1 — Multi-country Foundation (docs/arquitectura-tms-oms/05-roadmap.md).
  'warehouses', 'final_customers', 'delivery_points', 'addresses', 'contacts',
  'driver_license_types', 'driver_licenses', 'user_scopes',
]);

// Top-level await (soportado por vitest/ESM): la disponibilidad de Aurora se
// resuelve durante la RECOLECCIÓN de tests, para que describe.skipIf() (que se
// evalúa antes de cualquier beforeAll) vea el valor real en vez de un default.
const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

const dbAvailable = await pool.query('SELECT 1').then(() => true).catch(() => false);

if (!dbAvailable) {
  console.warn('[db-connectivity] Sin conexión a Aurora — ¿túnel SSM activo en localhost:5432? Saltando suite de conectividad.');
}

afterAll(async () => {
  await pool.end();
});

describe('Conectividad Aurora (tms_olo)', () => {
  it.skipIf(!dbAvailable)('responde a un SELECT 1', async () => {
    const { rows } = await pool.query('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
  });
});

describe.skipIf(!dbAvailable)('Tablas por módulo (existencia + lectura)', () => {
  const allTables = [...new Set(Object.values(TABLES_BY_MODULE).flat())];

  for (const [module, tables] of Object.entries(TABLES_BY_MODULE)) {
    describe(`Módulo: ${module}`, () => {
      for (const table of tables) {
        it(`tabla "${table}" existe y es legible`, async () => {
          const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "${table}" LIMIT 1`);
          expect(typeof rows[0].n).toBe('number');
        });
      }
    });
  }

  it('cada tabla usada por el frontend está en la whitelist del backend (o se documenta como excepción)', () => {
    for (const table of allTables) {
      if (KNOWN_MISSING_TABLES.includes(table)) continue;
      expect(BACKEND_WHITELIST.has(table), `"${table}" no está en server/tms-relations.mjs TABLES`).toBe(true);
    }
  });
});

describe.skipIf(!dbAvailable)('Catálogo de Zonas: tabla "zones"', () => {
  // `zones` (antes `route_types`, renombrada en sql/09) YA existe y es la fuente
  // del Catálogo de Zonas. Una zona pertenece obligatoriamente a un país, así que
  // `country_id` es NOT NULL. Este test invierte el anterior, que documentaba la
  // ausencia de la tabla (rotura §5.3 ya resuelta).
  it('existe y country_id es NOT NULL', async () => {
    const { rows } = await pool.query("SELECT to_regclass('public.zones') AS reg");
    expect(rows[0].reg).not.toBeNull();

    const { rows: cols } = await pool.query(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'zones' AND column_name = 'country_id'",
    );
    expect(cols[0]?.is_nullable).toBe('NO');
  });
});

describe('EFLOW (WMS QA) — solo lectura, consumido por /planificacion', () => {
  it('health check via backend HTTP', async () => {
    const base = process.env.EFLOW_API_URL || 'http://localhost:4000';
    let res: Response;
    try {
      res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
    } catch {
      console.warn('[db-connectivity] Backend Express no responde en ' + base + ' — ¿"npm run server" activo? Saltando check EFLOW.');
      return;
    }
    const body = await res.json();
    if (!res.ok && body?.detail?.includes('Sin credenciales')) {
      console.warn('[db-connectivity] EFLOW sin credenciales en este entorno (esperado — ver docs/reference/analisis-sistema-tms.md §5.2). No es un fallo de código.');
      return;
    }
    expect(body.ok).toBe(true);
  });
});
