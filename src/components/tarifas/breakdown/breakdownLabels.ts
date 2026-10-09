import type { ExplainedLine } from '../../../lib/tarifas/explain';

export type Nivel = 'resumen' | 'detalle' | 'auditoria';

export const MARGIN_LABEL: Record<string, string> = {
  OK: 'OK', WARN: 'Atención', CRITICAL: 'Crítico', LOSS: 'Pérdida',
};

export const BASIS_LABEL: Record<string, string> = {
  VALUE: 'valor de la mercancía', WEIGHT: 'peso', VOLUME: 'volumen', ORDERS: 'cantidad de pedidos',
};

/** De dónde sale una línea (regla del país, del transportista, estructura de costos…), con su color. */
export function originLabel(line: ExplainedLine, replacesCountry: boolean): { text: string; tone: string } | null {
  const { source, scope } = line.origen;
  if (source === 'ADHOC') return { text: 'Regla de esta liquidación', tone: 'bg-purple-50 text-purple-700' };
  if (source === 'COST_ROW') return { text: 'Estructura de costos', tone: 'bg-slate-100 text-slate-600' };
  if (scope === 'PARTY') {
    return { text: replacesCountry ? 'Regla del transportista · reemplaza a la del país' : 'Regla del transportista', tone: 'bg-amber-50 text-amber-700' };
  }
  if (source === 'RULE') return { text: 'Regla del país', tone: 'bg-teal-50 text-teal-700' };
  return null;
}
