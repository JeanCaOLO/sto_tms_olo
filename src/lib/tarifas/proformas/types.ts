// Proformas: agrupación por transportista de varias liquidaciones, con revisión por fases.
// El estado de la proforma reutiliza los de la liquidación (no hay un catálogo de estados aparte).

import type { SettlementStatus } from '../types';

/** Estado de una fase dentro del snapshot de la proforma. */
export type PhaseState = 'pendiente' | 'aprobada' | 'omitida' | 'rechazada';

/** Quién puede aprobar una fase: un usuario concreto, o cualquiera que tenga el rol. */
export type ApproverType = 'role' | 'user';

/** Fase de la plantilla del país (editable en la configuración). */
export interface FlowPhaseTemplate {
  id: string;
  countryId: string;
  position: number;
  name: string;
  approverType: ApproverType;
  roleName: string | null;
  userId: string | null;
  /** Etiqueta legible del aprobador (nombre del rol o del usuario), para mostrar sin otra consulta. */
  approverLabel: string;
  active: boolean;
}

/** Fase de una proforma concreta: copia de la plantilla al crearla, más su decisión. */
export interface ProformaPhase {
  id: string;
  proformaId: string;
  position: number;
  name: string;
  approverType: ApproverType;
  roleName: string | null;
  userId: string | null;
  approverLabel: string;
  state: PhaseState;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
  /** Usuario (superadministrador) que quitó la fase de esta proforma. */
  removedBy: string | null;
}

/** Quien intenta decidir una fase. */
export interface PhaseActor {
  userId: string;
  userName: string;
  roleName: string;
}

export interface ProformaItem {
  id: string;
  proformaId: string;
  settlementId: string;
  included: boolean;
  exclusionReason: string | null;
  /** Total de la liquidación al agrupar (congelado: sirve para sumar sin releer cada liquidación). */
  amount: number;
}

export interface ProformaRecord {
  id: string;
  countryId: string;
  number: string;
  carrierId: string;
  carrierName: string;
  status: SettlementStatus;
  currency: string;
  totalAmount: number;
  createdBy: string;
  createdAt: string;
  emailSentAt: string | null;
}

/** Resultado de una decisión sobre las fases: las fases nuevas y el estado resultante de la proforma. */
export interface PhaseDecision {
  phases: ProformaPhase[];
  status: SettlementStatus;
}
