// Plantilla base de la estructura de costos: un libro de 3 hojas que se descarga, se llena y se sube.
//
//   Variables   — componentes que se repiten (mantenimiento, llantas…): cuestan "costo por km".
//   Fijos       — importes mensuales (conductor, ayudante, depreciación…): se prorratean por día.
//   Parámetros  — días operativos, km por año, precio del combustible y rendimiento por camión.
//
// Este módulo es PURO: recibe las hojas como matrices y devuelve las filas listas para guardar, más
// todo lo que está mal o dudoso, con hoja y fila, para mostrarlo en una vista previa ANTES de
// guardar. Leer el archivo (xlsx/csv) es trabajo de la pantalla.

import Decimal from 'decimal.js';
import { componentCostPerKm } from './cost';
import { codeFromLabel, parseAmount } from './costSheetParser';
import type { CostRowInput } from './costStructureDataSource';
import { normalizeText } from '../text';
import type { CostFrequency, CostGroup, CostStructureParams } from './types';

export type SheetCell = string | number | boolean | null | undefined;
export type SheetMatrix = SheetCell[][];

export const SHEET_VARIABLES = 'Variables';
export const SHEET_FIXED = 'Fijos';
export const SHEET_PARAMS = 'Parámetros';

export interface TemplateIssue {
  sheet: string;
  /** Fila del archivo (1 = encabezado). Null = la hoja entera. */
  row: number | null;
  message: string;
}

/** Costo del viaje tipo de cada camión, para que quien carga vea si las cifras tienen sentido. */
export interface TruckSummary {
  truckType: string | null;
  /** Suma de importes mensuales fijos. */
  fixedMonthly: string;
  /** Fijo mensual ÷ días operativos. */
  fixedDaily: string;
  /** Suma del costo por km de los componentes. */
  variablePerKm: string;
  /** Combustible por km (si hay precio y rendimiento). */
  fuelPerKm: string | null;
}

export interface ParsedCostTemplate {
  operatingDays: number | null;
  params: CostStructureParams;
  rows: CostRowInput[];
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
  /** Un resumen por tipo de camión (y uno sin tipo si hay filas para todos). */
  summary: TruckSummary[];
  /** Tipos de camión que nombra la plantilla. */
  truckTypes: string[];
}

// ── La plantilla vacía ────────────────────────────────────────────────────────────────────────

const HEADERS_VARIABLES = ['componente', 'tipo_camion', 'frecuencia', 'cantidad_frecuencia', 'costo', 'unidad_componente'];
const HEADERS_FIXED = ['concepto', 'monto_mensual', 'aplica_a', 'tipo_camion', 'valor_vehiculo', 'vida_meses'];
const HEADERS_PARAMS = ['clave', 'valor', 'descripcion'];

/** Las hojas de la plantilla con ejemplos genéricos (no son datos de ningún país). */
export function costTemplateSheets(): Record<string, SheetMatrix> {
  return {
    Instrucciones: [
      ['Plantilla de estructura de costos'],
      [''],
      ['1. Llene las hojas Variables, Fijos y Parámetros. Borre las filas de ejemplo.'],
      ['2. Variables: componentes que se repiten. "frecuencia" es km (cada N km), year (cada N años) o month (cada N meses).'],
      ['   El costo por km se calcula solo: km = costo ÷ N · year = costo ÷ (N × km por año) · month = costo ÷ (N × km por año ÷ 12).'],
      ['3. Fijos: importes mensuales. "aplica_a" es conductor, ayudante, depreciacion u otros. Para la depreciación puede dar valor_vehiculo y vida_meses en vez del monto.'],
      ['4. tipo_camion: deje vacío si la fila aplica a todos los camiones; si no, escriba el tipo tal como está en el catálogo de vehículos.'],
      ['5. Parámetros: dias_operativos, km_anual, precio_combustible y rendimiento_km_litro:<tipo de camión>.'],
      ['6. Los importes van sin símbolo de moneda; use un solo formato de números en todo el archivo.'],
    ],
    [SHEET_VARIABLES]: [
      HEADERS_VARIABLES,
      ['Filtro de aceite', 'Camión mediano', 'km', 5000, 9040, '1 UND'],
      ['Batería', 'Camión mediano', 'year', 2, 90400, '2 UND'],
    ],
    [SHEET_FIXED]: [
      HEADERS_FIXED,
      ['Salario del conductor', 500000, 'conductor', '', '', ''],
      ['Salario del ayudante', 300000, 'ayudante', '', '', ''],
      ['Depreciación', '', 'depreciacion', 'Camión mediano', 20000000, 72],
    ],
    [SHEET_PARAMS]: [
      HEADERS_PARAMS,
      ['dias_operativos', 30, 'Días operativos por mes: divisor de los costos mensuales'],
      ['km_anual', 36000, 'Kilómetros que recorre un camión al año'],
      ['precio_combustible', 635, 'Precio del litro'],
      ['rendimiento_km_litro:Camión mediano', 6, 'Kilómetros por litro de ese camión'],
    ],
  };
}

