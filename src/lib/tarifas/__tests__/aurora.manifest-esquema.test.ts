// Verifica contra Aurora REAL (solo lectura) que `backend/tarifas/src/schema_manifest.json` coincide con
// las columnas y tipos de la base. Un desfase (p. ej. una migración que cambia `text` a `date` sin que el
// backend desplegado tenga el manifiesto nuevo) rompe las escrituras con
// `column "x" is of type date but expression is of type text`.
//
// Opt-in (necesita el túnel a Aurora):
//   TARIFAS_AURORA_MANIFEST=1 npx vitest run src/lib/tarifas/__tests__/aurora.manifest-esquema.test.ts

/* global process */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

try {
  process.loadEnvFile(new URL('../../../../.env.local', import.meta.url));
} catch {
  // Sin .env.local: las TMS_DB_* pueden venir del entorno.
}

const enabled = process.env.TARIFAS_AURORA_MANIFEST === '1';

// Tipo del manifiesto -> `information_schema.columns.data_type`.
const PG_TYPE: Record<string, string> = {
  text: 'text',
  int: 'integer',
  numeric: 'numeric',
  boolean: 'boolean',
  jsonb: 'jsonb',
  timestamptz: 'timestamp with time zone',
  date: 'date',
  uuid: 'uuid',
};

interface Manifest {
  tables: Record<string, { columns: Record<string, { type: string }> }>;
}

describe.skipIf(!enabled)('Manifiesto del backend contra el esquema de Aurora', { timeout: 60_000 }, () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({
      host: process.env.TMS_DB_HOST ?? 'localhost',
      port: Number(process.env.TMS_DB_PORT) || 5432,
      user: process.env.TMS_DB_USER,
      password: process.env.TMS_DB_PASSWORD,
      database: process.env.TMS_DB_NAME ?? 'tms_olo',
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query('BEGIN READ ONLY');
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('cada tabla y columna del manifiesto existe en Aurora con el mismo tipo', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../../backend/tarifas/src/schema_manifest.json', import.meta.url), 'utf-8'),
    ) as Manifest;
    const names = Object.keys(manifest.tables);
    const { rows } = await client.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [names],
    );
    const real = new Map<string, string>();
    // varchar/char se leen y se escriben como text: el cast `::text` es válido para ellos.
    for (const r of rows) {
      real.set(`${r.table_name}.${r.column_name}`, /^(character varying|character)$/.test(r.data_type) ? 'text' : r.data_type);
    }

    const problems: string[] = [];
    for (const [table, def] of Object.entries(manifest.tables)) {
      for (const [column, { type }] of Object.entries(def.columns)) {
        const actual = real.get(`${table}.${column}`);
        const expected = PG_TYPE[type];
        if (!expected) problems.push(`${table}.${column}: tipo de manifiesto desconocido "${type}"`);
        else if (!actual) problems.push(`${table}.${column}: no existe en Aurora`);
        else if (actual !== expected) problems.push(`${table}.${column}: manifiesto=${type} Aurora=${actual}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
