// Parsing de hoja de parámetros de estructura de costos.

import { toDecimal } from '../money';
import { normalizeText } from '../../text';
import type { CostStructureParams } from '../types';
import { SHEET_PARAMS } from './sheets';
import type { ParseState, TemplateIssue } from './parsing';
import { findSheet, headerIndex, isBlankRow, numberOf, text } from './utils';

/**
 * Procesa la hoja de Parámetros.
 * Valida estructura, clave-valor, y asigna: kmPerYear, fuelPrice, fuelEfficiency, operatingDays.
 */
export function parseParams(sheets: Record<string, import('./sheets').SheetMatrix>): ParseState {
  const errors: TemplateIssue[] = [];
  const warnings: TemplateIssue[] = [];
  const truckTypes = new Set<string>();
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
        if (value === null || toDecimal(value).lessThanOrEqualTo(0)) {
          errors.push({ sheet: SHEET_PARAMS, row: line, message: `"${key}" necesita un número mayor que cero.` });
          return;
        }

        const numValue = Number(value);
        if (keyNorm === 'dias_operativos' || keyNorm === 'dias operativos') {
          operatingDays = numValue;
        } else if (keyNorm === 'km_anual' || keyNorm === 'km por anio') {
          params.kmPerYear = numValue;
        } else if (keyNorm === 'precio_combustible' || keyNorm === 'precio_diesel') {
          params.fuelPrice = value;
        } else if (keyNorm.startsWith('rendimiento')) {
          const truck = key.includes(':') ? key.slice(key.indexOf(':') + 1).trim() : '';
          if (!truck) {
            errors.push({ sheet: SHEET_PARAMS, row: line, message: `"${key}": escriba el tipo de camión después de ":" (rendimiento_km_litro:Camión mediano).` });
          } else {
            params.fuelEfficiency[truck] = value;
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

  return { errors, warnings, truckTypes, params, operatingDays, rows: [], usedCodes: new Set<string>() };
}