// ── Lectura ───────────────────────────────────────────────────────────────────────────────────

const FREQUENCY_ALIASES: Record<string, CostFrequency> = {
  km: 'km', kilometro: 'km', kilometros: 'km',
  year: 'year', anio: 'year', ano: 'year', anual: 'year', anos: 'year', anios: 'year',
  month: 'month', mes: 'month', mensual: 'month', meses: 'month',
};

const GROUP_ALIASES: Record<string, CostGroup> = {
  conductor: 'conductor', chofer: 'conductor',
  ayudante: 'ayudante',
  depreciacion: 'depreciacion', leasing: 'depreciacion',
  otros: 'otros', otro: 'otros',
};

function text(cell: SheetCell): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

function findSheet(sheets: Record<string, SheetMatrix>, wanted: string): SheetMatrix | null {
  const target = normalizeText(wanted);
  const key = Object.keys(sheets).find((name) => normalizeText(name) === target);
  return key ? sheets[key] : null;
}

/** Posición de cada encabezado esperado, por nombre normalizado (sin tildes, sin guiones bajos). */
function headerIndex(headerRow: SheetCell[], expected: string[]): Record<string, number> {
  const clean = (value: string) => normalizeText(value).replace(/[\s_-]+/g, '');
  const cells = headerRow.map((c) => clean(text(c)));
  const index: Record<string, number> = {};
  for (const name of expected) {
    const position = cells.indexOf(clean(name));
    if (position >= 0) index[name] = position;
  }
  return index;
}

const isBlankRow = (row: SheetCell[]) => row.every((c) => text(c) === '');

function numberOf(cell: SheetCell): number | null {
  const parsed = parseAmount(typeof cell === 'boolean' ? null : cell);
  return parsed === null ? null : Number(parsed);
}

function slug(...parts: string[]): string {
  return codeFromLabel(parts.filter(Boolean).join(' '));
}

