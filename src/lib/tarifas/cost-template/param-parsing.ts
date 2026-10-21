// Parsing de hoja de parámetros de estructura de costos.

import { toDecimal } from '../money';
import { normalizeText } from '../../text';
import type { CostStructureParams } from '../types';
import { SHEET_PARAMS } from './sheets';
import type { ParseState, TemplateIssue } from './parsing';
import { findSheet, headerIndex, isBlankRow, numberOf, text } from './utils';

/** Clave sin guiones bajos, guiones ni espacios repetidos: "km_anual", "Km-anual" y "km  anual" son lo mismo. */
const canonicalParamKey = (keyNorm: string): string => keyNorm.replace(/[_\-\s]+/g, ' ').trim();

/** Sinónimos aceptados por parámetro (ya canónicos: minúsculas, sin acentos, con espacios). */
const PARAM_ALIASES: Record<'operatingDays' | 'kmPerYear' | 'fuelPrice', readonly string[]> = {
  operatingDays: ['dias operativos', 'dias operativos mes', 'dias operativos por mes'],
  kmPerYear: ['km anual', 'km anuales', 'km por anio', 'km por ano', 'km al anio', 'km al ano'],
  fuelPrice: ['precio combustible', 'precio diesel', 'precio del combustible', 'precio del diesel'],
};

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
        const canon = canonicalParamKey(keyNorm);
        if (PARAM_ALIASES.operatingDays.includes(canon)) {
          operatingDays = numValue;
        } else if (PARAM_ALIASES.kmPerYear.includes(canon)) {
          params.kmPerYear = numValue;
        } else if (PARAM_ALIASES.fuelPrice.includes(canon)) {
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
