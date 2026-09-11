// Formateo de presentación. El kernel emite Money (string decimal exacto) y fracciones sin decidir
// cómo se ven en pantalla — eso es trabajo de la UI, no del motor de cálculo.
// Puerto casi literal de prototipoTarifador/src/ui/format.ts (mismo vocabulario Pred/VarKey).

import type { BaseRef, DiscardReason, Stage, VarKey } from './types';
import type { Pred } from './types';

export function formatMoney(amount: string, currency: string): string {
  if (currency === 'USD') return `$${amount}`;
  return `${amount} ${currency}`;
}

export function formatPct(fraction: string): string {
  return `${(Number(fraction) * 100).toFixed(2)}%`;
}

export const STAGE_LABELS: Record<Stage, string> = {
  BASE: 'Base',
  VARIABLE: 'Variable',
  MODIFIER: 'Modificador',
  SURCHARGE: 'Recargo',
  ADJUSTMENT: 'Ajuste',
  TAX: 'Impuesto',
};

export const VAR_KEY_LABELS: Record<VarKey, string> = {
  countryId: 'País',
  km: 'Distancia (km)',
  clientCount: 'Clientes',
  packageCount: 'Bultos',
  weightKg: 'Peso (kg)',
  truckTypeId: 'Tipo de camión',
  serviceType: 'Tipo de servicio',
  fleetType: 'Flota',
  carrierId: 'Transportista',
  customerId: 'Cliente',
  durationHours: 'Duración (h)',
  tollsAmount: 'Peajes',
  lateMinutes: 'Retraso (min)',
  incidentCount: 'Incidentes',
  originZone: 'Zona de origen',
  destZone: 'Zona de destino',
  originZoneGroup: 'Grupo de zona de origen',
  destZoneGroup: 'Grupo de zona de destino',
  overnightNights: 'Noches de pernocta',
  weekday: 'Día de la semana',
};

export const COMPARISON_OP_LABELS: Record<string, string> = {
  EQ: '=',
  NEQ: '≠',
  GT: '>',
  GTE: '≥',
  LT: '<',
  LTE: '≤',
};

export const BASE_REF_LABELS: Record<BaseRef['of'], string> = {
  STAGE_SUBTOTAL: 'subtotal de etapa',
  RUNNING_SUBTOTAL: 'subtotal acumulado',
  RULE: 'otra regla',
};

export const DISCARD_REASON_LABELS: Record<DiscardReason, string> = {
  CONDITION_FALSE: 'Condición no cumplida',
  EXCLUDED_BY_EXCLUSIVE: 'Excluida por EXCLUSIVE',
  LOST_MAX: 'Perdió el MAX',
  INACTIVE: 'Inactiva',
};

// Convierte un Pred en un string legible ("Zona de origen = CCS Y Zona de destino = CAR").
export function formatPred(pred: Pred): string {
  switch (pred.p) {
    case 'ALWAYS':
      return 'Siempre';
    case 'EQ':
      return `${VAR_KEY_LABELS[pred.left]} = ${pred.right}`;
    case 'NEQ':
      return `${VAR_KEY_LABELS[pred.left]} ≠ ${pred.right}`;
    case 'GT':
      return `${VAR_KEY_LABELS[pred.left]} > ${pred.right}`;
    case 'GTE':
      return `${VAR_KEY_LABELS[pred.left]} ≥ ${pred.right}`;
    case 'LT':
      return `${VAR_KEY_LABELS[pred.left]} < ${pred.right}`;
    case 'LTE':
      return `${VAR_KEY_LABELS[pred.left]} ≤ ${pred.right}`;
    case 'IN':
      return `${VAR_KEY_LABELS[pred.left]} en [${pred.values.join(', ')}]`;
    case 'BETWEEN':
      return `${VAR_KEY_LABELS[pred.left]} entre ${pred.from} y ${pred.to}`;
    case 'AND':
      return pred.args.map(formatPred).join(' Y ');
    case 'OR':
      return pred.args.map(formatPred).join(' O ');
    case 'NOT':
      return `NO (${formatPred(pred.arg)})`;
  }
}

// Convierte los `inputs` de una TraceLine en un string legible ("40 × $2.00").
export function formatInputs(inputs: Record<string, string | number>): string {
  const keys = Object.keys(inputs);
  if (keys.length === 0) return '—';

  if (keys.length === 1 && keys[0] === 'amount') {
    return `$${inputs.amount}`;
  }
  if (keys.length === 2 && keys.includes('rate')) {
    const unitKey = keys.find((k) => k !== 'rate')!;
    return `${inputs[unitKey]} × $${inputs.rate}`;
  }
  if (keys.includes('pct') && keys.includes('base')) {
    const baseOf = String(inputs.base) as BaseRef['of'];
    return `${(Number(inputs.pct) * 100).toFixed(2)}% de ${BASE_REF_LABELS[baseOf] ?? inputs.base}`;
  }
  if (keys.includes('originZone') && keys.includes('destZone')) {
    return `${inputs.originZone} → ${inputs.destZone}`;
  }
  return keys.map((k) => `${k}: ${inputs[k]}`).join(', ');
}