export function parseCostTemplate(
  sheets: Record<string, SheetMatrix>,
  options: { knownTruckTypes?: string[] } = {},
): ParsedCostTemplate {
  const errors: TemplateIssue[] = [];
  const warnings: TemplateIssue[] = [];
  const rows: CostRowInput[] = [];
  const truckTypes = new Set<string>();
  const usedCodes = new Set<string>();
  const uniqueCode = (base: string) => {
    let code = base;
    for (let n = 2; usedCodes.has(code); n += 1) code = `${base}_${n}`;
    usedCodes.add(code);
    return code;
  };

  // ── Parámetros ──
  const params: CostStructureParams = { kmPerYear: null, fuelPrice: null, fuelEfficiency: {} };
  let operatingDays: number | null = null;
  const paramSheet = findSheet(sheets, SHEET_PARAMS);
  if (!paramSheet) {
    errors.push({ sheet: SHEET_PARAMS, row: null, message: 'Falta la hoja "Parámetros".' });
  } else {
    const idx = headerIndex(paramSheet[0] ?? [], ['clave', 'valor']);
    if (idx.clave === undefined || idx.valor === undefined) {
      errors.push({ sheet: SHEET_PARAMS, row: 1, message: 'Los encabezados deben ser "clave" y "valor".' });
    } else {
      paramSheet.slice(1).forEach((row, i) => {
        if (isBlankRow(row)) return;
        const line = i + 2;
        const key = text(row[idx.clave]);
        const keyNorm = normalizeText(key);
        const value = numberOf(row[idx.valor]);
        if (!key) return;
        if (value === null || value <= 0) {
          errors.push({ sheet: SHEET_PARAMS, row: line, message: `"${key}" necesita un número mayor que cero.` });
          return;
        }
        if (keyNorm === 'dias_operativos' || keyNorm === 'dias operativos') operatingDays = value;
        else if (keyNorm === 'km_anual' || keyNorm === 'km por anio') params.kmPerYear = value;
        else if (keyNorm === 'precio_combustible' || keyNorm === 'precio_diesel') params.fuelPrice = String(value);
        else if (keyNorm.startsWith('rendimiento')) {
          const truck = key.includes(':') ? key.slice(key.indexOf(':') + 1).trim() : '';
          if (!truck) {
            errors.push({ sheet: SHEET_PARAMS, row: line, message: `"${key}": escriba el tipo de camión después de ":" (rendimiento_km_litro:Camión mediano).` });
          } else {
            params.fuelEfficiency[truck] = String(value);
            truckTypes.add(truck);
          }
        } else {
          warnings.push({ sheet: SHEET_PARAMS, row: line, message: `Parámetro desconocido "${key}": se ignoró.` });
        }
      });
    }
  }
  if (operatingDays === null && paramSheet) {
    errors.push({ sheet: SHEET_PARAMS, row: null, message: 'Falta "dias_operativos": sin él no se pueden prorratear los costos mensuales.' });
  }

  // ── Variables ──
  const variableSheet = findSheet(sheets, SHEET_VARIABLES);
  if (!variableSheet) {
    warnings.push({ sheet: SHEET_VARIABLES, row: null, message: 'No hay hoja "Variables": la estructura no tendrá costos por km.' });
  } else {
    const idx = headerIndex(variableSheet[0] ?? [], HEADERS_VARIABLES);
    const missing = ['componente', 'frecuencia', 'cantidad_frecuencia', 'costo'].filter((h) => idx[h] === undefined);
    if (missing.length > 0) {
      errors.push({ sheet: SHEET_VARIABLES, row: 1, message: `Faltan encabezados: ${missing.join(', ')}.` });
    } else {
      variableSheet.slice(1).forEach((row, i) => {
        if (isBlankRow(row)) return;
        const line = i + 2;
        const name = text(row[idx.componente]);
        const truck = idx.tipo_camion !== undefined ? text(row[idx.tipo_camion]) : '';
        const frequency = FREQUENCY_ALIASES[normalizeText(text(row[idx.frecuencia]))];
        const qty = numberOf(row[idx.cantidad_frecuencia]);
        const cost = numberOf(row[idx.costo]);
        const unitRaw = idx.unidad_componente !== undefined ? text(row[idx.unidad_componente]) : '';

        const problems: string[] = [];
        if (!name) problems.push('falta el componente');
        if (!frequency) problems.push('la frecuencia debe ser km, year o month');
        if (qty === null || qty <= 0) problems.push('cantidad_frecuencia debe ser un número mayor que cero');
        if (cost === null || cost < 0) problems.push('el costo debe ser un número (cero o más)');
        if (problems.length > 0) {
          errors.push({ sheet: SHEET_VARIABLES, row: line, message: `${name || 'Fila sin nombre'}: ${problems.join('; ')}.` });
          return;
        }
        if ((frequency === 'year' || frequency === 'month') && !params.kmPerYear) {
          errors.push({ sheet: SHEET_VARIABLES, row: line, message: `${name}: con frecuencia ${frequency} hace falta "km_anual" en Parámetros.` });
          return;
        }
        if (truck) truckTypes.add(truck);

        const amount = String(cost);
        const perKm = componentCostPerKm({ amount, frequency: frequency!, frequencyQty: qty }, params.kmPerYear);
        const unitQty = unitRaw ? numberOf(unitRaw.match(/^[\d.,]+/)?.[0] ?? '') : null;
        rows.push({
          code: uniqueCode(slug(name, truck)),
          label: name,
          driver: 'PER_KM',
          amount,
          sign: 'ADD',
          appliesWhen: null,
          unit: unitRaw || null,
          active: true,
          group: 'mantenimiento',
          frequency,
          frequencyQty: qty,
          unitQty,
          costPerKm: perKm ? perKm.toFixed(6) : null,
          truckType: truck || null,
        });
      });
    }
  }

  // ── Fijos ──
  const fixedSheet = findSheet(sheets, SHEET_FIXED);
  if (!fixedSheet) {
    warnings.push({ sheet: SHEET_FIXED, row: null, message: 'No hay hoja "Fijos": la estructura no tendrá costos mensuales.' });
  } else {
    const idx = headerIndex(fixedSheet[0] ?? [], HEADERS_FIXED);
    if (idx.concepto === undefined || idx.aplica_a === undefined) {
      errors.push({ sheet: SHEET_FIXED, row: 1, message: 'Faltan encabezados: concepto y aplica_a.' });
    } else {
      fixedSheet.slice(1).forEach((row, i) => {
        if (isBlankRow(row)) return;
        const line = i + 2;
        const name = text(row[idx.concepto]);
        const group = GROUP_ALIASES[normalizeText(text(row[idx.aplica_a]))];
        const truck = idx.tipo_camion !== undefined ? text(row[idx.tipo_camion]) : '';
        const monthly = idx.monto_mensual !== undefined ? numberOf(row[idx.monto_mensual]) : null;
        const value = idx.valor_vehiculo !== undefined ? numberOf(row[idx.valor_vehiculo]) : null;
        const life = idx.vida_meses !== undefined ? numberOf(row[idx.vida_meses]) : null;

        // Depreciación: acepta el monto mensual o valor del vehículo ÷ vida útil en meses.
        let amount: Decimal | null = monthly !== null ? new Decimal(monthly) : null;
        if (amount === null && value !== null && life !== null && life > 0) {
          amount = new Decimal(value).dividedBy(life);
        }

        const problems: string[] = [];
        if (!name) problems.push('falta el concepto');
        if (!group) problems.push('aplica_a debe ser conductor, ayudante, depreciacion u otros');
        if (amount === null || amount.isNegative()) problems.push('falta el monto mensual (o valor_vehiculo y vida_meses)');
        if (problems.length > 0) {
          errors.push({ sheet: SHEET_FIXED, row: line, message: `${name || 'Fila sin nombre'}: ${problems.join('; ')}.` });
          return;
        }
        if (truck) truckTypes.add(truck);

        rows.push({
          code: uniqueCode(slug(name, truck)),
          label: name,
          driver: 'PER_MONTH_PRORATED',
          amount: amount!.toFixed(6),
          sign: 'ADD',
          // La fila del ayudante solo cuenta si el viaje lo declara (variable por viaje 0/1).
          appliesWhen: group === 'ayudante' ? { p: 'GT', left: 'custom:con_ayudante', right: 0 } : null,
          unit: 'mensual',
          active: true,
          group,
          frequency: null,
          frequencyQty: null,
          unitQty: null,
          costPerKm: null,
          truckType: truck || null,
        });
      });
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ sheet: SHEET_VARIABLES, row: null, message: 'La plantilla no tiene ninguna fila de costo.' });
  }

  // ── Tipos de camión desconocidos ──
  if (options.knownTruckTypes && options.knownTruckTypes.length > 0) {
    const known = new Set(options.knownTruckTypes.map((t) => normalizeText(t)));
    const unknown = [...truckTypes].filter((t) => !known.has(normalizeText(t)));
    if (unknown.length > 0) {
      warnings.push({
        sheet: 'General', row: null,
        message: `Estos tipos de camión no existen en el catálogo de vehículos y nunca se aplicarán: ${unknown.join(', ')}.`,
      });
    }
  }

  const days = operatingDays ?? 0;
  return {
    operatingDays,
    params,
    rows,
    errors,
    warnings,
    summary: summarize(rows, params, days),
    truckTypes: [...truckTypes],
  };
}

