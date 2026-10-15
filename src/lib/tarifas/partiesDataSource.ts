// Compañías a liquidar: transportistas del catálogo (solo lectura) + perfiles de cálculo.
//
// Misma forma de retorno que el resto del módulo para que las pantallas manejen los fallos igual.
// Todo por la capa de datos (`./data`): los transportistas se leen como entidad externa.

import { db, ForeignKeyError, NotFoundError, onDataWrite, UniqueViolationError, type Condition } from './data';
import {
  mergeCarriersWithProfiles,
  type CarrierProfile,
  type PartyClassification,
  type SettlementPartyRow,
} from './parties';
import type { BaseMethodId, BaseOverride } from './types';

export type EnsureProfileResult =
  | { status: 'saved'; partyId: string; created: boolean }
  | { status: 'failed'; error: { message: string } };

export type DeleteResult = { error: { message: string } | null };

function message(error: unknown): string {
  if (error instanceof ForeignKeyError || error instanceof NotFoundError || error instanceof UniqueViolationError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Transportistas del catálogo con su perfil de cálculo (si lo tienen).
 *
 * `includeInactive` incluye los dados de baja en el catálogo y los perfiles desactivados; por
 * defecto solo se listan los activos en ambos lados (un transportista sin perfil cuenta como activo).
 */
export async function listCarrierProfiles(options?: {
  classification?: PartyClassification;
  countryId?: string;
  includeInactive?: boolean;
}): Promise<CarrierProfile[]> {
  const where: Condition[] = [];
  if (options?.classification) {
    where.push({ column: 'is_flota_propia', op: 'eq', value: options.classification === 'OWN' });
  }
  if (options?.countryId) where.push({ column: 'country_id', op: 'eq', value: options.countryId });

  const [carriers, profiles] = await Promise.all([
    db().find('carrier', { where, orderBy: [{ column: 'name', locale: true }] }),
    db().find('settlementParty'),
  ]);

  const all = mergeCarriersWithProfiles(carriers, profiles);
  if (options?.includeInactive) return all;
  return all.filter(
    (c) => (c.carrierStatus ?? 'active') !== 'inactive' && c.profileStatus !== 'inactive',
  );
}

export async function getParty(id: string): Promise<SettlementPartyRow | null> {
  return (await db().findOne('settlementParty', id)) as SettlementPartyRow | null;
}

/** Perfil de cálculo de un transportista, o null si no tiene. */
export async function getProfileForCarrier(carrierId: string): Promise<SettlementPartyRow | null> {
  const [row] = await db().find('settlementParty', {
    where: [{ column: 'carrier_id', op: 'eq', value: carrierId }],
    limit: 1,
  });
  return (row as SettlementPartyRow | undefined) ?? null;
}

// El perfil de un transportista casi no cambia y cada recálculo de una liquidación lo pedía de nuevo
// (una ida y vuelta de más). Mismo criterio que el catálogo: unos segundos de caché, descartada al
// instante cuando esta sesión escribe un perfil y por tiempo para lo que cambie otra persona.
const PROFILE_TTL_MS = 5 * 60_000;
const profileCache = new Map<string, { at: number; promise: Promise<SettlementPartyRow | null> }>();

onDataWrite((touched) => {
  if (touched.has('settlementParty') || touched.has('carrier')) profileCache.clear();
});

/** Como `getProfileForCarrier`, pero con la caché de arriba. Solo contra la API (con el driver JSON leer es gratis). */
export async function getProfileForCarrierCached(
  carrierId: string,
  options: { fresh?: boolean } = {},
): Promise<SettlementPartyRow | null> {
  if (db().kind !== 'http') return getProfileForCarrier(carrierId);
  const hit = profileCache.get(carrierId);
  if (!options.fresh && hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.promise;
  const entry = { at: Date.now(), promise: getProfileForCarrier(carrierId) };
  profileCache.set(carrierId, entry);
  entry.promise.catch(() => { if (profileCache.get(carrierId) === entry) profileCache.delete(carrierId); });
  return entry.promise;
}

// Formas de pago calculables como base (TENDERING aún no tiene cálculo: bloquea con motivo).
const CALCULABLE_RATE_TYPES = new Set<BaseMethodId>(['PER_KM', 'PER_UNIT', 'FIXED', 'VOLUME']);

/** Base del catálogo para un tercero: la que se aplica o el motivo por el que no hay ninguna. */
export type CarrierBase = { override: BaseOverride } | { issue: string };

/**
 * Convierte el `carriers.rate_type` crudo en la base a aplicar a un TERCERO. No hay default: sin
 * forma de cobro, con TENDERING o con tarifa fija sin monto válido devuelve el motivo (el cálculo
 * se bloquea en vez de caer a km). Puro y testeable sin tocar la BD.
 */
export function resolveCarrierBase(rateType: unknown, flatRateAmount?: unknown): CarrierBase {
  const enCatalogo = ' en el catálogo de Transportistas.';
  const type = typeof rateType === 'string' ? rateType.trim() : '';
  if (type === '') return { issue: `El transportista no tiene forma de cobro. Definila${enCatalogo}` };
  if (type === 'TENDERING') return { issue: `La forma de cobro "Tendering" todavía no tiene cálculo. Elegí otra${enCatalogo}` };
  if (!CALCULABLE_RATE_TYPES.has(type as BaseMethodId)) return { issue: `La forma de cobro "${type}" no es válida. Corregila${enCatalogo}` };
  const method = type as BaseMethodId;
  // Tarifa fija: el monto pactado (carriers.flat_rate_amount, sql/36) ES la base. Sin monto, la base
  // sale de la regla BASE fija del tercero (sql/37). Un monto ilegible o negativo es un error de carga.
  const raw = method === 'FIXED' && flatRateAmount != null ? String(flatRateAmount).trim() : '';
  if (raw === '') return { override: { method } };
  if (!(Number(raw) >= 0)) return { issue: `El monto de tarifa fija no es válido. Corregilo${enCatalogo}` };
  return { override: { method, amount: raw } };
}

/** Base de un tercero según el catálogo (`carriers.rate_type`, sql/35). */
export async function carrierBaseForCarrier(
  carrierId: string,
  options: { fresh?: boolean } = {},
): Promise<CarrierBase> {
  const carrier = await getCarrierCached(carrierId, options);
  if (!carrier) return { issue: 'No se encontró el transportista del viaje para leer su forma de cobro.' };
  return resolveCarrierBase(carrier.rate_type, carrier.flat_rate_amount);
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

/**
 * Devuelve el perfil del transportista, creándolo si todavía no existe. Es lo que llama una
 * pantalla antes de guardar la primera variable, estructura de costos o tarifario del transportista.
 *
 * Idempotente: dos llamadas seguidas devuelven el mismo perfil (y el índice único de `carrier_id`
 * impide que una carrera cree dos).
 */
export async function ensurePartyProfile(carrierId: string): Promise<EnsureProfileResult> {
  try {
    const existing = await getProfileForCarrier(carrierId);
    if (existing) return { status: 'saved', partyId: existing.id, created: false };

    const carrier = await db().findOne('carrier', carrierId);
    if (!carrier) {
      return { status: 'failed', error: { message: 'El transportista no existe en el catálogo.' } };
    }

    const created = await db().insert('settlementParty', {
      carrier_id: carrierId,
      status: 'active',
      notes: null,
    });
    return { status: 'saved', partyId: String(created.id), created: true };
  } catch (error) {
    // Otra pestaña lo creó en el medio: se devuelve ese.
    if (error instanceof UniqueViolationError) {
      const again = await getProfileForCarrier(carrierId);
      if (again) return { status: 'saved', partyId: again.id, created: false };
    }
    return { status: 'failed', error: { message: message(error) } };
  }
}

/**
 * Deshace un perfil recién creado por `ensurePartyProfile` cuando lo que lo motivó no se pudo guardar
 * (T3): sin esto la compañía quedaba «Configurada» sin nada configurado. Solo borra el perfil si está vacío:
 * una clave foránea que lo use hace fallar el borrado y el perfil se conserva. Nunca lanza.
 */
export async function discardNewParty(partyId: string): Promise<void> {
  try {
    await db().delete('settlementParty', partyId);
  } catch (error) {
    console.error('No se pudo deshacer el perfil recién creado:', error);
  }
}

/**
 * Baja LÓGICA del perfil. Puede estar referenciado por tarifas de outsourcing, reglas y
 * liquidaciones ya emitidas: borrarlo rompería el histórico, que es inmutable por definición.
 */
export async function deactivateParty(id: string): Promise<DeleteResult> {
  try {
    await db().update('settlementParty', id, { status: 'inactive' });
    return { error: null };
  } catch (error) {
    return { error: { message: message(error) } };
  }
}

export async function reactivateParty(id: string): Promise<DeleteResult> {
  try {
    await db().update('settlementParty', id, { status: 'active' });
    return { error: null };
  } catch (error) {
    return { error: { message: message(error) } };
  }
}
