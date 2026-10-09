// Integridad referencial para MemoryDataSource.

import {
  ForeignKeyError, UniqueViolationError, type Condition,
} from '../../../data/datasource';
import { ENTITY_NAMES, entityDef, primaryKeyOf, type EntityName } from '../../../data/schema';
import type { Row } from '../../../data/datasource';
import type { TarifasDatabase } from './store';
import { matches } from './filtering';

export function assertParentsExist(db: TarifasDatabase, entity: EntityName, values: Row,
  rowsOf: (db: TarifasDatabase, entity: EntityName) => Row[]): void {
  for (const [column, def] of Object.entries(entityDef(entity).columns)) {
    if (!def.references) continue;
    if (!(column in values)) continue;

    const value = values[column];
    if (value === null || value === undefined || value === '') continue;

    const parentPk = primaryKeyOf(def.references);
    const exists = rowsOf(db, def.references).some((row) => row[parentPk] === value);
    if (!exists) {
      throw new ForeignKeyError(
        `${entityDef(entity).label}: el campo "${column}" apunta a un ` +
          `${entityDef(def.references).label.toLowerCase()} que no existe (id: ${value}).`,
      );
    }
  }
}

export function assertUnique(
  db: TarifasDatabase,
  entity: EntityName,
  row: Row,
  rowsOf: (db: TarifasDatabase, entity: EntityName) => Row[],
): void {
  const def = entityDef(entity);
  const pk = primaryKeyOf(entity);
  const others = rowsOf(db, entity).filter((existing) => existing[pk] !== row[pk]);

  for (const [column, col] of Object.entries(def.columns)) {
    if (!col.unique || col.primaryKey) continue;
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (others.some((existing) => existing[column] === value)) {
      throw new UniqueViolationError(
        `${def.label}: ya existe una fila con ${column} = "${String(value)}".`,
      );
    }
  }

  for (const index of def.uniqueIndexes ?? []) {
    const applies = (candidate: Row) =>
      !index.where || matches(candidate, index.where as Condition);
    if (!applies(row)) continue;
    // Igual que Postgres: un NULL en la clave nunca choca con nada.
    if (index.columns.some((column) => row[column] === null || row[column] === undefined)) continue;

    const clash = others.some(
      (existing) => applies(existing) && index.columns.every((column) => existing[column] === row[column]),
    );
    if (clash) throw new UniqueViolationError(index.message);
  }
}

export function assertNoChildren(
  db: TarifasDatabase,
  entity: EntityName,
  id: string,
  rowsOf: (db: TarifasDatabase, entity: EntityName) => Row[],
): void {
  for (const childName of ENTITY_NAMES) {
    const childDef = entityDef(childName);
    for (const [column, def] of Object.entries(childDef.columns)) {
      if (def.references !== entity) continue;
      if (def.onDelete === 'cascade' || def.onDelete === 'set null') continue;

      const inUse = rowsOf(db, childName).some((row) => row[column] === id);
      if (inUse) {
        throw new ForeignKeyError(
          `No se puede eliminar: ${entityDef(entity).label.toLowerCase()} en uso en ` +
            `"${childDef.label}".`,
        );
      }
    }
  }
}

export function applyOnDelete(
  db: TarifasDatabase,
  entity: EntityName,
  id: string,
  rowsOf: (db: TarifasDatabase, entity: EntityName) => Row[],
  setRows: (db: TarifasDatabase, entity: EntityName, rows: Row[]) => void,
): void {
  for (const childName of ENTITY_NAMES) {
    for (const [column, def] of Object.entries(entityDef(childName).columns)) {
      if (def.references !== entity) continue;

      if (def.onDelete === 'cascade') {
        setRows(db, childName, rowsOf(db, childName).filter((row) => row[column] !== id));
      } else if (def.onDelete === 'set null') {
        for (const row of rowsOf(db, childName)) {
          if (row[column] === id) row[column] = null;
        }
      }
    }
  }
}
