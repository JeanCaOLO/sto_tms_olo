// Contrato único de acceso a datos del tarifador. Todo lo que lee o escribe datos propios del
// módulo pasa por acá; nadie toca `localData/store.ts` ni `fetch` directamente.
//
// La razón de existir de esta interfaz: hoy la implementa `JsonDataSource` (JSON + localStorage);
// el día que haya Postgres, la implementa `HttpDataSource` contra una API, y no cambia ni una
// línea de UI ni del kernel — solo la variable de entorno que elige el driver (ver `index.ts`).
//
// Por qué HTTP y no una conexión directa a Postgres: el navegador no puede abrir un socket a
// Postgres, y poner credenciales de base de datos en el frontend las expone a cualquiera que abra
// las herramientas de desarrollo. El acceso real va detrás de una API, igual que el patrón que ya
// usa `server/index.mjs` para EFLOW.

import type { EntityName } from './schema';

export type Row = Record<string, any>;

export type WhereOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isNull'
  | 'notNull';

export interface Condition {
  column: string;
  op: WhereOp;
  /** No se usa con 'isNull'/'notNull'. Con 'in', un array. */
  value?: unknown;
}

/** Las condiciones de una consulta se combinan siempre con AND. Para OR, filtrar en el llamador. */
export type Where = Condition[];

export interface OrderBy {
  column: string;
  direction?: 'asc' | 'desc';
  /** Comparación con `localeCompare` en vez de `<`/`>`. Para nombres y códigos. */
  locale?: boolean;
}

export interface FindOptions {
  where?: Where;
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
}

export interface DataSource {
  /** Qué driver está activo. Útil para avisos en la UI ("estás sobre datos locales"). */
  readonly kind: 'json' | 'http';

  find(entity: EntityName, options?: FindOptions): Promise<Row[]>;
  findOne(entity: EntityName, id: string): Promise<Row | null>;

  /** Genera el id si `values` no lo trae. Devuelve la fila tal como quedó guardada. */
  insert(entity: EntityName, values: Row): Promise<Row>;

  /** Merge parcial sobre la fila existente. Falla si el id no existe. */
  update(entity: EntityName, id: string, values: Row): Promise<Row>;

  delete(entity: EntityName, id: string): Promise<void>;

  /**
   * Todo lo de adentro se confirma junto o no se confirma nada. Indispensable para guardar una
   * estructura de costos con N filas sin dejarla a medias si una falla.
   */
  transaction<T>(fn: (tx: DataSource) => Promise<T>): Promise<T>;
}

// ── Errores tipados ───────────────────────────────────────────────────────────────────────────
// La UI actual espera `{ error: { code?, message } }` (forma heredada de Supabase). Estos errores
// se traducen a esa forma en `localRulesDataSource.ts`, que es el borde con los componentes.

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly entity: EntityName;
  readonly id: string;

  constructor(entity: EntityName, id: string, label: string) {
    super(`${label} no encontrado (id: ${id}).`);
    this.name = 'NotFoundError';
    this.entity = entity;
    this.id = id;
  }
}

export class ForeignKeyError extends Error {
  /** Mismo código que Postgres para violación de FK, que es lo que la UI ya reconoce. */
  readonly code = '23503';
  constructor(message: string) {
    super(message);
    this.name = 'ForeignKeyError';
  }
}

export class AppendOnlyError extends Error {
  readonly code = 'APPEND_ONLY';
  constructor(entity: EntityName, operation: string) {
    super(`"${entity}" es append-only: la operación "${operation}" no está permitida.`);
    this.name = 'AppendOnlyError';
  }
}
