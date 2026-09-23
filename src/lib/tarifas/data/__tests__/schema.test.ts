// Guardas del registro de esquema. Su valor: si alguien agrega una entidad y se olvida de la
// colección en el JSON, o declara una FK a una entidad que no existe, falla acá y no en producción.

import { describe, expect, it } from 'vitest';
import seed from '../../localData/seed.json';
import { COLLECTIONS } from '../../localData/store';
import { ENTITIES, ENTITY_NAMES, columnNames, entityDef, primaryKeyOf } from '../schema';
import { generateDdl } from '../ddl';

describe('registro de esquema', () => {
  it('cada entidad tiene su colección en la semilla del almacén JSON', () => {
    const collections = Object.keys(seed);
    const faltantes = ENTITY_NAMES.filter((name) => !collections.includes(entityDef(name).collection));
    expect(faltantes).toEqual([]);
  });

  it('cada entidad está listada en las colecciones del almacén', () => {
    // La semilla y el array de colecciones son dos listas distintas, y olvidarse de la segunda no
    // rompe nada: la entidad simplemente devuelve vacío para siempre, sin ningún error.
    const faltantes = ENTITY_NAMES.filter(
      (name) => !(COLLECTIONS as string[]).includes(entityDef(name).collection),
    );
    expect(faltantes).toEqual([]);
  });

  it('cada entidad declara exactamente una columna primaria', () => {
    for (const name of ENTITY_NAMES) {
      const pks = Object.values(entityDef(name).columns).filter((col) => col.primaryKey);
      expect(pks, `entidad "${name}"`).toHaveLength(1);
      expect(primaryKeyOf(name)).toBe('id');
    }
  });

  it('cada FK apunta a una entidad registrada', () => {
    for (const name of ENTITY_NAMES) {
      for (const col of Object.values(entityDef(name).columns)) {
        if (!col.references) continue;
        expect(ENTITY_NAMES, `FK de "${name}"`).toContain(col.references);
      }
    }
  });

  it('los nombres de tabla y los prefijos de id son únicos', () => {
    const tables = ENTITY_NAMES.map((name) => entityDef(name).table);
    const prefixes = ENTITY_NAMES.map((name) => entityDef(name).idPrefix);
    expect(new Set(tables).size).toBe(tables.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('las columnas de cada entidad coinciden con las claves de las filas de la semilla', () => {
    for (const name of ENTITY_NAMES) {
      const rows = (seed as Record<string, Record<string, unknown>[]>)[entityDef(name).collection];
      if (!rows?.length) continue; // auditLog y settlementSnapshots arrancan vacías

      const declared = new Set(columnNames(name));
      const sobrantes = Object.keys(rows[0]).filter((key) => !declared.has(key));
      expect(sobrantes, `la semilla de "${name}" trae columnas no declaradas`).toEqual([]);
    }
  });
});

describe('generación de DDL', () => {
  const ddl = generateDdl();

  it('incluye un CREATE TABLE por entidad', () => {
    for (const name of ENTITY_NAMES) {
      expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS ${entityDef(name).table} (`);
    }
  });

  it('crea las tablas padre antes que las que las referencian', () => {
    for (const name of ENTITY_NAMES) {
      for (const col of Object.values(entityDef(name).columns)) {
        if (!col.references || col.references === name) continue;
        const parent = ddl.indexOf(`CREATE TABLE IF NOT EXISTS ${entityDef(col.references).table} (`);
        const child = ddl.indexOf(`CREATE TABLE IF NOT EXISTS ${entityDef(name).table} (`);
        expect(parent, `${entityDef(col.references).table} debe crearse antes que ${entityDef(name).table}`)
          .toBeLessThan(child);
      }
    }
  });

  it('declara NOT NULL solo en las columnas no nullable', () => {
    expect(ddl).toContain('  zone_group_id text,'); // nullable: sin NOT NULL
    expect(ddl).toContain('  code text NOT NULL');
  });

  it('emite un índice por cada columna marcada como indexada', () => {
    const esperados = ENTITY_NAMES.flatMap((name) =>
      Object.entries(ENTITIES[name].columns)
        .filter(([, col]) => 'indexed' in col && col.indexed)
        .map(([column]) => `ON ${entityDef(name).table} (${column});`),
    );
    for (const esperado of esperados) expect(ddl).toContain(esperado);
  });
});
