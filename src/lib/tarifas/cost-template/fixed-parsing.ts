// Parsing de hoja de Fijos de estructura de costos (costos mensuales).

import Decimal from 'decimal.js';
import { toDecimal } from '../money';
import { normalizeText } from '../../text';
import { SHEET_FIXED, SHEET_HEADERS_FIXED, GROUP_ALIASES } from './sheets';
import type { ParseState } from './parsing';
import { findSheet, headerIndex, isBlankRow, numberOf, slug, text } from './utils';

/**
 * Procesa la hoja de Fijos.
 * Calcula depreciación de vehículos o monto mensual directo.
 */
export function parseFixed(state: ParseState, sheets: Record<string, import('./sheets').SheetMatrix>): void {
  const fixedSheet = findSheet(sheets, SHEET_FIXED);
  if (!fixedSheet) {
    state.warnings.push({ sheet: SHEET_FIXED, row: null, message: 'No hay hoja "Fijos": la estructura no tendrá costos mensuales.' });
  } else {
    const idx = headerIndex(fixedSheet[0] ?? [], SHEET_HEADERS_FIXED);
    if (idx.concepto === undefined || idx.aplica_a === undefined) {
      state.errors.push({ sheet: SHEET_FIXED, row: 1, message: 'Faltan encabezados: concepto y aplica_a.' });
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

        // Depreciación: monto mensual o valor_vehículo ÷ vida_meses.
        let amount: Decimal | null = monthly !== null ? toDecimal(monthly) : null;
        if (amount === null && value !== null && life !== null && toDecimal(life).greaterThan(0)) {
          amount = toDecimal(value).dividedBy(life);
        }

        const problems: string[] = [];
        if (!name) problems.push('falta el concepto');
        if (!group) problems.push('aplica_a debe ser conductor, ayudante, depreciacion u otros');
        if (amount === null || amount.isNegative()) problems.push('falta el monto mensual (o valor_vehiculo y vida_meses)');
        if (problems.length > 0) {
          state.errors.push({ sheet: SHEET_FIXED, row: line, message: `${name || 'Fila sin nombre'}: ${problems.join('; ')}.` });
          return;
        }
        if (truck) state.truckTypes.add(truck);

        let code = slug(name, truck);
        for (let n = 2; state.usedCodes.has(code); n += 1) code = `${slug(name, truck)}_${n}`;
        state.usedCodes.add(code);

        state.rows.push({
          code,
          label: name,
          driver: 'PER_MONTH_PRORATED',
          amount: amount!.toFixed(6),
          sign: 'ADD',
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
}
