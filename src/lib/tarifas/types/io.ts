// Entrada del motor (CalculateInput) y salida persistida (Proforma).

import type { TripContext } from './trip';
import type { Country } from './country';
import type { CalcResult } from './trace';
import type { Rule } from './ast';
import type { Zone, ZoneGroup, Location } from './geography';
import type { RateTable, RateTableRow, Override } from './rateTable';
import type { PartyVariable } from './variables';
import type { CostStructure, CostStructureRow, MarginPolicy } from './cost';
import type { CargoSummary } from './cargo';
import type { AllocationCriterion } from './cargo';
import type { Money } from './variables';

// ── Entrada de calculate() — todo lo que el kernel necesita, nada implícito ───────────────────

export interface CalculateInput {
  country: Country;
  trip: TripContext;
  rules: Rule[];
  zones: Zone[];
  zoneGroups: ZoneGroup[];
  locations: Location[];
  /** Tablas de tarifas disponibles para este viaje (las del país + las de su compañía). */
  rateTables?: RateTable[];
  rateTableRows?: RateTableRow[];
  /** Mercancía del viaje (pedidos de sus guías). Sin ella no hay margen de auditoría ni reparto por casa. */
  cargo?: CargoSummary | null;
  /** Criterio de reparto entre casas comerciales. Por defecto el valor de la mercancía. */
  allocationCriterion?: AllocationCriterion;
  /** Variables declaradas por la compañía del viaje. Sin esto, sus reglas propias no resuelven. */
  partyVariables?: PartyVariable[];
  /** Estructura de costos de la compañía del viaje. Si existe, manda sobre cualquier otra. */
  costStructure?: CostStructure | null;
  costStructureRows?: CostStructureRow[];
  /** Estructura por defecto del país: costo de la flota propia sin estructura propia. */
  defaultCostStructure?: CostStructure | null;
  defaultCostStructureRows?: CostStructureRow[];
  marginPolicy: MarginPolicy;
  overrides?: Record<string, Override>; // indexados por ruleCode
  adhocRules?: Rule[]; // reglas del viaje actual, no persistidas
}

// ── Proformas — viajes emitidos y persistidos ─────────────────────────────────────────────────

export type ProformaStatus = 'PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'LIQUIDADO';

/** Snapshot inmutable de un viaje emitido: `result` queda congelado al emitir y nunca se
 *  recalcula, aunque después cambien las reglas o los parámetros de costo. */
export interface Proforma {
  id: string;
  countryId: string;
  number: string; // secuencial legible, único por país: "VJ-0001"
  status: ProformaStatus;
  createdAt: string; // ISO 8601, igual a trip.quotedAt al momento de emitir
  trip: TripContext;
  overrides: Record<string, Override>;
  adhocRules: Rule[];
  result: CalcResult;
  reason?: string; // motivo capturado si la política de margen lo exigió
}

// ── Plantillas de viaje frecuente ──────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  countryId: string;
  name: string;
  trip: Omit<TripContext, 'quotedAt'>;
  overrides?: Record<string, Override>;
}
