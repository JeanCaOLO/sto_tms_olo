// Parsing de hoja de Variables de estructura de costos (costos por km).

import { componentCostPerKm } from '../cost';
import { toDecimal } from '../money';
import { normalizeText } from '../../text';
import { SHEET_VARIABLES, SHEET_HEADERS_VARIABLES, FREQUENCY_ALIASES } from './sheets';
import type { ParseState } from './parsing';
import { findSheet, headerIndex, isBlankRow, numberOf, slug, text } from './utils';

/**
 * Procesa la hoja de Variables.
 * Calcula costo/km a partir de componentes, frecuencia y cantidad.
 */
export function parseVariables(state: ParseState, sheets: Record<string, import('./sheets').SheetMatrix>): void {
  const variableSheet = findSheet(sheets, SHEET_VARIABLES);
  if (!variableSheet) {
    state.warnings.push({ sheet: SHEET_VARIABLES, row: null, message: 'No hay hoja "Variables": la estructura no tendrá costos por km.' });
  } else {
    const idx = headerIndex(variableSheet[0] ?? [], SHEET_HEADERS_VARIABLES);
    const missing = ['componente', 'frecuencia', 'cantidad_frecuencia', 'costo'].filter((h) => idx[h] === undefined);
    if (missing.length > 0) {
      state.errors.push({ sheet: SHEET_VARIABLES, row: 1, message: `Faltan encabezados: ${missing.join(', ')}.` });
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
        if (qty === null || toDecimal(qty).lessThanOrEqualTo(0)) problems.push('cantidad_frecuencia debe ser un número mayor que cero');
        if (cost === null || toDecimal(cost).isNegative()) problems.push('el costo debe ser un número (cero o más)');
        if (problems.length > 0) {
          state.errors.push({ sheet: SHEET_VARIABLES, row: line, message: `${name || 'Fila sin nombre'}: ${problems.join('; ')}.` });
          return;
        }
        if ((frequency === 'year' || frequency === 'month') && !state.params.kmPerYear) {
          state.errors.push({ sheet: SHEET_VARIABLES, row: line, message: `${name}: con frecuencia ${frequency} hace falta "km_anual" en Parámetros.` });
          return;
        }
        if (truck) state.truckTypes.add(truck);

        const amount = cost!;
        const perKm = componentCostPerKm({ amount, frequency: frequency!, frequencyQty: Number(qty) }, state.params.kmPerYear);
        const unitQtyStr = unitRaw ? numberOf(unitRaw.match(/^[\d.,]+/)?.[0] ?? '') : null;
        const unitQty = unitQtyStr ? Number(unitQtyStr) : null;

        let code = slug(name, truck);
        for (let n = 2; state.usedCodes.has(code); n += 1) code = `${slug(name, truck)}_${n}`;
        state.usedCodes.add(code);

        state.rows.push({
          code,
          label: name,
          driver: 'PER_KM',
          amount,
          sign: 'ADD',
          appliesWhen: null,
          unit: unitRaw || null,
          active: true,
          group: 'mantenimiento',
          frequency,
          frequencyQty: Number(qty),
          unitQty,
          costPerKm: perKm ? perKm.toFixed(6) : null,
          truckType: truck || null,
        });
      });
    }
  }
}
