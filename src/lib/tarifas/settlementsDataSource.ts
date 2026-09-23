// Liquidaciones emitidas.
//
// Lo que arregla: hasta ahora la liquidación se guardaba en una tabla del TMS que no tiene columnas
// para el desglose, así que la traza, los descartes, los subtotales y los avisos **se perdían al
// guardar**. Una liquidación emitida no se podía volver a explicar: quedaba un total y nada más.
//
// Acá se guarda entera, desnormalizada y sin referencia a las reglas — a propósito. Una liquidación
// emitida tiene que poder releerse tal cual se emitió aunque después la regla se edite, se
// desactive o se borre. Es la misma razón por la que las reglas se versionan y por la que existe la
// vigencia.

import { db, type Row } from './data';
import type {
  CalcIssue, CalcResult, MarginStatus, Override, Rule, SettlementRecord, SettlementReturn,
  SettlementStatus, Stage, TraceLine, TripContext,
} from './types';

export interface SettlementInput {
  countryId: string;
  partyId: string;
  routeId: string | null;
  driverId: string | null;
  tripNumber: string | null;
  /** 'YYYY-MM-DD'. */
  settlementDate: string;
  truckTypeId: string | null;
  status: SettlementStatus;
  notes: string | null;
  marginReason: string | null;
  trip: TripContext;
  calc: CalcResult;
  overrides?: Record<string, Override>;
  adhocRules?: Rule[];
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
  /** El motor dice que el total NO es confiable. No es un error del formulario. */
  | { status: 'blocked'; issues: CalcIssue[] }
  | { status: 'failed'; error: { message: string } };

function toDomain(row: Row): SettlementRecord {
  return {
    id: row.id,
    countryId: row.country_id,
    partyId: row.party_id,
    routeId: row.route_id ?? null,
    driverId: row.driver_id ?? null,
    number: row.number,
    tripNumber: row.trip_number ?? null,
    settlementDate: row.settlement_date,
    truckTypeId: row.truck_type_id ?? null,
    status: row.status as SettlementStatus,
    currency: row.currency,
    totalAmount: String(row.total_amount),
    notes: row.notes ?? null,
    marginReason: row.margin_reason ?? null,
    marginStatus: (row.margin_status ?? null) as MarginStatus | null,
    marginAmount: row.margin_amount === null || row.margin_amount === undefined ? null : String(row.margin_amount),
    marginPct: row.margin_pct === null || row.margin_pct === undefined ? null : String(row.margin_pct),
    costTotal: row.cost_total === null || row.cost_total === undefined ? null : String(row.cost_total),
    costModelId: row.cost_model_id ?? null,
    trip: (row.trip ?? {}) as TripContext,
    trace: (row.trace ?? []) as TraceLine[],
    discarded: row.discarded ?? [],
    stageSubtotals: (row.stage_subtotals ?? {}) as Record<Stage, string>,
    warnings: (row.warnings ?? []) as string[],
    overrides: (row.overrides ?? {}) as Record<string, Override>,
    adhocRules: (row.adhoc_rules ?? []) as Rule[],
    excludedSeqs: (row.excluded_seqs ?? []) as number[],
    returns: (row.returns ?? []) as SettlementReturn[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SettlementFilter {
  countryId?: string;
  partyId?: string;
  driverId?: string;
  status?: SettlementStatus;
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  to?: string;
}

export async function listSettlements(filter: SettlementFilter = {}): Promise<SettlementRecord[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.partyId) where.push({ column: 'party_id', op: 'eq', value: filter.partyId });
  if (filter.driverId) where.push({ column: 'driver_id', op: 'eq', value: filter.driverId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });

  const rows = await db().find('settlement', {
    where,
    orderBy: [{ column: 'settlement_date', direction: 'desc' }],
  });

  // El rango de fechas se filtra acá porque la capa sólo tiene igualdad. Las fechas son
  // 'YYYY-MM-DD', así que el orden alfabético ES el cronológico.
  return rows
    .map(toDomain)
    .filter((s) => (!filter.from || s.settlementDate >= filter.from)
      && (!filter.to || s.settlementDate <= filter.to));
}

export async function getSettlement(id: string): Promise<SettlementRecord | null> {
  const row = await db().findOne('settlement', id);
  return row ? toDomain(row) : null;
}

/**
 * Siguiente número de liquidación del país: `LIQ-0001`.
 *
 * PURA sobre la lista de números existentes, para poder probarla. La versión anterior vivía dentro
 * del modal y ya produjo un `LIQ-0NaN` cuando se topó con un número con otra forma; por eso acá se
 * ignora en silencio todo lo que no sea un sufijo numérico en vez de arrastrarlo al cálculo.
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

  if (!input.partyId) errors.partyId = 'Falta la compañía a la que se le liquida.';
  if (!input.countryId) errors.countryId = 'Falta el país.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test((input.settlementDate ?? '').trim())) {
    errors.settlementDate = 'Fecha inválida: se espera AAAA-MM-DD.';
  }

  // El motivo del margen no es una formalidad: es lo que queda escrito cuando alguien aprueba una
  // liquidación que la política marcó como floja.
  if (input.calc.margin.action === 'REQUIRE_REASON' && !(input.marginReason ?? '').trim()) {
    errors.marginReason = 'El margen exige un motivo escrito para esta liquidación.';
  }

  return errors;
}

/**
 * Emite la liquidación con su desglose completo.
 *
 * Devuelve `'blocked'` —y no `'invalid'`— cuando el motor detectó algo que hace que el total no sea
 * confiable, o cuando la política de margen lo impide. Son cosas distintas: un campo mal cargado lo
 * arregla quien liquida; un ciclo entre reglas, no.
 */
export async function emitSettlement(
  input: SettlementInput,
  id?: string,
): Promise<EmitSettlementResult> {
  if (input.calc.blockingIssues.length > 0) {
    return { status: 'blocked', issues: input.calc.blockingIssues };
  }

  if (input.calc.margin.action === 'BLOCK'
    && (input.status === 'Aprobado' || input.status === 'Pagado')) {
    return {
      status: 'blocked',
      issues: [{
        code: 'TOTAL_NEGATIVO',
        message: 'La política de margen de este país impide aprobar una liquidación con pérdida.',
      }],
    };
  }

  const errors = validateSettlement(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const ahora = new Date().toISOString();

  try {
    const existentes = id
      ? []
      : (await db().find('settlement', {
        where: [{ column: 'country_id', op: 'eq', value: input.countryId }],
      })).map((r) => String(r.number));

    const values: Row = {
      country_id: input.countryId,
      party_id: input.partyId,
      route_id: input.routeId,
      driver_id: input.driverId,
      trip_number: input.tripNumber?.trim() || null,
      settlement_date: input.settlementDate,
      truck_type_id: input.truckTypeId,
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
      trip: input.trip,
      trace: input.calc.trace,
      discarded: input.calc.discarded,
      stage_subtotals: input.calc.stageSubtotals,
      warnings: input.calc.warnings,
      overrides: input.overrides ?? {},
      adhoc_rules: input.adhocRules ?? [],
      excluded_seqs: input.excludedSeqs ?? [],
      returns: input.returns ?? [],
      updated_at: ahora,
    };

    const saved = id
      ? await db().update('settlement', id, values)
      : await db().insert('settlement', {
        ...values,
        number: nextSettlementNumber(existentes),
        created_at: ahora,
      });

    return { status: 'saved', settlement: toDomain(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Cambia el estado de una liquidación ya emitida.
 *
 * No hay borrado: una liquidación se ANULA. Borrarla dejaría un hueco en la numeración y borraría
 * la prueba de lo que se pagó.
 */
export async function updateSettlementStatus(
  id: string,
  status: SettlementStatus,
  options?: { marginReason?: string },
): Promise<{ error: string | null }> {
  try {
    const actual = await db().findOne('settlement', id);
    if (!actual) return { error: 'La liquidación ya no existe.' };

    // Misma protección que al emitir: el margen en pérdida no se aprueba desde la lista.
    if (actual.margin_status === 'LOSS' && (status === 'Aprobado' || status === 'Pagado')) {
      return { error: 'No se puede aprobar una liquidación con margen en pérdida.' };
    }

    await db().update('settlement', id, {
      status,
      ...(options?.marginReason ? { margin_reason: options.marginReason } : {}),
      updated_at: new Date().toISOString(),
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