/** Totales por tipo de camión: lo mínimo para que quien carga vea si las cifras tienen sentido. */
export function summarize(rows: CostRowInput[], params: CostStructureParams, operatingDays: number): TruckSummary[] {
  const types = new Set<string | null>(rows.map((r) => r.truckType ?? null));
  for (const truck of Object.keys(params.fuelEfficiency)) types.add(truck);
  const generic = rows.filter((r) => !r.truckType);

  const result: TruckSummary[] = [];
  for (const truck of types) {
    if (truck === null && types.size > 1 && generic.length === 0) continue;
    const mine = rows.filter((r) => (truck === null ? !r.truckType : !r.truckType || r.truckType === truck));
    const fixedMonthly = mine
      .filter((r) => r.driver === 'PER_MONTH_PRORATED')
      .reduce((sum, r) => sum.plus(r.amount), new Decimal(0));
    const variablePerKm = mine
      .filter((r) => r.frequency)
      .reduce((sum, r) => sum.plus(r.costPerKm ?? 0), new Decimal(0));
    const efficiency = truck ? params.fuelEfficiency[truck] : undefined;
    const fuelPerKm = params.fuelPrice && efficiency && Number(efficiency) > 0
      ? new Decimal(params.fuelPrice).dividedBy(efficiency)
      : null;
    result.push({
      truckType: truck,
      fixedMonthly: fixedMonthly.toFixed(2),
      fixedDaily: operatingDays > 0 ? fixedMonthly.dividedBy(operatingDays).toFixed(2) : '0.00',
      variablePerKm: variablePerKm.toFixed(4),
      fuelPerKm: fuelPerKm ? fuelPerKm.toFixed(4) : null,
    });
  }
  return result;
}
