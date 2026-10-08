// Tipos de entrada y resultado para operaciones de estructura de costos.

import type { CostDriver, CostFrequency, CostGroup, CostStructure, CostStructureParams, Pred } from '../types';

export interface CostStructureInput {
  /** Compañía dueña. Null = estructura por defecto del país. */
  partyId: string | null;
  countryId: string;
  name: string;
  operatingDaysPerMonth: number;
  params?: CostStructureParams;
  effectiveFrom: string | null;
  active: boolean;
  notes: string | null;
}

export interface CostRowInput {
  code: string;
  label: string;
  driver: CostDriver;
  amount: string;
  sign: 'ADD' | 'SUBTRACT';
  appliesWhen: Pred | null;
  unit: string | null;
  active: boolean;
  group?: CostGroup | null;
  frequency?: CostFrequency | null;
  frequencyQty?: number | null;
  unitQty?: number | null;
  costPerKm?: string | null;
  truckType?: string | null;
}

export type StructureErrors = Partial<Record<keyof CostStructureInput, string>>;

export type SaveStructureResult =
  | { status: 'saved'; structure: CostStructure }
  | { status: 'invalid'; errors: StructureErrors }
  | { status: 'failed'; error: { message: string } };

export interface ApplyTemplateInput {
  /** Compañía dueña. Null = estructura por defecto del país. */
  partyId: string | null;
  countryId: string;
  name: string;
  operatingDaysPerMonth: number;
  params: CostStructureParams;
  rows: CostRowInput[];
}

export type ApplyTemplateResult =
  | { status: 'saved'; structureId: string; inserted: number }
  | { status: 'failed'; error: { message: string } };

export interface ImportOutcome {
  error: string | null;
  inserted: number;
}

export const EMPTY_PARAMS: CostStructureParams = { kmPerYear: null, fuelPrice: null, fuelEfficiency: {} };
