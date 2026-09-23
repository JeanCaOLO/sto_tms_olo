// Driver JSON: implementa `DataSource` sobre `localData/store.ts` (semilla embebida +
// localStorage). Es el driver activo mientras no haya acceso a Postgres.
//
// Lo que este driver aporta sobre el acceso directo al store que había antes:
// - Consultas declarativas (where/orderBy/limit) en vez de `.filter().sort()` repetido por entidad.
// - Transacciones reales: lo de adentro se persiste una sola vez, al final, o nada.
// - Integridad referencial derivada del registro de esquema, en vez de chequeos a mano por caso.
//
// Lo que NO hace a propósito: coaccionar tipos al leer. La semilla tiene numerics guardados como
// number de JS y otros como string; normalizarlos acá cambiaría el resultado del motor. Esa
// normalización sigue en el borde del kernel, donde ya estaba.

import { genId, loadDatabase, persist, type TarifasDatabase } from '../localData/store';
import {
  AppendOnlyError,
  ForeignKeyError,
  NotFoundError,
  type Condition,
  type DataSource,
  type FindOptions,
  type OrderBy,
  type Row,
} from './datasource';
import { ENTITY_NAMES, entityDef, primaryKeyOf, type EntityName } from './schema';

// ── Filtrado y orden ──────────────────────────────────────────────────────────────────────────

function matches(row: Row, condition: Condition): boolean {
  const actual = row[condition.column];
  switch (condition.op) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'gt':
      return actual > (condition.value as never);
    case 'gte':
      return actual >= (condition.value as never);
    case 'lt':
      return actual < (condition.value as never);
    case 'lte':
      return actual <= (condition.value as never);
    case 'isNull':
      return actual === null || actual === undefined;
    case 'notNull':
      return actual !== null && actual !== undefined;
  }
}

function compare(a: Row, b: Row, order: OrderBy): number {
  const left = a[order.column];
  const right = b[order.column];
  const sign = order.direction === 'desc' ? -1 : 1;

  if (left === right) return 0;
  if (left === null || left === undefined) return 1; // nulos al final, como NULLS LAST
  if (right === null || right === undefined) return -1;

  if (order.locale) {
    return sign * String(left).localeCompare(String(right));
  }
  return sign * (left < right ? -1 : 1);
}

function applyOptions(rows: Row[], options: FindOptions | undefined): Row[] {
  if (!options) return rows.slice();

  let result = options.where?.length
    ? rows.filter((row) => options.where!.every((condition) => matches(row, condition)))
    : rows.slice();

  if (options.orderBy?.length) {
    result.sort((a, b) => {
      for (const order of options.orderBy!) {
        const outcome = compare(a, b, order);
        if (outcome !== 0) return outcome;
      }
      return 0;
    });
  }

  const offset = options.offset ?? 0;
  if (offset > 0 || options.limit !== undefined) {
    result = result.slice(offset, options.limit === undefined ? undefined : offset + options.limit);
  }
  return result;
}

// ── Driver ────────────────────────────────────────────────────────────────────────────────────

export class JsonDataSource implements DataSource {
  readonly kind = 'json' as const;

  /**
   * Cuando está presente, las operaciones trabajan sobre esta copia en memoria y NO persisten:
   * es la unidad de trabajo de una transacción, que se persiste una sola vez al confirmar.
   */
  private readonly unitOfWork: TarifasDatabase | null;

  constructor(unitOfWork: TarifasDatabase | null = null) {
    this.unitOfWork = unitOfWork;
  }

  private db(): TarifasDatabase {
    return this.unitOfWork ?? loadDatabase();
  }

  private commit(db: TarifasDatabase): void {
    // Dentro de una transacción no se persiste: lo hace `transaction()` al final.
    if (!this.unitOfWork) persist(db);
  }

  private rowsOf(db: TarifasDatabase, entity: EntityName): Row[] {
    const key = entityDef(entity).collection as keyof TarifasDatabase;
    const rows = db[key];
    if (!Array.isArray(rows)) {
      throw new Error(
        `La colección "${String(key)}" no existe en el almacén local. ` +
          'Puede que el JSON de localStorage sea de una versión anterior: reiniciá a la semilla desde Reglas de Tarifa.',
      );
    }
    return rows as Row[];
  }

  private setRows(db: TarifasDatabase, entity: EntityName, rows: Row[]): void {
    const key = entityDef(entity).collection;
    (db as unknown as Record<string, Row[]>)[key] = rows;
  }

  // ── Integridad referencial, derivada del registro de esquema ─────────────────────────────────

