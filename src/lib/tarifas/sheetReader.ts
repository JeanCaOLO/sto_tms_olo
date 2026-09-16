// Lectura de archivos de planilla: CSV y XLSX por la misma puerta.
//
// La parte difícil del CSV no es leerlo: es adivinar el separador. Excel en español exporta con
// punto y coma, Excel en inglés con coma, y algunos sistemas con tabulador. Un importador que
// asuma coma parte mal la mitad de los archivos que le van a dar, así que el separador se detecta
// y se puede corregir a mano.
//
// La detección es PURA y está testeada; la lectura del archivo no, porque necesita el File API.

import type { SheetMatrix } from './costSheetParser';

export type Delimiter = ',' | ';' | '\t' | '|';

const DELIMITERS: Delimiter[] = [',', ';', '\t', '|'];

/**
 * Separador más probable de un CSV.
 *
 * El criterio no es "cuál aparece más veces" —una columna de descripciones llena de comas ganaría—
 * sino "cuál parte todas las líneas en la MISMA cantidad de campos", que es lo que de verdad
 * distingue a un separador de un carácter cualquiera del contenido. Entre empates, gana el que más
 * columnas produce.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 20);

  if (lines.length === 0) return ',';

  let best: Delimiter = ',';
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => splitCsvLine(line, delimiter).length);
    const columns = counts[0] ?? 1;
    if (columns < 2) continue;

    const consistentes = counts.filter((c) => c === columns).length;
    // Consistencia primero; la cantidad de columnas solo desempata.
    const score = consistentes * 1000 + columns;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

/**
 * Parte una línea de CSV respetando las comillas dobles: un separador dentro de comillas es parte
 * del dato, no una división. También entiende la comilla escapada (`""`).
 */
export function splitCsvLine(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; }
        else inQuotes = false;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === delimiter) { fields.push(current); current = ''; }
    else current += char;
  }

  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Convierte el texto de un CSV en la misma matriz que produce una hoja de Excel. */
export function parseCsv(text: string, delimiter?: Delimiter): SheetMatrix {
  // El BOM que agrega Excel al guardar como CSV se cuela en el primer encabezado y rompe cualquier
  // comparación por nombre de columna.
  const clean = text.replace(/^﻿/, '');
  const fs = delimiter ?? detectDelimiter(clean);

  return clean
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => splitCsvLine(line, fs).map((cell) => (cell === '' ? null : cell)));
}

export interface LoadedSheet {
  name: string;
  matrix: SheetMatrix;
}

export function isCsvFile(name: string): boolean {
  return /\.(csv|txt|tsv)$/i.test(name);
}

/**
 * Lee un archivo de planilla y devuelve sus hojas. Un CSV siempre trae una sola.
 *
 * La librería de Excel se carga BAJO DEMANDA: pesa cientos de kB y solo hace falta cuando alguien
 * importa algo, así que no tiene por qué estar en el bundle que paga todo el mundo al abrir la app.
 */
export async function readSheets(file: File, csvDelimiter?: Delimiter): Promise<LoadedSheet[]> {
  if (isCsvFile(file.name)) {
    const text = await file.text();
    return [{ name: file.name, matrix: parseCsv(text, csvDelimiter) }];
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  return wb.SheetNames.map((name) => ({
    name,
    // `header: 1` devuelve la matriz cruda. Sin esto, la librería toma la primera fila como nombres
    // de columna — y en estas planillas la primera fila suele ser el título, no el encabezado.
    matrix: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1, blankrows: false, defval: null,
    }) as SheetMatrix,
  }));
}
