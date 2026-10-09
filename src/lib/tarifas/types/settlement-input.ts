// Entrada para emitir liquidaciones y tipos de resultado.

import type { CalcIssue, CalcResult, SettlementBaseChange } from './trace';
import type { Rule } from './ast';
import type { Override } from './rateTable';
import type { SettlementOrder } from './cargo';
import type { TripEdits, TripRecord, SettlementStatus, SettlementReturn, SettlementRecord } from './settlement';
import type { TripContext } from './trip';

export interface SettlementInput {
  /** El viaje tal como se leyó al calcular. Se vuelve a leer al emitir para validarlo. */
  trip: TripRecord;
  /** Perfil de cálculo con el que se calculó. Null = transportista sin perfil. */
  partyId: string | null;
  /** Lo cargado a mano: variables PER_TRIP. */
  edits: TripEdits;
  status: SettlementStatus;
  notes: string | null;
  marginReason: string | null;
  /** El contexto con el que calculó el motor. */
  context: TripContext;
  calc: CalcResult;
  overrides?: Record<string, Override>;
  adhocRules?: Rule[];
  /** Reglas del catálogo que produjeron líneas: se guardan para poder explicar la liquidación después. */
  rulesUsed?: Rule[];
  /** Líneas que el liquidador destildó. */
  excludedSeqs?: number[];
  /** Quién cambió la base de cálculo y a qué. Solo si la cambió. */
  baseChange?: SettlementBaseChange | null;
  returns?: SettlementReturn[];
  /** Foto de los pedidos del viaje y qué se hizo con cada uno. */
  orders?: SettlementOrder[] | null;
  /** Total realmente emitido: puede diferir del que calculó el motor si se destildaron líneas. */
  totalAmount: string;
}

export type SettlementErrors = Partial<Record<keyof SettlementInput, string>>;

export type EmitSettlementResult =
  | { status: 'saved'; settlement: SettlementRecord }
  | { status: 'invalid'; errors: SettlementErrors }
  /** El motor (o el estado del viaje) dice que el total NO es confiable o no se puede emitir. */
  | { status: 'blocked'; issues: CalcIssue[] }
  | { status: 'failed'; error: { message: string } };
