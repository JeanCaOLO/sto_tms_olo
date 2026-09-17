// Acceso a datos de las compañías a liquidar. Misma forma de retorno que el resto del módulo
// (`{ error }`) para que las pantallas manejen los fallos igual que en Reglas de Tarifa.
//
// Va por la capa de datos (`./data`), así que el día que haya Postgres viaja con el resto sin
// cambios acá.

import { db, ForeignKeyError, NotFoundError, type Row } from './data';
import {
  normalizeParty,
  validateParty,
  isValid,
  type PartyClassification,
  type PartyErrors,
  type SettlementPartyInput,
  type SettlementPartyRow,
} from './parties';

// El discriminante es un STRING a propósito. Este proyecto compila con `strictNullChecks: false`,
// y en ese modo TypeScript no estrecha uniones ni por `error === null` ni por un discriminante
// booleano (`ok: true | false`) — verificado: solo el literal de string funciona. Con `status` el
// compilador sí garantiza que `fieldErrors` exista donde se lee.
export type SaveResult =
  | { status: 'saved'; party: SettlementPartyRow }
  | { status: 'invalid'; error: { message: string }; fieldErrors: PartyErrors }
  | { status: 'failed'; error: { message: string } };

export type DeleteResult = { error: { message: string } | null };

function message(error: unknown): string {
  if (error instanceof ForeignKeyError || error instanceof NotFoundError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export async function listParties(options?: {
  classification?: PartyClassification;
  countryId?: string;
  includeInactive?: boolean;
}): Promise<SettlementPartyRow[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [];
  if (options?.classification) where.push({ column: 'classification', op: 'eq', value: options.classification });
  if (options?.countryId) where.push({ column: 'country_id', op: 'eq', value: options.countryId });
  if (!options?.includeInactive) where.push({ column: 'status', op: 'eq', value: 'active' });

  const rows = await db().find('settlementParty', {
    where,
    orderBy: [{ column: 'name', locale: true }],
  });
  return rows as SettlementPartyRow[];
}

export async function getParty(id: string): Promise<SettlementPartyRow | null> {
  return (await db().findOne('settlementParty', id)) as SettlementPartyRow | null;
}

export async function saveParty(input: SettlementPartyInput, id?: string): Promise<SaveResult> {
  // Se valida contra TODAS las compañías, activas e inactivas: un código o un enlace al TMS
  // reutilizado choca igual aunque la otra esté dada de baja.
  const existing = (await db().find('settlementParty')) as SettlementPartyRow[];
  const party = normalizeParty({ ...input, id });

  const fieldErrors = validateParty(party, { existing });
  if (!isValid(fieldErrors)) {
    return { status: 'invalid', error: { message: 'Revisá los campos marcados.' }, fieldErrors };
  }

  try {
    const { id: _ignored, ...values } = party;
    const saved = id
      ? await db().update('settlementParty', id, values as Row)
      : await db().insert('settlementParty', values as Row);
    return { status: 'saved', party: saved as SettlementPartyRow };
  } catch (error) {
    return { status: 'failed', error: { message: message(error) } };
  }
}

/**
 * Baja LÓGICA. Una compañía puede estar referenciada por tarifas de outsourcing, por reglas y por
 * liquidaciones ya emitidas: borrarla de verdad rompería el histórico, que es inmutable por
 * definición. Desactivarla la saca de los selectores sin tocar nada de lo ya liquidado.
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

/** Cuántas tarifas de outsourcing dependen de esta compañía — se muestra antes de desactivarla. */
export async function countOutsourcedRates(partyId: string): Promise<number> {
  const rows = await db().find('outsourcedCostRate', {
    where: [{ column: 'carrier_id', op: 'eq', value: partyId }],
  });
  return rows.length;
}
