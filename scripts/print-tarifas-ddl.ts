// Regenera el DDL de las tablas propias del tarifador desde el registro de esquema.
//
//   npm run tarifas:ddl
//
// Escribe `sql/04_tarifas.sql`. Ese archivo NO se edita a mano: el modelo vive en
// `src/lib/tarifas/data/schema.ts` y el SQL se deriva, así que no pueden desfasarse.
// Como el resto del proyecto, esto solo GENERA el archivo — ejecutarlo en la base es manual.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateDdl } from '../src/lib/tarifas/data/ddl.ts';

const out = resolve(import.meta.dirname, '..', 'sql', '04_tarifas.sql');
writeFileSync(out, generateDdl(), 'utf8');
console.log(`DDL del tarifador escrito en ${out}`);
