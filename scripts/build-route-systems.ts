// Convierte los Excel de rutas/viajes de referencia a JSON estático servido
// desde `public/data/route-systems/`. Ejecutar tras cambiar los .xlsx:
//
//   pnpm run data:build              (nombres de conductor enmascarados)
//   DATA_PII=full pnpm run data:build (nombres reales — NO commitear)
//
// Motivo del pipeline: son ficheros estáticos, no una BD. Parsear 4.4 MB de
// xlsx en el navegador es inviable; se convierten una vez aquí (dev/commit) y
// la vista sólo hace fetch del JSON. `xlsx` queda como devDependency y nunca
// entra al bundle.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx';
import { parseCofersa, parseProgramacionViajes } from '../src/pages/planificacion/route-systems/parse.ts';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'public/data/route-systems');
mkdirSync(outDir, { recursive: true });

const maskConductor = process.env.DATA_PII !== 'full';

function sheetRows(file: string, sheet: string): unknown[][] {
  const wb = XLSX.read(readFileSync(resolve(root, file)), { type: 'buffer' });
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`${file}: no existe la hoja "${sheet}"`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
}

function emit(name: string, rows: unknown[]): void {
  writeFileSync(resolve(outDir, name), JSON.stringify(rows));
  console.log(`  ${name.padEnd(26)} ${rows.length} filas`);
}

console.log('build-route-systems:', maskConductor ? '(conductor enmascarado)' : '(PII COMPLETA)');

const cofersa = parseCofersa(sheetRows('Rutas cofersa.xlsx', 'Hoja1'));
emit('cofersa.json', cofersa);

const viajes = parseProgramacionViajes(
  sheetRows('ASIGNACION DE VIAJES.xlsx', 'PROGRAMACION DE VIAJES'),
  { maskConductor },
);
emit('programacion-viajes.json', viajes);

writeFileSync(
  resolve(outDir, 'meta.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    pii: maskConductor ? 'masked' : 'full',
    counts: { cofersa: cofersa.length, 'asignacion-viajes': viajes.length },
  }),
);
console.log('OK ->', outDir);
