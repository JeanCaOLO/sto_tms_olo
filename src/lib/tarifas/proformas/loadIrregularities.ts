// Calcula las alertas de irregularidad de varias proformas a la vez. Una proforma es irregular si alguna de sus
// liquidaciones incluidas lo es. Trae solo lo necesario de las proformas visibles: las liquidaciones completas
// (con sus jsonb) y, en una consulta cada una, las otras anuladas del viaje, las exclusiones previas y los reclamos.

import { db } from '../data';
import { mapToDomain } from '../settlements/mapToDomain';
import type { SettlementRecord } from '../types';
import { proformaIdsWithClaims } from './claims';
import { rowToItem } from './mapRows';
import { detectIrregularities, type IrregularFlag } from './irregularity';

export interface SettlementAlerts {
  settlement: SettlementRecord;
  flags: IrregularFlag[];
}

export interface ProformaAlerts {
  /** Alertas por liquidación incluida de la proforma. */
  settlements: SettlementAlerts[];
  /** Cantidad de liquidaciones con al menos una alerta. */
  irregularCount: number;
}

/** Proformas por consulta: cada liquidación trae sus jsonb (trace, reglas…), así que se lee de a poco. */
export const ALERTS_CHUNK = 25;
/** Tope por pantalla: más allá, las proformas se abren una por una (el detalle sí calcula las suyas). */
export const ALERTS_MAX = 150;

export async function loadIrregularities(proformaIds: string[]): Promise<Map<string, ProformaAlerts>> {
  const result = new Map<string, ProformaAlerts>();
  // En serie y por tandas: una cola larga no dispara decenas de lecturas pesadas a la vez contra la base.
  const ids = proformaIds.slice(0, ALERTS_MAX);
  for (let i = 0; i < ids.length; i += ALERTS_CHUNK) {
    for (const [id, alerts] of await loadChunk(ids.slice(i, i + ALERTS_CHUNK))) result.set(id, alerts);
  }
  return result;
}

async function loadChunk(proformaIds: string[]): Promise<Map<string, ProformaAlerts>> {
  const result = new Map<string, ProformaAlerts>();
  if (proformaIds.length === 0) return result;

  const allItems = (await db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'in', value: proformaIds }] })).map(rowToItem);
  const included = allItems.filter((i) => i.included);
  const settlementIds = [...new Set(included.map((i) => i.settlementId))];
  if (settlementIds.length === 0) return result;

  const [settlementRows, claimed, priorItems] = await Promise.all([
    db().find('settlement', { where: [{ column: 'id', op: 'in', value: settlementIds }] }),
    proformaIdsWithClaims(proformaIds),
    db().find('proformaItem', {
      where: [{ column: 'settlement_id', op: 'in', value: settlementIds }, { column: 'state', op: 'eq', value: 'excluded' }],
      columns: ['settlement_id'],
    }),
  ]);
  const settlements = settlementRows.map(mapToDomain);
  const tripIds = [...new Set(settlements.map((s) => s.tripId))];
  const annulled = tripIds.length === 0 ? [] : await db().find('settlement', {
    where: [{ column: 'trip_id', op: 'in', value: tripIds }, { column: 'status', op: 'eq', value: 'Anulado' }],
    columns: ['id', 'trip_id'],
  });
  const priorAnnulledTrips = new Set(annulled.map((r) => String(r.trip_id)));
  const priorExcluded = new Set(priorItems.map((r) => String(r.settlement_id)));
  const byId = new Map(settlements.map((s) => [s.id, s]));

  for (const proformaId of proformaIds) {
    const own = included.filter((i) => i.proformaId === proformaId);
    const entries = own.flatMap((item) => {
      const settlement = byId.get(item.settlementId);
      if (!settlement) return [];
      const flags = detectIrregularities(settlement, {
        priorAnnulled: priorAnnulledTrips.has(settlement.tripId),
        priorExcluded: priorExcluded.has(settlement.id),
        proformaHadClaim: claimed.has(proformaId),
      });
      return [{ settlement, flags }];
    });
    result.set(proformaId, { settlements: entries, irregularCount: entries.filter((e) => e.flags.length > 0).length });
  }
  return result;
}
