// Filas de Aurora <-> tipos del dominio de proformas. `numeric` llega como string: se pasa a número acá.

import type { Row } from '../data';
import type { SettlementStatus } from '../types';
import type {
  ApproverType, FlowPhaseTemplate, PhaseState, ProformaItem, ProformaPhase, ProformaRecord,
} from './types';

const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
};

export function rowToProforma(row: Row): ProformaRecord {
  return {
    id: String(row.id),
    countryId: String(row.country_id),
    number: String(row.number),
    carrierId: String(row.carrier_id),
    carrierName: String(row.carrier_name),
    status: row.status as SettlementStatus,
    currency: String(row.currency),
    totalAmount: Number(row.total_amount),
    createdBy: String(row.created_by),
    createdAt: iso(row.created_at) ?? '',
    emailSentAt: iso(row.email_sent_at),
  };
}

export function rowToItem(row: Row): ProformaItem {
  return {
    id: String(row.id),
    proformaId: String(row.proforma_id),
    settlementId: String(row.settlement_id),
    included: row.state !== 'excluded',
    exclusionReason: text(row.exclusion_reason),
    amount: Number(row.amount),
  };
}

export function rowToPhase(row: Row): ProformaPhase {
  return {
    id: String(row.id),
    proformaId: String(row.proforma_id),
    position: Number(row.position),
    name: String(row.name),
    approverType: row.approver_type as ApproverType,
    roleName: text(row.role_name),
    userId: text(row.user_id),
    approverLabel: String(row.approver_label),
    state: row.state as PhaseState,
    decidedBy: text(row.decided_by),
    decidedAt: iso(row.decided_at),
    comment: text(row.comment),
    removedBy: text(row.removed_by),
  };
}

export function rowToFlowPhase(row: Row): FlowPhaseTemplate {
  return {
    id: String(row.id),
    countryId: String(row.country_id),
    position: Number(row.position),
    name: String(row.name),
    approverType: row.approver_type as ApproverType,
    roleName: text(row.role_name),
    userId: text(row.user_id),
    approverLabel: String(row.approver_label),
    active: row.active === true,
  };
}

export function phaseToRow(phase: ProformaPhase): Row {
  return {
    id: phase.id,
    proforma_id: phase.proformaId,
    position: phase.position,
    name: phase.name,
    approver_type: phase.approverType,
    role_name: phase.roleName,
    user_id: phase.userId,
    approver_label: phase.approverLabel,
    state: phase.state,
    decided_by: phase.decidedBy,
    decided_at: phase.decidedAt,
    comment: phase.comment,
    removed_by: phase.removedBy,
  };
}

export function itemToRow(item: ProformaItem): Row {
  return {
    id: item.id,
    proforma_id: item.proformaId,
    settlement_id: item.settlementId,
    state: item.included ? 'included' : 'excluded',
    exclusion_reason: item.exclusionReason,
    amount: item.amount.toFixed(2),
  };
}

export function flowPhaseToRow(phase: FlowPhaseTemplate): Row {
  return {
    id: phase.id,
    country_id: phase.countryId,
    position: phase.position,
    name: phase.name,
    approver_type: phase.approverType,
    role_name: phase.roleName,
    user_id: phase.userId,
    approver_label: phase.approverLabel,
    active: phase.active,
  };
}
