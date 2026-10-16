// Manifiesto del esquema para el backend (`backend/tarifas/`).
//
// El backend es Python y no puede importar `schema.ts`; en vez de mantener allá una segunda lista
// de tablas y columnas, se genera este JSON desde el MISMO registro:
//
//   npm run tarifas:manifest   ->   backend/tarifas/src/schema_manifest.json
//
// El backend lo usa como lista blanca: qué tablas existen, qué columnas se pueden leer, filtrar,
// ordenar y escribir, de qué tipo son, y cuáles son de solo lectura. Un test verifica que el
// archivo commiteado coincide con el registro (si alguien toca `schema.ts` y no regenera, falla).

import { ENTITY_NAMES, entityDef, primaryKeyOf, type ColumnType } from './schema.ts';

export interface ManifestTable {
  entity: string;
  label: string;
  /** true = entidad del TMS: solo GET. */
  readOnly: boolean;
  appendOnly: boolean;
  primaryKey: string;
  idPrefix: string;
  columns: Record<string, { type: ColumnType; nullable: boolean }>;
}

export interface SchemaManifest {
  generatedFrom: string;
  tables: Record<string, ManifestTable>;
}

export function generateManifest(): SchemaManifest {
  const tables: Record<string, ManifestTable> = {};
  for (const name of ENTITY_NAMES) {
    const def = entityDef(name);
    tables[def.table] = {
      entity: name,
      label: def.label,
      readOnly: def.external !== undefined,
      appendOnly: def.appendOnly === true,
      primaryKey: primaryKeyOf(name),
      idPrefix: def.idPrefix,
      columns: Object.fromEntries(
        Object.entries(def.columns).map(([column, col]) => [
          column,
          { type: col.type, nullable: col.nullable === true || col.primaryKey === true },
        ]),
      ),
    };
  }
  return { generatedFrom: 'src/lib/tarifas/data/schema.ts', tables };
}
