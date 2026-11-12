// ¿Esta liquidación es típica o irregular? Una liquidación irregular trae algo fuera de la regla o algo de lo
// que hay que estar pendiente antes de aprobar (incidentes, devoluciones, notas, antes anulada, viene de un
// reclamo…). Sin señales = "todo en verde": quien revisa puede aprobar sin abrirla. Función pura.
//
// Los `warnings` del motor son texto libre sin código: se clasifican por patrón y, si ninguno calza, se
// cuentan como "avisos del cálculo".

import type { SettlementRecord } from '../types';

export interface IrregularFlag {
  code: string;
  label: string;
}

/** Datos que no viven en la liquidación: se consultan aparte (otras liquidaciones del viaje, reclamos…). */
export interface IrregularityExtras {
  /** El viaje tuvo otra liquidación anulada o reemplazada. */
  priorAnnulled?: boolean;
  /** Esta liquidación estuvo antes en una proforma de la que se excluyó o que se anuló. */
  priorExcluded?: boolean;
  /** La proforma actual tuvo un reclamo antes (rechazada por alguna fase). */
  proformaHadClaim?: boolean;
}

const INCIDENT_VAR = /incidenc|averi|sinies|merma|faltante|robo|accident/i;
const WARNING_PATTERNS: { pattern: RegExp; code: string; label: string }[] = [
  { pattern: /respaldo|fallback|sin fila|no hay fila|no existe/i, code: 'FALLBACK_RATE', label: 'Tarifa de respaldo: no se halló la tarifa exacta' },
  { pattern: /tom[óo] como 0|como 0|sin valor/i, code: 'VAR_AS_ZERO', label: 'Una variable sin valor se tomó como 0' },
  { pattern: /no cubren|fuera de (los )?tramos/i, code: 'TIERS_GAP', label: 'Los tramos no cubren el valor' },
  { pattern: /empate/i, code: 'RULE_TIE', label: 'Empate entre reglas o filas del tarifario' },
];

const nonZero = (value: unknown) => value !== null && value !== undefined && value !== '' && Number(value) !== 0;

export function detectIrregularities(s: SettlementRecord, extras: IrregularityExtras = {}): IrregularFlag[] {
  const flags: IrregularFlag[] = [];
  const add = (code: string, label: string) => flags.push({ code, label });

  if (s.fromClaimId) add('FROM_CLAIM', 'Viene de un reclamo: revisa que se aplicó lo indicado');
  if (extras.priorAnnulled || s.supersededBy) add('PRIOR_ANNULLED', 'Antes fue anulada o re-liquidada');
  if (extras.priorExcluded) add('PRIOR_EXCLUDED', 'Estuvo en otra proforma que se anuló o de la que se excluyó');
  if (extras.proformaHadClaim) add('PROFORMA_CLAIM', 'Su proforma ya tuvo un reclamo');

  if (s.cargoValue !== null && s.marginStatus === 'LOSS') add('MARGIN_LOSS', 'Margen negativo');
  else if (s.cargoValue !== null && s.marginStatus === 'CRITICAL') add('MARGIN_CRITICAL', 'Margen crítico');

  const orders = s.orders ?? [];
  const cut = orders.filter((o) => o.status === 'ANULADO' || o.status === 'DIFERIDO');
  if (cut.length > 0) add('ORDERS_CUT', `${cut.length} pedido(s) anulado(s) o diferido(s)`);
  const notDelivered = orders.filter((o) => o.status === 'INCLUIDO' && o.deliveryStatus && o.deliveryStatus !== 'delivered');
  if (notDelivered.length > 0) add('ORDERS_NOT_DELIVERED', `${notDelivered.length} pedido(s) incluido(s) sin entregar`);

  const trip = s.tripInfo;
  if (trip && trip.totalStops > 0 && trip.completedStops < trip.totalStops) add('PARTIAL_STOPS', 'Entrega parcial: paradas sin completar');
  else if (trip && trip.guideCount > 0 && trip.deliveredGuides < trip.guideCount) add('PARTIAL_GUIDES', 'Entrega parcial: guías sin entregar');

  if ((trip?.returnCount ?? 0) > 0 || (s.returns ?? []).length > 0) add('RETURNS', 'Tiene devoluciones');
  if (s.notes && s.notes.trim()) add('NOTES', 'Tiene notas o comentarios');

  const classified = new Set<string>();
  for (const w of s.warnings ?? []) {
    const hit = WARNING_PATTERNS.find((p) => p.pattern.test(w));
    if (hit) { if (!classified.has(hit.code)) add(hit.code, hit.label); classified.add(hit.code); } else classified.add('WARNING');
  }
  if (classified.has('WARNING')) add('WARNINGS', 'Avisos del cálculo');

  if (Object.keys(s.overrides ?? {}).length > 0) add('OVERRIDES', 'Montos corregidos a mano');
  if ((s.adhocRules ?? []).length > 0) add('ADHOC_RULES', 'Reglas puntuales de esta liquidación');
  if ((s.excludedSeqs ?? []).length > 0) add('EXCLUDED_LINES', 'Líneas del cálculo excluidas');
  if (s.baseChange) add('BASE_CHANGED', 'Base de cálculo cambiada por el liquidador');
  const expiry = s.baseChange?.contractExpiry;
  if (expiry && expiry < s.settlementDate) add('CONTRACT_EXPIRED', 'Contrato del transportista vencido a la fecha del viaje');

  const vars = Object.entries(s.tripEdits?.customVars ?? {}).filter(([, v]) => nonZero(v));
  const incidents = vars.filter(([k]) => INCIDENT_VAR.test(k));
  if (incidents.length > 0) add('INCIDENTS', 'Pago por incidentes, averiados o mermas');
  if (vars.length > incidents.length) add('EXTRAS', 'Recargos o extras cargados a mano');

  if ((s.discarded ?? []).some((d) => d.reason === 'RULE_BROKEN' || d.reason === 'OUT_OF_PERIOD')) {
    add('RULES_DISCARDED', 'Reglas descartadas por estar rotas o fuera de vigencia');
  }
  if (!s.partyId) add('NO_PARTY', 'Transportista sin perfil de cálculo');
  return flags;
}
