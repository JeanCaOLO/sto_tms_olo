// Base de cálculo de un TERCERO según el catálogo de Transportistas (`carriers.rate_type`, sql/35) y, con
// TENDERING, la adjudicación del viaje. Separado de `partiesDataSource` (perfiles) solo por tamaño.

import { contractOfCarrier, type CarrierContract } from './carrierContract';
import { db, onDataWrite } from './data';
import type { BaseMethodId, BaseOverride } from './types';

// Formas de pago calculables como base. TENDERING no es una fórmula: se calcula con el monto que se
// le adjudicó al viaje (`tarifas_trip_tender_awards`), y sin adjudicación bloquea con motivo.
const CALCULABLE_RATE_TYPES = new Set<BaseMethodId>(['PER_KM', 'PER_UNIT', 'FIXED', 'VOLUME']);

/** Base del catálogo para un tercero: la que se aplica o el motivo por el que no hay ninguna. */
export type CarrierBase = { override: BaseOverride; contract?: CarrierContract } | { issue: string };

/**
 * Convierte el `carriers.rate_type` crudo en la base a aplicar a un TERCERO. No hay default: sin
 * forma de cobro, con TENDERING sin adjudicación o con tarifa fija sin monto válido devuelve el
 * motivo (el cálculo se bloquea en vez de caer a km). Puro y testeable sin tocar la BD.
 *
 * `tenderAmount` es el monto adjudicado al viaje (solo se mira con TENDERING): se liquida como tarifa
 * fija, con origen 'TENDER'. `undefined`/`null`/'' = el viaje no tiene adjudicación.
 */
export function resolveCarrierBase(rateType: unknown, flatRateAmount?: unknown, tenderAmount?: unknown): CarrierBase {
  const enCatalogo = ' en el catálogo de Transportistas.';
  const type = typeof rateType === 'string' ? rateType.trim() : '';
  if (type === '') return { issue: `El transportista no tiene forma de cobro. Definila${enCatalogo}` };
  if (type === 'TENDERING') {
    const award = tenderAmount != null ? String(tenderAmount).trim() : '';
    if (award === '') return { issue: 'La forma de cobro es "Tendering" pero el viaje no tiene un monto adjudicado. Registrá la adjudicación del viaje.' };
    if (!(Number(award) >= 0)) return { issue: 'El monto adjudicado por tendering no es válido. Corregilo en la adjudicación del viaje.' };
    return { override: { method: 'FIXED', amount: award, origin: 'TENDER' } };
  }
  if (!CALCULABLE_RATE_TYPES.has(type as BaseMethodId)) return { issue: `La forma de cobro "${type}" no es válida. Corregila${enCatalogo}` };
  const method = type as BaseMethodId;
  // Tarifa fija: el monto pactado (carriers.flat_rate_amount, sql/36) ES la base. Sin monto, la base
  // sale de la regla BASE fija del tercero (sql/37). Un monto ilegible o negativo es un error de carga.
  const raw = method === 'FIXED' && flatRateAmount != null ? String(flatRateAmount).trim() : '';
  if (raw === '') return { override: { method } };
  if (!(Number(raw) >= 0)) return { issue: `El monto de tarifa fija no es válido. Corregilo${enCatalogo}` };
  return { override: { method, amount: raw } };
}

/** Adjudicación de tendering de un viaje (`tarifas_trip_tender_awards`), o null si no tiene. Sin caché: es una fila por viaje. */
export async function getTenderAwardForTrip(tripId: string): Promise<{ carrierId: string; amount: string } | null> {
  const [row] = await db().find('tripTenderAward', {
    where: [{ column: 'trip_id', op: 'eq', value: tripId }],
    limit: 1,
  });
  return row ? { carrierId: String(row.carrier_id), amount: String(row.amount) } : null;
}

/**
 * Base de un tercero según el catálogo (`carriers.rate_type`, sql/35). `tripId` hace falta para
 * TENDERING: el monto sale de la adjudicación de ESE viaje, y solo vale si se la adjudicaron a este transportista.
 */
export async function carrierBaseForCarrier(
  carrierId: string,
  options: { fresh?: boolean; tripId?: string } = {},
): Promise<CarrierBase> {
  const carrier = await getCarrierCached(carrierId, options);
  if (!carrier) return { issue: 'No se encontró el transportista del viaje para leer su forma de cobro.' };
  let tenderAmount: string | null = null;
  if (carrier.rate_type === 'TENDERING' && options.tripId) {
    const award = await getTenderAwardForTrip(options.tripId);
    if (award && award.carrierId !== carrierId) {
      return { issue: 'La adjudicación de tendering de este viaje es de otro transportista. Corregila antes de liquidar.' };
    }
    tenderAmount = award?.amount ?? null;
  }
  const base = resolveCarrierBase(carrier.rate_type, carrier.flat_rate_amount, tenderAmount);
  return 'override' in base ? { ...base, contract: contractOfCarrier(carrier) } : base;
}

// Caché corta del transportista (como el perfil); se descarta al escribir un carrier.
const CARRIER_TTL_MS = 5 * 60_000;
const carrierCache = new Map<string, { at: number; promise: Promise<Record<string, unknown> | null> }>();
onDataWrite((touched) => { if (touched.has('carrier')) carrierCache.clear(); });

async function getCarrierCached(
  carrierId: string,
  options: { fresh?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  const read = () => db().findOne('carrier', carrierId) as Promise<Record<string, unknown> | null>;
  if (db().kind !== 'http') return read();
  const hit = carrierCache.get(carrierId);
  if (!options.fresh && hit && Date.now() - hit.at < CARRIER_TTL_MS) return hit.promise;
  const entry = { at: Date.now(), promise: read() };
  carrierCache.set(carrierId, entry);
  entry.promise.catch(() => { if (carrierCache.get(carrierId) === entry) carrierCache.delete(carrierId); });
  return entry.promise;
}
