// Liquidaciones de viajes.
//
// Una liquidación se emite SOBRE UN VIAJE de guía de despacho, completado y sin otra liquidación
// vigente (ROADMAP §8). No hay alta manual: el viaje no se crea acá.
//
// Se guarda entera, desnormalizada y sin referencia a las reglas — a propósito. Una liquidación
// emitida tiene que poder releerse tal cual se emitió aunque después la regla se edite, se
// desactive o se borre, y aunque guía de despacho corrija el viaje: por eso se congela `trip_info`.
//
// Historial: un viaje tiene UNA liquidación vigente. Re-liquidar anula la vigente (queda con su
// snapshot y apuntando a su reemplazo) y emite otra, todo en una transacción.

import { registrarEvento } from '../liquidador/auditLog';
import { getActorRole } from './actor';
import { db, UniqueViolationError, type Condition, type Row } from './data';
import { notLiquidableReason } from './tripContext';
import { getTrip } from './tripsDataSource';
import type {
  CalcIssue, CalcResult, MarginStatus, Override, Rule, SettlementRecord, SettlementReturn,
  SettlementStatus, Stage, TraceLine, TripContext, TripEdits, TripRecord,
} from './types';

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
  returns?: SettlementReturn[];
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

function toDomain(row: Row): SettlementRecord {
  const money = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: row.id,
    countryId: row.country_id,
    tripId: row.trip_id,
    partyId: row.party_id ?? null,
    number: row.number,
    tripNumber: row.trip_number ?? '',
    settlementDate: row.settlement_date,
    status: row.status as SettlementStatus,
    tripInfo: (row.trip_info ?? {}) as TripRecord,
    tripEdits: (row.trip_edits ?? { customVars: {} }) as TripEdits,
    supersededBy: row.superseded_by ?? null,
    currency: row.currency,
    totalAmount: String(row.total_amount),
    notes: row.notes ?? null,
    marginReason: row.margin_reason ?? null,
    marginStatus: (row.margin_status ?? null) as MarginStatus | null,
    marginAmount: money(row.margin_amount),
    marginPct: money(row.margin_pct),
    costTotal: money(row.cost_total),
    costModelId: row.cost_model_id ?? null,
    trip: (row.trip ?? {}) as TripContext,
    trace: (row.trace ?? []) as TraceLine[],
    discarded: row.discarded ?? [],
    stageSubtotals: (row.stage_subtotals ?? {}) as Record<Stage, string>,
    warnings: (row.warnings ?? []) as string[],
    overrides: (row.overrides ?? {}) as Record<string, Override>,
    adhocRules: (row.adhoc_rules ?? []) as Rule[],
    rulesUsed: (row.rules_used ?? []) as Rule[],
    excludedSeqs: (row.excluded_seqs ?? []) as number[],
    returns: (row.returns ?? []) as SettlementReturn[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SettlementFilter {
  countryId?: string;
  partyId?: string;
  tripId?: string;
  status?: SettlementStatus;
  /** false = oculta las anuladas. Por defecto se incluyen: es el historial. */
  includeVoided?: boolean;
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  to?: string;
}

export async function listSettlements(filter: SettlementFilter = {}): Promise<SettlementRecord[]> {
  const where: Condition[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.partyId) where.push({ column: 'party_id', op: 'eq', value: filter.partyId });
  if (filter.tripId) where.push({ column: 'trip_id', op: 'eq', value: filter.tripId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });
  if (filter.includeVoided === false) where.push({ column: 'status', op: 'neq', value: 'Anulado' });
  if (filter.from) where.push({ column: 'settlement_date', op: 'gte', value: filter.from });
  if (filter.to) where.push({ column: 'settlement_date', op: 'lte', value: filter.to });

  const rows = await db().find('settlement', {
    where,
    orderBy: [{ column: 'settlement_date', direction: 'desc' }, { column: 'number', direction: 'desc' }],
  });
  return rows.map(toDomain);
}

export async function getSettlement(id: string): Promise<SettlementRecord | null> {
  const row = await db().findOne('settlement', id);
  return row ? toDomain(row) : null;
}

/** Historial completo de un viaje: la vigente y las que reemplazó, de la más nueva a la más vieja. */
export async function listTripSettlements(tripId: string): Promise<SettlementRecord[]> {
  return listSettlements({ tripId });
}

/**
 * Siguiente número de liquidación del país: `LIQ-0001`.
 *
 * PURA sobre la lista de números existentes, para poder probarla. Se ignora en silencio todo lo que
 * no sea un sufijo numérico en vez de arrastrarlo al cálculo (ya produjo un `LIQ-0NaN`).
 */
export function nextSettlementNumber(existentes: string[]): string {
  const maximo = existentes.reduce((max, numero) => {
    const match = /^LIQ-(\d+)$/.exec((numero ?? '').trim());
    if (!match) return max;
    const valor = Number(match[1]);
    return Number.isFinite(valor) && valor > max ? valor : max;
  }, 0);

  return `LIQ-${String(maximo + 1).padStart(4, '0')}`;
}

export function validateSettlement(input: SettlementInput): SettlementErrors {
  const errors: SettlementErrors = {};

  if (!input.trip?.id) errors.trip = 'Falta el viaje a liquidar.';
  if (!input.trip?.countryId) errors.trip = 'El viaje no tiene país.';

  // El motivo del margen no es una formalidad: es lo que queda escrito cuando alguien aprueba una
  // liquidación que la política marcó como floja.
  if (input.calc.margin.action === 'REQUIRE_REASON' && !(input.marginReason ?? '').trim()) {
    errors.marginReason = 'El margen exige un motivo escrito para esta liquidación.';
  }

  return errors;
}

/** Problemas del cálculo o de la política que impiden emitir. Vacío = se puede. */
function blockingIssues(input: SettlementInput): CalcIssue[] {
  if (input.calc.blockingIssues.length > 0) return input.calc.blockingIssues;
  if (input.calc.margin.action === 'BLOCK' && (input.status === 'Aprobado' || input.status === 'Pagado')) {
    return [{
      code: 'TOTAL_NEGATIVO',
      message: 'La política de margen de este país impide aprobar una liquidación con pérdida.',
    }];
  }
  return [];
}

function newSettlementId(): string {
  return `stl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowValues(input: SettlementInput, trip: TripRecord, ahora: string): Row {
  return {
    country_id: trip.countryId,
    trip_id: trip.id,
    party_id: input.partyId,
    trip_number: trip.routeNumber,
    settlement_date: trip.routeDate,
    status: input.status,
    currency: input.calc.currency,
    total_amount: input.totalAmount,
    notes: input.notes?.trim() || null,
    margin_reason: input.marginReason?.trim() || null,
    margin_status: input.calc.margin.status,
    margin_amount: input.calc.margin.amount,
    margin_pct: input.calc.margin.pct,
    cost_total: input.calc.cost.total,
    cost_model_id: input.calc.cost.modelId,
    // La foto es la del viaje RELEÍDO al emitir, no la que traía la pantalla.
    trip_info: { ...trip, settlementId: null },
    trip_edits: input.edits ?? { customVars: {} },
    trip: input.context,
    trace: input.calc.trace,
    discarded: input.calc.discarded,
    stage_subtotals: input.calc.stageSubtotals,
    warnings: input.calc.warnings,
    overrides: input.overrides ?? {},
    adhoc_rules: input.adhocRules ?? [],
    rules_used: input.rulesUsed ?? [],
    excluded_seqs: input.excludedSeqs ?? [],
    returns: input.returns ?? [],
    superseded_by: null,
    updated_at: ahora,
  };
}

function failed(error: unknown): EmitSettlementResult {
  if (error instanceof UniqueViolationError) {
    return {
      status: 'blocked',
      issues: [{ code: 'BASE_NO_DISPONIBLE', message: error.message }],
    };
  }
  return { status: 'failed', error: { message: error instanceof Error ? error.message : String(error) } };
}

async function nextNumber(countryId: string): Promise<string> {
  const rows = await db().find('settlement', { where: [{ column: 'country_id', op: 'eq', value: countryId }] });
  return nextSettlementNumber(rows.map((r) => String(r.number)));
}

/**
 * Emite la PRIMERA liquidación de un viaje.
 *
 * Devuelve `'blocked'` —y no `'invalid'`— cuando el motor detectó algo que hace que el total no sea
 * confiable, cuando la política de margen lo impide, o cuando el viaje ya no se puede liquidar
 * (dejó de estar completado, o alguien lo liquidó mientras tanto). Son cosas que no arregla quien
 * completa el formulario.
 */
export async function emitSettlement(input: SettlementInput): Promise<EmitSettlementResult> {
  const issues = blockingIssues(input);
  if (issues.length > 0) return { status: 'blocked', issues };

  const errors = validateSettlement(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  try {
    // Se relee el viaje: entre que se abrió la pantalla y se emite, pudo cambiar o liquidarse.
    const trip = await getTrip(input.trip.id);
    if (!trip) return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: 'El viaje ya no existe.' }] };
    const motivo = notLiquidableReason(trip);
    if (motivo) return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: motivo }] };

    const ahora = new Date().toISOString();
    const saved = await db().insert('settlement', {
      id: newSettlementId(),
      ...rowValues(input, trip, ahora),
      number: await nextNumber(trip.countryId),
      created_at: ahora,
    });

    await auditar('CREATE', String(saved.id), null, resumen(saved), undefined);
    return { status: 'saved', settlement: toDomain(saved) };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Re-liquida un viaje: anula la liquidación vigente y emite una nueva con el cálculo actual, en UNA
 * transacción — o queda la vieja vigente, o queda la nueva; nunca las dos ni ninguna.
 *
 * La anulada conserva su snapshot y apunta a la nueva con `superseded_by`: así el historial del
 * viaje dice qué se pagó antes, qué se paga ahora y por qué cambió (`reason`).
 */
export async function reliquidateSettlement(
  currentId: string,
  input: SettlementInput,
  reason: string,
): Promise<EmitSettlementResult> {
  if (!reason.trim()) {
    return { status: 'invalid', errors: { notes: 'Indicá por qué se re-liquida el viaje.' } };
  }

  const issues = blockingIssues(input);
  if (issues.length > 0) return { status: 'blocked', issues };

  const errors = validateSettlement(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  try {
    const actual = await db().findOne('settlement', currentId);
    if (!actual) return { status: 'failed', error: { message: 'La liquidación a reemplazar ya no existe.' } };
    if (actual.status === 'Anulado') {
      return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: 'Esa liquidación ya está anulada: no es la vigente del viaje.' }] };
    }
    if (actual.trip_id !== input.trip.id) {
      return { status: 'failed', error: { message: 'La liquidación a reemplazar es de otro viaje.' } };
    }

    const trip = await getTrip(input.trip.id);
    if (!trip) return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: 'El viaje ya no existe.' }] };
    if (trip.status !== 'completed') {
      return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: notLiquidableReason(trip) ?? 'El viaje no está completado.' }] };
    }

    const ahora = new Date().toISOString();
    const newId = newSettlementId();
    const number = await nextNumber(trip.countryId);

    const saved = await db().transaction(async (tx) => {
      // Primero se anula la vigente: libera el índice único "una vigente por viaje".
      await tx.update('settlement', currentId, {
        status: 'Anulado',
        superseded_by: newId,
        updated_at: ahora,
      });
      return tx.insert('settlement', {
        id: newId,
        ...rowValues(input, trip, ahora),
        number,
        created_at: ahora,
      });
    });

    await auditar('UPDATE', currentId, { status: actual.status }, { status: 'Anulado', superseded_by: newId }, reason);
    await auditar('CREATE', newId, null, resumen({ ...saved, number }), `Re-liquidación de ${actual.number}: ${reason}`);

    // El driver HTTP devuelve dentro de la transacción lo enviado; se relee la fila definitiva.
    const definitiva = await db().findOne('settlement', newId);
    return { status: 'saved', settlement: toDomain(definitiva ?? { ...saved, id: newId }) };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Cambia el estado de una liquidación ya emitida.
 *
 * No hay borrado: una liquidación se ANULA. Borrarla dejaría un hueco en la numeración y borraría
 * la prueba de lo que se pagó. Una anulada que ya fue reemplazada no se puede reactivar.
 */
export async function updateSettlementStatus(
  id: string,
  status: SettlementStatus,
  options?: { marginReason?: string },
): Promise<{ error: string | null }> {
  try {
    const actual = await db().findOne('settlement', id);
    if (!actual) return { error: 'La liquidación ya no existe.' };

    if (actual.superseded_by && status !== 'Anulado') {
      return { error: 'Esta liquidación fue reemplazada al re-liquidar el viaje: no se puede reactivar.' };
    }

    // Misma protección que al emitir: el margen en pérdida no se aprueba desde la lista.
    if (actual.margin_status === 'LOSS' && (status === 'Aprobado' || status === 'Pagado')) {
      return { error: 'No se puede aprobar una liquidación con margen en pérdida.' };
    }

    await db().update('settlement', id, {
      status,
      ...(options?.marginReason ? { margin_reason: options.marginReason } : {}),
      updated_at: new Date().toISOString(),
    });
    await auditar(
      status === 'Aprobado' || status === 'Pagado' ? 'AUTHORIZE' : 'UPDATE',
      id, { status: actual.status }, { status }, options?.marginReason,
    );
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Lo que se anota en la bitácora de una liquidación: lo que la identifica, no el desglose entero. */
function resumen(row: Row): Row {
  return {
    numero: row.number,
    viaje: row.trip_number,
    estado: row.status,
    total: row.total_amount,
    moneda: row.currency,
    margen: row.margin_status,
  };
}

/** Correo del usuario logueado (sesión del TMS, misma clave que `src/lib/supabase.ts`). */
function usuarioActual(): string {
  try {
    const raw = localStorage.getItem('tms_session');
    const email = raw ? (JSON.parse(raw) as { user?: { email?: string } }).user?.email : undefined;
    return email || 'usuario sin sesión';
  } catch {
    return 'usuario sin sesión';
  }
}

/**
 * La bitácora de las liquidaciones se escribe ACÁ, junto a la escritura que registra — no en la
 * pantalla —, para que ningún camino (emitir, re-liquidar, cambiar estado) quede sin rastro.
 */
async function auditar(
  accion: 'CREATE' | 'UPDATE' | 'AUTHORIZE',
  entidadId: string,
  antes: unknown,
  despues: unknown,
  motivo: string | undefined,
): Promise<void> {
  // La bitácora no debe tumbar una liquidación ya guardada: si falla, la operación sigue valiendo.
  try {
    await registrarEvento({
      entidad: 'settlement',
      entidadId,
      accion,
      usuario: usuarioActual(),
      rol: getActorRole(),
      antes,
      despues,
      ...(motivo ? { motivo } : {}),
    });
  } catch (error) {
    console.error('[tarifas] No se pudo registrar la bitácora de la liquidación', error);
  }
}
