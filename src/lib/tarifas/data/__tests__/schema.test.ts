// Guardas del registro de esquema. Su valor: si alguien agrega una entidad y se olvida de la
// colección en el JSON, declara una FK a una entidad que no existe, o toca el esquema sin regenerar
// el DDL o el manifiesto del backend, falla acá y no en producción.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import seed from '../../localData/seed.json';
import { COLLECTIONS } from '../../localData/store';
import {
  ENTITIES,
  ENTITY_NAMES,
  OWN_ENTITY_NAMES,
  columnNames,
  entityDef,
  isExternal,
  primaryKeyOf,
} from '../schema';
import { generateDdl } from '../ddl';
import { generateManifest } from '../manifest';

const ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

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

  it('las tablas propias llevan el prefijo tarifas_ y las externas no', () => {
    for (const name of OWN_ENTITY_NAMES) expect(entityDef(name).table).toMatch(/^tarifas_/);
    for (const name of ENTITY_NAMES.filter(isExternal)) {
      expect(entityDef(name).external?.baseTable, name).not.toMatch(/^tarifas_/);
    }
  });

  it('las columnas de cada entidad coinciden con las claves de las filas de la semilla', () => {
    for (const name of ENTITY_NAMES) {
      const rows = (seed as Record<string, Record<string, unknown>[]>)[entityDef(name).collection];
      if (!rows?.length) continue; // auditLog y settlements arrancan vacías

      const declared = new Set(columnNames(name));
      const sobrantes = Object.keys(rows[0]).filter((key) => !declared.has(key));
      expect(sobrantes, `la semilla de "${name}" trae columnas no declaradas`).toEqual([]);
    }
  });

  it('toda tabla propia con país lo referencia como uuid de la entidad externa', () => {
    for (const name of OWN_ENTITY_NAMES) {
      const col = entityDef(name).columns.country_id;
      if (!col) continue;
      expect(col.type, name).toBe('uuid');
      expect(col.references, name).toBe('country');
    }
  });
});

describe('generación de DDL', () => {
  const ddl = generateDdl();

  it('incluye un CREATE TABLE por entidad PROPIA y ninguno por las externas', () => {
    for (const name of OWN_ENTITY_NAMES) {
      expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS ${entityDef(name).table} (`);
    }
    for (const name of ENTITY_NAMES.filter(isExternal)) {
      expect(ddl).not.toContain(`CREATE TABLE IF NOT EXISTS ${entityDef(name).table} (`);
      expect(ddl).not.toContain(`CREATE TABLE IF NOT EXISTS ${entityDef(name).external!.baseTable} (`);
    }
  });

  it('crea las tablas padre propias antes que las que las referencian', () => {
    for (const name of OWN_ENTITY_NAMES) {
      for (const col of Object.values(entityDef(name).columns)) {
        if (!col.references || col.references === name || isExternal(col.references)) continue;
        const parent = ddl.indexOf(`CREATE TABLE IF NOT EXISTS ${entityDef(col.references).table} (`);
        const child = ddl.indexOf(`CREATE TABLE IF NOT EXISTS ${entityDef(name).table} (`);
        expect(parent, `${entityDef(col.references).table} debe crearse antes que ${entityDef(name).table}`)
          .toBeLessThan(child);
      }
    }
  });

  it('las FK hacia el TMS apuntan a la tabla base, nunca a una vista', () => {
    expect(ddl).toContain('FOREIGN KEY (trip_id) REFERENCES routes (id)');
    expect(ddl).toContain('FOREIGN KEY (carrier_id) REFERENCES carriers (id)');
    expect(ddl).toContain('FOREIGN KEY (country_id) REFERENCES countries (id)');
    expect(ddl).not.toContain('REFERENCES tarifas_v_');
  });

  it('declara uuid, NOT NULL y UNIQUE según el esquema', () => {
    expect(ddl).toContain('  trip_id uuid NOT NULL');
    expect(ddl).toContain('  carrier_id uuid NOT NULL UNIQUE');
    expect(ddl).toContain('  superseded_by text,'); // nullable: sin NOT NULL
  });

  it('una sola liquidación vigente por viaje: índice único parcial', () => {
    expect(ddl).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tarifas_settlements_trip_vigente_uq ON tarifas_settlements (trip_id) WHERE status <> 'Anulado';",
    );
  });

  it('emite un índice por cada columna indexada que no sea única', () => {
    const esperados = OWN_ENTITY_NAMES.flatMap((name) =>
      Object.entries(ENTITIES[name].columns)
        .filter(([, col]) => 'indexed' in col && col.indexed && !('unique' in col && col.unique))
        .map(([column]) => `ON ${entityDef(name).table} (${column});`),
    );
    for (const esperado of esperados) expect(ddl).toContain(esperado);
  });

  it('el archivo sql/04_tarifas.sql está regenerado (npm run tarifas:ddl)', () => {
    const committed = readFileSync(resolve(ROOT, 'sql', '04_tarifas.sql'), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(ddl);
  });
});

describe('manifiesto para el backend', () => {
  const manifest = generateManifest();

  it('lista todas las tablas, con las externas en solo lectura', () => {
    for (const name of ENTITY_NAMES) {
      const table = manifest.tables[entityDef(name).table];
      expect(table, name).toBeDefined();
      expect(table.readOnly, name).toBe(isExternal(name));
      expect(Object.keys(table.columns)).toEqual(columnNames(name));
    }
  });

  it('el archivo del backend está regenerado (npm run tarifas:manifest)', () => {
    const path = resolve(ROOT, 'backend', 'tarifas', 'src', 'schema_manifest.json');
    const committed = JSON.parse(readFileSync(path, 'utf8'));
    expect(committed).toEqual(manifest);
  });
});
