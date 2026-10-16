// Regenera el manifiesto del esquema del tarifador para el backend.
//
//   npm run tarifas:manifest
//
// Escribe `backend/tarifas/src/schema_manifest.json`, la lista blanca de tablas y columnas que el
// Lambda del tarifador deja leer y escribir. NO se edita a mano: se deriva de
// `src/lib/tarifas/data/schema.ts`, igual que el DDL.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateManifest } from '../src/lib/tarifas/data/manifest.ts';

const out = resolve(import.meta.dirname, '..', 'backend', 'tarifas', 'src', 'schema_manifest.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(generateManifest(), null, 2)}\n`, 'utf8');
console.log(`Manifiesto del tarifador escrito en ${out}`);
