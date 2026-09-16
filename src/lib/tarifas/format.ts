// Formateo de presentación. El kernel emite Money (string decimal exacto) y fracciones sin decidir
// cómo se ven en pantalla — eso es trabajo de la UI, no del motor de cálculo.
// Puerto casi literal de prototipoTarifador/src/ui/format.ts (mismo vocabulario Pred/VarKey).

import type { BaseRef, BuiltinVarKey, DiscardReason, Stage, VarKey } from './types';
import type { Pred } from './types';

/**
 * Símbolo de cada moneda que el módulo maneja hoy. Antes esto era un `if (currency === 'USD')` y
 * todo lo demás quedaba como "1710000 COP" — pero además, y peor, `formatInputs` anteponía `$` a
 * CUALQUIER importe, así que un tarifario en colones se mostraba con signo de dólar.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  COP: '$',
  CRC: '₡',
};

export function formatMoney(amount: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
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

// Solo las variables del sistema. Las personalizadas de cada compañía llevan su propia etiqueta y
// se resuelven con `varLabel`.
export const VAR_KEY_LABELS: Record<BuiltinVarKey, string> = {
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
  tollsAmount: 'Monto de peajes',
  tollCount: 'Cantidad de peajes',
  pickupCount: 'Recolectas',
  truckVolumeM3: 'Volumen del camión (m³)',
  truckWeightTons: 'Capacidad del camión (t)',
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
  OVERRIDDEN_BY_PARTY: 'Sobrescrita por la compañía',
  OUT_OF_PERIOD: 'Fuera de vigencia',
  RULE_BROKEN: 'Regla ilegible',
};

/**
 * Nombre en pantalla de cualquier variable. Para una personalizada usa la etiqueta que le puso la
 * compañía y, si ya no está declarada, muestra su clave cruda en vez de romper — una regla vieja
 * que apunta a una variable borrada tiene que seguir siendo legible para poder arreglarla.
 */
export function varLabel(key: VarKey, customLabels: Record<string, string> = {}): string {
  if (key.startsWith('custom:')) {
    return customLabels[key] ?? key.replace(/^custom:/, '');
  }
  return VAR_KEY_LABELS[key as BuiltinVarKey] ?? key;
}

// Convierte un Pred en un string legible ("Zona de origen = CCS Y Zona de destino = CAR").
export function formatPred(pred: Pred, customLabels: Record<string, string> = {}): string {
  switch (pred.p) {
    case 'ALWAYS':
      return 'Siempre';
    case 'EQ':
      return `${varLabel(pred.left, customLabels)} = ${pred.right}`;
    case 'NEQ':
      return `${varLabel(pred.left, customLabels)} ≠ ${pred.right}`;
    case 'GT':
      return `${varLabel(pred.left, customLabels)} > ${pred.right}`;
    case 'GTE':
      return `${varLabel(pred.left, customLabels)} ≥ ${pred.right}`;
    case 'LT':
      return `${varLabel(pred.left, customLabels)} < ${pred.right}`;
    case 'LTE':
      return `${varLabel(pred.left, customLabels)} ≤ ${pred.right}`;
    case 'IN':
      return `${varLabel(pred.left, customLabels)} en [${pred.values.join(', ')}]`;
    case 'BETWEEN':
      return `${varLabel(pred.left, customLabels)} entre ${pred.from} y ${pred.to}`;
    case 'AND':
      return pred.args.map((p) => formatPred(p, customLabels)).join(' Y ');
    case 'OR':
      return pred.args.map((p) => formatPred(p, customLabels)).join(' O ');
    case 'NOT':
      return `NO (${formatPred(pred.arg, customLabels)})`;
  }
}

// Convierte los `inputs` de una TraceLine en un string legible ("40 × 2.00").
export function formatInputs(inputs: Record<string, string | number>): string {
  const keys = Object.keys(inputs);
  if (keys.length === 0) return '—';

  // Sin símbolo de moneda: esta cadena se muestra al lado de la columna de importes, que ya la
  // lleva. Anteponer `$` acá mostraba pesos y colones como si fueran dólares.
  if (keys.length === 1 && keys[0] === 'amount') {
    return String(inputs.amount);
  }
  if (keys.length === 2 && keys.includes('rate')) {
    const unitKey = keys.find((k) => k !== 'rate')!;
    return `${inputs[unitKey]} × ${inputs.rate}`;
  }
  if (keys.includes('pct') && keys.includes('base')) {
    const baseOf = String(inputs.base) as BaseRef['of'];
    return `${(Number(inputs.pct) * 100).toFixed(2)}% de ${BASE_REF_LABELS[baseOf] ?? inputs.base}`;
  }
  if (keys.includes('cada') && keys.includes('amount')) {
    const unitKey = keys.find((k) => k !== 'cada' && k !== 'amount')!;
    return `${inputs[unitKey]} → cada ${inputs.cada}: ${inputs.amount}`;
  }
  if (keys.includes('originZone') && keys.includes('destZone')) {
    return `${inputs.originZone} → ${inputs.destZone}`;
  }
  return keys.map((k) => `${k}: ${inputs[k]}`).join(', ');
}
