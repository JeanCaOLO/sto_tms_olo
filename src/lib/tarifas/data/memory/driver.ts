// Almacén en memoria: implementa `DataSource` sobre una semilla. Replica la semántica del backend (FK,
// unicidad, append-only, transacciones). Solo lo usan las pruebas y el modo mock de desarrollo
// (`installMock.ts`, gated a DEV): en un build desplegado el módulo habla siempre con `HttpDataSource`.

import { genId, loadDatabase, persist, type TarifasDatabase } from './store';
import {
  AppendOnlyError,
  ForeignKeyError,
  NotFoundError,
  ReadOnlyEntityError,
  UniqueViolationError,
  type DataSource,
  type FindOptions,
  type Row,
} from '../datasource';
import { ENTITY_NAMES, entityDef, primaryKeyOf, type EntityName } from '../schema';
import { notifyWrite } from '../writeEvents';
import { applyOptions } from './filtering';
import { assertParentsExist, assertUnique, assertNoChildren, applyOnDelete } from './integrity';

export class MemoryDataSource implements DataSource {
  readonly kind = 'http' as const;

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

  private commit(db: TarifasDatabase, entity: EntityName): void {
    // Dentro de una transacción no se persiste: lo hace `transaction()` al final.
    if (this.unitOfWork) return;
    persist(db);
    // Como el driver HTTP: avisa a quien guarda copias de lo leído (el caché del catálogo).
    notifyWrite([entity]);
  }

  private rowsOf(db: TarifasDatabase, entity: EntityName): Row[] {
    const key = entityDef(entity).collection as keyof TarifasDatabase;
    const rows = db[key];
    if (!Array.isArray(rows)) {
      throw new Error(
        `La colección "${String(key)}" no existe en el almacén en memoria. ` +
          'Revisá la semilla del almacén.',
      );
    }
    return rows as Row[];
  }

  private setRows(db: TarifasDatabase, entity: EntityName, rows: Row[]): void {
    const key = entityDef(entity).collection;
    (db as unknown as Record<string, Row[]>)[key] = rows;
  }

  private assertWritable(entity: EntityName, operation: string): void {
    const def = entityDef(entity);
    if (def.external) throw new ReadOnlyEntityError(entity, def.label, operation);
  }

  async find(entity: EntityName, options?: FindOptions): Promise<Row[]> {
    return applyOptions(this.rowsOf(this.db(), entity), options);
  }

  async findOne(entity: EntityName, id: string): Promise<Row | null> {
    const pk = primaryKeyOf(entity);
    return this.rowsOf(this.db(), entity).find((row) => row[pk] === id) ?? null;
  }

  async insert(entity: EntityName, values: Row): Promise<Row> {
    this.assertWritable(entity, 'insert');
    const db = this.db();
    const def = entityDef(entity);
    const pk = primaryKeyOf(entity);

    assertParentsExist(db, entity, values, (d, e) => this.rowsOf(d, e));

    const row: Row = { [pk]: values[pk] ?? genId(def.idPrefix), ...values };
    const rows = this.rowsOf(db, entity);

    if (rows.some((existing) => existing[pk] === row[pk])) {
      // Se conserva ForeignKeyError como en el driver original (un test lo fija así).
      throw new ForeignKeyError(`${def.label}: ya existe una fila con el id "${row[pk]}".`);
    }
    assertUnique(db, entity, row, (d, e) => this.rowsOf(d, e));

    rows.push(row);
    this.commit(db, entity);
    return row;
  }

  async update(entity: EntityName, id: string, values: Row): Promise<Row> {
    this.assertWritable(entity, 'update');
    const def = entityDef(entity);
    if (def.appendOnly) throw new AppendOnlyError(entity, 'update');

    const db = this.db();
    const pk = primaryKeyOf(entity);
    const rows = this.rowsOf(db, entity);
    const index = rows.findIndex((row) => row[pk] === id);
    if (index === -1) throw new NotFoundError(entity, id, def.label);

    assertParentsExist(db, entity, values, (d, e) => this.rowsOf(d, e));

    // El id nunca se reemplaza desde el payload: mover una fila de identidad rompería toda FK que
    // la apunte, y ninguna pantalla del módulo lo necesita.
    const updated: Row = { ...rows[index], ...values, [pk]: id };
    assertUnique(db, entity, updated, (d, e) => this.rowsOf(d, e));
    rows[index] = updated;
    this.commit(db, entity);
    return updated;
  }

  async delete(entity: EntityName, id: string): Promise<void> {
    this.assertWritable(entity, 'delete');
    const def = entityDef(entity);
    if (def.appendOnly) throw new AppendOnlyError(entity, 'delete');

    const db = this.db();
    const pk = primaryKeyOf(entity);

    assertNoChildren(db, entity, id, (d, e) => this.rowsOf(d, e));
    applyOnDelete(db, entity, id, (d, e) => this.rowsOf(d, e), (d, e, rows) => this.setRows(d, e, rows));
    this.setRows(db, entity, this.rowsOf(db, entity).filter((row) => row[pk] !== id));
    this.commit(db, entity);
  }

  async transaction<T>(fn: (tx: DataSource) => Promise<T>): Promise<T> {
    // Ya estamos dentro de una: se une a la transacción en curso en vez de abrir otra.
    if (this.unitOfWork) return fn(this);

    // Copia profunda: si `fn` falla a mitad de camino, lo mutado se descarta con la copia y el
    // almacén persistido nunca vio los cambios parciales.
    const working = structuredClone(loadDatabase());
    const result = await fn(new MemoryDataSource(working));
    persist(working);
    notifyWrite(ENTITY_NAMES);
    return result;
  }
}
