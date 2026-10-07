// Genera el DDL de Postgres a partir del MISMO registro de esquema que usan los drivers.
//
// El punto: el `.sql` no se escribe a mano ni se mantiene en paralelo con el código — se genera, y
// por construcción no puede quedar desfasado del modelo que la app realmente usa.
//
// Se ejecuta con:  npm run tarifas:ddl
// (ver ese script). El código de la app NUNCA ejecuta DDL por sí mismo — misma regla que el resto
// del proyecto: las migraciones las corre una persona, a mano (`scripts/run-migration.mjs`).
//
// Solo genera las tablas PROPIAS (`tarifas_*`). Las externas son del TMS: no se crean acá, pero las
// FK de las tablas propias SÍ las referencian (a su tabla base, nunca a una vista).

// Importa con extensión `.ts` explícita (permitido por `allowImportingTsExtensions`) porque este
// módulo también se ejecuta fuera de Vite, desde Node, en `scripts/print-tarifas-ddl.ts`.
import {
  OWN_ENTITY_NAMES,
  entityDef,
  type ColumnDef,
  type ColumnType,
  type EntityName,
  type UniqueIndexDef,
} from './schema.ts';

const SQL_TYPES: Record<ColumnType, string> = {
  text: 'text',
  int: 'integer',
  // Sin precisión fija: Postgres la trata como decimal exacto de precisión arbitraria, que es lo
  // que el kernel necesita (y node-postgres la devuelve como string, igual que `Money`).
  numeric: 'numeric',
  boolean: 'boolean',
  jsonb: 'jsonb',
  timestamptz: 'timestamptz',
  date: 'date',
  uuid: 'uuid',
};

const ON_DELETE: Record<NonNullable<ColumnDef['onDelete']>, string> = {
  restrict: 'RESTRICT',
  cascade: 'CASCADE',
  'set null': 'SET NULL',
};

/** Tabla a la que apunta una FK: la base de una externa (puede leerse desde una vista). */
function fkTarget(entity: EntityName): string {
  const def = entityDef(entity);
  return def.external?.baseTable ?? def.table;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function uniqueIndexDdl(table: string, index: UniqueIndexDef): string {
  const where = index.where
    ? ` WHERE ${index.where.column} ${index.where.op === 'eq' ? '=' : '<>'} ${sqlLiteral(index.where.value)}`
    : '';
  return `CREATE UNIQUE INDEX IF NOT EXISTS ${index.name} ON ${table} (${index.columns.join(', ')})${where};`;
}

function tableDdl(entity: EntityName): string {
  const def = entityDef(entity);
  const lines: string[] = [];
  const constraints: string[] = [];
  const indexes: string[] = [];

  for (const [column, col] of Object.entries(def.columns)) {
    const parts = [`  ${column}`, SQL_TYPES[col.type]];
    if (col.primaryKey) parts.push('PRIMARY KEY');
    else if (!col.nullable) parts.push('NOT NULL');
    if (col.unique && !col.primaryKey) parts.push('UNIQUE');
    lines.push(parts.join(' '));

    if (col.references) {
      constraints.push(
        `  CONSTRAINT ${def.table}_${column}_fkey FOREIGN KEY (${column}) ` +
          `REFERENCES ${fkTarget(col.references)} (id) ON DELETE ${ON_DELETE[col.onDelete ?? 'restrict']}`,
      );
    }
    if (col.indexed && !col.unique) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS ${def.table}_${column}_idx ON ${def.table} (${column});`,
      );
    }
  }

  for (const index of def.uniqueIndexes ?? []) indexes.push(uniqueIndexDdl(def.table, index));

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
 * topológico simple — el grafo del módulo es pequeño y acíclico. Las externas ya existen en la
 * base, así que no entran al orden.
 */
export function creationOrder(): EntityName[] {
  const ordered: EntityName[] = [];
  const visiting = new Set<EntityName>();
  const own = new Set(OWN_ENTITY_NAMES);

  const visit = (name: EntityName): void => {
    if (ordered.includes(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Ciclo de dependencias en el esquema, en "${name}": revisá las FK del registro.`);
    }
    visiting.add(name);
    for (const col of Object.values(entityDef(name).columns)) {
      if (col.references && col.references !== name && own.has(col.references)) visit(col.references);
    }
    visiting.delete(name);
    ordered.push(name);
  };

  for (const name of OWN_ENTITY_NAMES) visit(name);
  return ordered;
}

export function generateDdl(): string {
  const header = [
    '-- ============================================================================',
    '-- ARCHIVO GENERADO — NO EDITAR A MANO.',
    '-- Fuente: src/lib/tarifas/data/schema.ts',
    '-- Regenerar: npm run tarifas:ddl',
    '--',
    '-- Solo tablas PROPIAS del tarifador (tarifas_*). Las del TMS (countries, zones,',
    '-- carriers, drivers, vehicles, routes, dispatch_guides, returns) no se tocan: el',
    '-- tarifador las lee, nunca las escribe. Sus FK sí las referencian.',
    '--',
    '-- Lo aplica sql/19_tarifas_aurora.sql, junto con las vistas que leen las entidades',
    '-- externas. La aplicación nunca ejecuta DDL por sí misma.',
    '-- ============================================================================',
    '',
  ].join('\n');

  return `${header}${creationOrder().map(tableDdl).join('\n\n')}\n`;
}