  /** Verifica que cada FK declarada apunte a una fila que existe. */
  private assertParentsExist(db: TarifasDatabase, entity: EntityName, values: Row): void {
    for (const [column, def] of Object.entries(entityDef(entity).columns)) {
      if (!def.references) continue;
      if (!(column in values)) continue;

      const value = values[column];
      if (value === null || value === undefined || value === '') continue;

      const parentPk = primaryKeyOf(def.references);
      const exists = this.rowsOf(db, def.references).some((row) => row[parentPk] === value);
      if (!exists) {
        throw new ForeignKeyError(
          `${entityDef(entity).label}: el campo "${column}" apunta a un ` +
            `${entityDef(def.references).label.toLowerCase()} que no existe (id: ${value}).`,
        );
      }
    }
  }

  /** Verifica que nadie referencie la fila que se va a borrar. */
  private assertNoChildren(db: TarifasDatabase, entity: EntityName, id: string): void {
    for (const childName of ENTITY_NAMES) {
      const childDef = entityDef(childName);
      for (const [column, def] of Object.entries(childDef.columns)) {
        if (def.references !== entity) continue;
        if (def.onDelete === 'cascade' || def.onDelete === 'set null') continue;

        const inUse = this.rowsOf(db, childName).some((row) => row[column] === id);
        if (inUse) {
          throw new ForeignKeyError(
            `No se puede eliminar: ${entityDef(entity).label.toLowerCase()} en uso en ` +
              `"${childDef.label}".`,
          );
        }
      }
    }
  }

  /** Aplica `cascade` / `set null` de los hijos declarados en el esquema. */
  private applyOnDelete(db: TarifasDatabase, entity: EntityName, id: string): void {
    for (const childName of ENTITY_NAMES) {
      for (const [column, def] of Object.entries(entityDef(childName).columns)) {
        if (def.references !== entity) continue;

        if (def.onDelete === 'cascade') {
          this.setRows(db, childName, this.rowsOf(db, childName).filter((row) => row[column] !== id));
        } else if (def.onDelete === 'set null') {
          for (const row of this.rowsOf(db, childName)) {
            if (row[column] === id) row[column] = null;
          }
        }
      }
    }
  }

  // ── Operaciones ──────────────────────────────────────────────────────────────────────────────

  async find(entity: EntityName, options?: FindOptions): Promise<Row[]> {
    return applyOptions(this.rowsOf(this.db(), entity), options);
  }

  async findOne(entity: EntityName, id: string): Promise<Row | null> {
    const pk = primaryKeyOf(entity);
    return this.rowsOf(this.db(), entity).find((row) => row[pk] === id) ?? null;
  }

  async insert(entity: EntityName, values: Row): Promise<Row> {
    const db = this.db();
    const def = entityDef(entity);
    const pk = primaryKeyOf(entity);

    this.assertParentsExist(db, entity, values);

    const row: Row = { [pk]: values[pk] ?? genId(def.idPrefix), ...values };
    const rows = this.rowsOf(db, entity);

    if (rows.some((existing) => existing[pk] === row[pk])) {
      throw new ForeignKeyError(`${def.label}: ya existe una fila con el id "${row[pk]}".`);
    }

    rows.push(row);
    this.commit(db);
    return row;
  }

  async update(entity: EntityName, id: string, values: Row): Promise<Row> {
    const def = entityDef(entity);
    if (def.appendOnly) throw new AppendOnlyError(entity, 'update');

    const db = this.db();
    const pk = primaryKeyOf(entity);
    const rows = this.rowsOf(db, entity);
    const index = rows.findIndex((row) => row[pk] === id);
    if (index === -1) throw new NotFoundError(entity, id, def.label);

    this.assertParentsExist(db, entity, values);

    // El id nunca se reemplaza desde el payload: mover una fila de identidad rompería toda FK que
    // la apunte, y ninguna pantalla del módulo lo necesita.
    const updated: Row = { ...rows[index], ...values, [pk]: id };
    rows[index] = updated;
    this.commit(db);
    return updated;
  }

  async delete(entity: EntityName, id: string): Promise<void> {
    const def = entityDef(entity);
    if (def.appendOnly) throw new AppendOnlyError(entity, 'delete');

    const db = this.db();
    const pk = primaryKeyOf(entity);

    this.assertNoChildren(db, entity, id);
    this.applyOnDelete(db, entity, id);
    this.setRows(db, entity, this.rowsOf(db, entity).filter((row) => row[pk] !== id));
    this.commit(db);
  }

  async transaction<T>(fn: (tx: DataSource) => Promise<T>): Promise<T> {
    // Ya estamos dentro de una: se une a la transacción en curso en vez de abrir otra.
    if (this.unitOfWork) return fn(this);

    // Copia profunda: si `fn` falla a mitad de camino, lo mutado se descarta con la copia y el
    // almacén persistido nunca vio los cambios parciales.
    const working = structuredClone(loadDatabase());
    const result = await fn(new JsonDataSource(working));
    persist(working);
    return result;
  }
}
