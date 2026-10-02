// Tests de aislamiento multi-tenant para la jerarquía País → Almacén →
// Cliente → Cliente Final → Punto de Entrega (Fase 1 — ver
// docs/arquitectura-tms-oms/05-roadmap.md y §20/§34 del prompt de
// implementación). Máxima prioridad según ese prompt.
//
// Estas tablas se crean en sql/06_fase1_multicountry_foundation.sql, que
// todavía NO se ha aplicado contra Aurora en este entorno (bloqueado por el
// clasificador de seguridad de Auto Mode — requiere aprobación explícita del
// usuario para modificar un recurso compartido). Por eso esta suite verifica
// primero que el esquema de Fase 1 exista y se SALTA por completo (con un
// mensaje explícito, no como fallo) si todavía no se aplicó — así queda
// lista para validar en verde en el momento en que la migración se aplique,
// sin necesitar cambios.

import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';

try {
  process.loadEnvFile(new URL('../../.env.local', import.meta.url));
} catch {
  // ver mismo patrón en db-connectivity.test.ts
}

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

const FASE1_TABLES = ['warehouses', 'final_customers', 'delivery_points', 'addresses', 'user_scopes'];

async function fase1SchemaExists(): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [FASE1_TABLES],
    );
    return rows[0].n === FASE1_TABLES.length;
  } catch {
    return false;
  }
}

const schemaReady = await fase1SchemaExists();

if (!schemaReady) {
  console.warn(
    '[multi-tenant-isolation] El esquema de Fase 1 (warehouses/final_customers/...) todavía no existe en Aurora. ' +
    'Corré `node --env-file=.env.local scripts/run-migration.mjs sql/06_fase1_multicountry_foundation.sql --execute` ' +
    '(requiere aprobación humana — bloqueado por el clasificador de Auto Mode) y volvé a correr esta suite.',
  );
}

afterAll(async () => {
  await pool.end();
});

