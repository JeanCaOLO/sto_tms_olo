// Genera el DDL de Postgres a partir del MISMO registro de esquema que usa el driver JSON.
//
// El punto: el día que exista la base, el `.sql` no se escribe a mano ni se mantiene en paralelo
// con el código — se genera, y por construcción no puede quedar desfasado del modelo que la app
// realmente usa.
//
// Se ejecuta con:  npm run tarifas:ddl
// (ver ese script). El código de la app NUNCA ejecuta DDL por sí mismo — misma regla que el resto
// del proyecto: las migraciones las corre una persona, a mano.

// Importa con extensión `.ts` explícita (permitido por `allowImportingTsExtensions`) porque este
// módulo también se ejecuta fuera de Vite, desde Node, en `scripts/print-tarifas-ddl.ts`.
import { ENTITY_NAMES, entityDef, type ColumnDef, type ColumnType, type EntityName } from './schema.ts';

const SQL_TYPES: Record<ColumnType, string> = {
  text: 'text',
  int: 'integer',
  // Sin precisión fija: Postgres la trata como decimal exacto de precisión arbitraria, que es lo
  // que el kernel necesita (y node-postgres la devuelve como string, igual que `Money`).
  numeric: 'numeric',
  boolean: 'boolean',
  jsonb: 'jsonb',
  timestamptz: 'timestamptz',
};

const ON_DELETE: Record<NonNullable<ColumnDef['onDelete']>, string> = {
  restrict: 'RESTRICT',
  cascade: 'CASCADE',
  'set null': 'SET NULL',
};

function tableDdl(entity: EntityName): string {
  const def = entityDef(entity);
  const lines: string[] = [];
  const constraints: string[] = [];
  const indexes: string[] = [];

  for (const [column, col] of Object.entries(def.columns)) {
    const parts = [`  ${column}`, SQL_TYPES[col.type]];
    if (col.primaryKey) parts.push('PRIMARY KEY');
    else if (!col.nullable) parts.push('NOT NULL');
    lines.push(parts.join(' '));

    if (col.references) {
      const parent = entityDef(col.references);
      constraints.push(
        `  CONSTRAINT ${def.table}_${column}_fkey FOREIGN KEY (${column}) ` +
          `REFERENCES ${parent.table} (id) ON DELETE ${ON_DELETE[col.onDelete ?? 'restrict']}`,
      );
    }
    if (col.indexed) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS ${def.table}_${column}_idx ON ${def.table} (${column});`,
      );
    }
  }

  const body = [...lines, ...constraints].join(',\n');
  const comment = `-- ${def.label}${def.appendOnly ? ' (append-only: sin UPDATE ni DELETE)' : ''}`;

  return [
    comment,
    `CREATE TABLE IF NOT EXISTS ${def.table} (`,
    body,
    ');',
    ...indexes,
  ].join('\n');
}

/**
 * Orden de creación: las tablas referenciadas primero, para que las FK resuelvan. Es un orden
 * topológico simple — el grafo del módulo es pequeño y acíclico.
 */
function creationOrder(): EntityName[] {
  const ordered: EntityName[] = [];
  const visiting = new Set<EntityName>();

  const visit = (name: EntityName): void => {
    if (ordered.includes(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Ciclo de dependencias en el esquema, en "${name}": revisá las FK del registro.`);
    }
    visiting.add(name);
    for (const col of Object.values(entityDef(name).columns)) {
      if (col.references && col.references !== name) visit(col.references);
    }
    visiting.delete(name);
    ordered.push(name);
  };

  for (const name of ENTITY_NAMES) visit(name);
  return ordered;
}

export function generateDdl(): string {
  const header = [
    '-- ============================================================================',
    '-- ARCHIVO GENERADO — NO EDITAR A MANO.',
    '-- Fuente: src/lib/tarifas/data/schema.ts',
    '-- Regenerar: npm run tarifas:ddl',
    '--',
    '-- EJECUTAR MANUALMENTE en el editor SQL antes de apuntar el frontend a Postgres',
    '-- (VITE_TARIFAS_DATASOURCE=postgres). La aplicación nunca ejecuta DDL por sí misma.',
    '--',
    '-- Solo tablas PROPIAS del tarifador. Las tablas del TMS (carriers, drivers, vehicles,',
    '-- routes, stores) no se tocan: el tarifador las lee, nunca las escribe.',
    '-- ============================================================================',
    '',
  ].join('\n');

  return `${header}${creationOrder().map(tableDdl).join('\n\n')}\n`;
}
