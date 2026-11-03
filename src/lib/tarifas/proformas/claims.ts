// Reclamos de proforma: una fase rechazó la proforma. El liquidador decide si reinicia la liquidación o apela.
// Los cambios de estado de un reclamo los hace el servidor con la decisión de la proforma (ver proformas_api.py).

import { db, type Row } from '../data';
import { rangeToIso, type DateRange } from './dateRange';
import { rowToPhase, rowToProforma } from './mapRows';
import type { ProformaWithPhases } from './proformaQueries';

/** abierto = espera al liquidador; apelado = espera de nuevo a la fase; los demás ya se cerraron. */
export type ClaimStatus = 'abierto' | 'apelado' | 'aceptado' | 'rechazado' | 'reiniciado';

export interface ProformaClaim {
  id: string;
  proformaId: string;
  phaseId: string;
  phaseName: string;
  raisedBy: string;
  raisedRole: string | null;
  reason: string;
  status: ClaimStatus;
  appealReason: string | null;
  appealedBy: string | null;
  appealedAt: string | null;
  createdAt: string;
}

/** Tope de reclamos por consulta: "Todo" no puede traer un historial sin límite. */
export const CLAIMS_LIMIT = 300;

export interface ClaimRow extends ProformaWithPhases {
  claim: ProformaClaim;
}

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function rowToClaim(row: Row): ProformaClaim {
  return {
    id: String(row.id),
    proformaId: String(row.proforma_id),
    phaseId: String(row.phase_id),
    phaseName: String(row.phase_name),
    raisedBy: String(row.raised_by),
    raisedRole: text(row.raised_role),
    reason: String(row.reason),
    status: row.status as ClaimStatus,
    appealReason: text(row.appeal_reason),
    appealedBy: text(row.appealed_by),
    appealedAt: text(row.appealed_at),
    createdAt: text(row.created_at) ?? '',
  };
}

/** Reclamos vigentes (abiertos o apelados) del país, con su proforma y fases, filtrados por fecha del reclamo. */
export async function listClaimRows(countryId: string, range?: DateRange): Promise<ClaimRow[]> {
  const { from, to } = range ? rangeToIso(range) : { from: null, to: null };
  const claims = (await db().find('proformaClaim', {
    where: [
      { column: 'country_id', op: 'eq', value: countryId },
      { column: 'status', op: 'in', value: ['abierto', 'apelado'] },
      ...(from ? [{ column: 'created_at', op: 'gte' as const, value: from }] : []),
      ...(to ? [{ column: 'created_at', op: 'lte' as const, value: to }] : []),
    ],
    orderBy: [{ column: 'created_at', direction: 'desc' }],
    limit: CLAIMS_LIMIT,
  })).map(rowToClaim);
  if (claims.length === 0) return [];
  const ids = [...new Set(claims.map((c) => c.proformaId))];
  const [proformaRows, phaseRows] = await Promise.all([
    db().find('proforma', { where: [{ column: 'id', op: 'in', value: ids }] }),
    db().find('proformaPhase', { where: [{ column: 'proforma_id', op: 'in', value: ids }], orderBy: [{ column: 'position', direction: 'asc' }] }),
  ]);
  const proformas = new Map(proformaRows.map(rowToProforma).map((p) => [p.id, p]));
  const phases = phaseRows.map(rowToPhase);
  return claims.flatMap((claim) => {
    const proforma = proformas.get(claim.proformaId);
    return proforma ? [{ claim, proforma, phases: phases.filter((p) => p.proformaId === claim.proformaId) }] : [];
  });
}

/** Ids de proformas que tuvieron algún reclamo (cualquier estado): marca de "ya fue reclamada". */
export async function proformaIdsWithClaims(proformaIds: string[]): Promise<Set<string>> {
  if (proformaIds.length === 0) return new Set();
  const rows = await db().find('proformaClaim', {
    where: [{ column: 'proforma_id', op: 'in', value: proformaIds }],
    columns: ['proforma_id'],
  });
  return new Set(rows.map((r) => String(r.proforma_id)));
}
