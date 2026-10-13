import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type { CostStructure, CostStructureRow } from '../../../lib/tarifas/types';

/** Lo que comparten los hooks de acciones del modal de estructura de costos. */
export interface StructureCtx {
  party: CarrierProfile | null;
  partyId: string | null;
  setPartyId: (id: string) => void;
  structure: CostStructure | null;
  inherited: { structure: CostStructure; rows: CostStructureRow[] } | null;
  meta: { name: string; operatingDaysPerMonth: number };
  setError: (message: string) => void;
  load: () => Promise<void>;
  onProfileCreated?: () => void;
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