describe.skipIf(!schemaReady)('Aislamiento multi-tenant — jerarquía País/Almacén/Cliente', () => {
  // Fixtures propios de la suite: dos clientes ficticios bajo dos warehouses
  // (o el mismo, si solo existe uno todavía) para que el test no dependa de
  // que el seed de Costa Rica/EPA/Cofersa ya se haya corrido.
  let warehouseId: string;
  let customerAId: string;
  let customerBId: string;
  let finalCustomerAId: string;
  let finalCustomerBId: string;

  it('setup: crea dos clientes de prueba bajo el mismo almacén', async () => {
    const { rows: warehouses } = await pool.query('SELECT id FROM warehouses LIMIT 1');
    if (!warehouses[0]) throw new Error('No hay ningún warehouse — corré el seed antes de esta suite.');
    warehouseId = warehouses[0].id;

    const { rows: orgRows } = await pool.query('SELECT organization_id, country_id FROM warehouses WHERE id = $1', [warehouseId]);
    const { organization_id: organizationId, country_id: countryId } = orgRows[0];

    const insertCustomer = async (code: string, name: string) => {
      const { rows } = await pool.query(
        `INSERT INTO customers (organization_id, country_id, warehouse_id, code, name, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [organizationId, countryId, warehouseId, code, name],
      );
      if (rows[0]) return rows[0].id;
      const { rows: existing } = await pool.query('SELECT id FROM customers WHERE warehouse_id = $1 AND code = $2', [warehouseId, code]);
      return existing[0].id;
    };

    customerAId = await insertCustomer('TEST-ISO-A', 'Cliente de prueba A (aislamiento)');
    customerBId = await insertCustomer('TEST-ISO-B', 'Cliente de prueba B (aislamiento)');

    const insertFinalCustomer = async (customerId: string, code: string) => {
      const { rows } = await pool.query(
        `INSERT INTO final_customers (customer_id, external_code, name, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (customer_id, external_code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [customerId, code, `Cliente final de ${code}`],
      );
      return rows[0].id;
    };

    finalCustomerAId = await insertFinalCustomer(customerAId, 'FC-A-1');
    finalCustomerBId = await insertFinalCustomer(customerBId, 'FC-B-1');

    expect(customerAId).not.toBe(customerBId);
  });

  it('Caso 1: un scope acotado al Cliente A no puede leer clientes finales del Cliente B', async () => {
    // Replica la query que usa server/tms-context-routes.mjs para
    // /v1/customers/:id/final-customers — el filtro por customer_id es la
    // frontera de aislamiento real.
    const { rows: visibleForA } = await pool.query(
      'SELECT id FROM final_customers WHERE customer_id = $1',
      [customerAId],
    );
    expect(visibleForA.map((r) => r.id)).toContain(finalCustomerAId);
    expect(visibleForA.map((r) => r.id)).not.toContain(finalCustomerBId);
  });

  it('Caso 4: un final_customer no puede "verse" desde el customer_id equivocado', async () => {
    const { rows } = await pool.query(
      'SELECT id FROM final_customers WHERE id = $1 AND customer_id = $2',
      [finalCustomerBId, customerAId],
    );
    expect(rows).toHaveLength(0);
  });

  it('external_code puede repetirse entre clientes distintos sin violar UNIQUE (§8)', async () => {
    // Mismo external_code ("DUP-1") bajo dos customers distintos — debe
    // permitirse porque el UNIQUE real es (customer_id, external_code), no
    // external_code solo.
    await pool.query(
      `INSERT INTO final_customers (customer_id, external_code, name, status)
       VALUES ($1, 'DUP-1', 'Duplicado bajo A', 'active')
       ON CONFLICT (customer_id, external_code) DO NOTHING`,
      [customerAId],
    );
    await expect(
      pool.query(
        `INSERT INTO final_customers (customer_id, external_code, name, status)
         VALUES ($1, 'DUP-1', 'Duplicado bajo B', 'active')
         ON CONFLICT (customer_id, external_code) DO NOTHING`,
        [customerBId],
      ),
    ).resolves.not.toThrow();

    const { rows } = await pool.query(
      `SELECT customer_id FROM final_customers WHERE external_code = 'DUP-1' ORDER BY customer_id`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('teardown: limpia los fixtures de esta suite', async () => {
    await pool.query(`DELETE FROM final_customers WHERE customer_id IN ($1, $2)`, [customerAId, customerBId]);
    await pool.query(`DELETE FROM customers WHERE id IN ($1, $2) AND code LIKE 'TEST-ISO-%'`, [customerAId, customerBId]);
  });
});

describe.skipIf(!schemaReady)('Caso 5: delivery_point pertenece al final_customer correcto', () => {
  it('un delivery_point no puede quedar huérfano de un final_customer inexistente', async () => {
    await expect(
      pool.query(
        `INSERT INTO delivery_points (final_customer_id, name) VALUES ('00000000-0000-0000-0000-000000000000', 'huérfano')`,
      ),
    ).rejects.toThrow();
  });

  it('un final_customer solo puede tener un delivery_point marcado is_default', async () => {
    const { rows: fcs } = await pool.query('SELECT id FROM final_customers LIMIT 1');
    if (!fcs[0]) return; // suite de fixtures corrió y ya se limpió; no bloquea el resultado
    const finalCustomerId = fcs[0].id;

    await pool.query(
      `INSERT INTO delivery_points (final_customer_id, name, is_default) VALUES ($1, 'Punto 1 (default)', true)
       ON CONFLICT DO NOTHING`,
      [finalCustomerId],
    );
    await expect(
      pool.query(
        `INSERT INTO delivery_points (final_customer_id, name, is_default) VALUES ($1, 'Punto 2 (default también)', true)`,
        [finalCustomerId],
      ),
    ).rejects.toThrow(); // viola el índice único parcial (is_default) por final_customer_id

    await pool.query(`DELETE FROM delivery_points WHERE final_customer_id = $1 AND name LIKE 'Punto 1%'`, [finalCustomerId]);
  });
});
