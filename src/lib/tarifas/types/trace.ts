// Trazabilidad del cálculo: líneas de desglose, reglas descartadas, problemas.

import type { Money } from './variables';
import type { Stage } from './ast';
import type { RuleScope } from './ast';
import type { RateTableMatch, Override } from './rateTable';
import type { CostBreakdown, MarginResult } from './cost';
import type { Allocation } from './cargo';

// ── Salida del kernel ────────────────────────────────────────────────────────────────────────

/** Origen de una línea del desglose: una regla del catálogo, una ad-hoc o una línea de costo. */
export type TraceSource = 'RULE' | 'ADHOC' | 'COST_ROW';

export interface TraceLine {
  seq: number;
  stage: Stage;
  ruleId: string | null; // null = línea ad-hoc sin persistir
  ruleCode: string;
  label: string;
  inputs: Record<string, string | number>;
  /** Lo que dictó la regla, antes de aplicar un override manual. */
  computed: Money;
  /** Si el monto salió de una tabla de tarifas, qué fila lo resolvió. */
  tableMatch?: RateTableMatch;
  /** De dónde viene la línea. Falta en liquidaciones guardadas antes de que se registrara. */
  source?: TraceSource;
  /** Alcance de la regla que la produjo ('COUNTRY' o 'PARTY'); solo si `source` es RULE. */
  ruleScope?: RuleScope;
  /** Compañía dueña de la regla cuando es de alcance 'PARTY'. */
  rulePartyId?: string | null;
  /** Versión de la regla al calcular. */
  ruleVersion?: number;
  override?: Override;
  /** `override.value` si existe; si no, `computed`. Es lo que entra al acumulado. */
  final: Money;
  /** Acumulado hasta esta línea. */
  runningSubtotal: Money;
}

export type DiscardReason =
  | 'CONDITION_FALSE' | 'EXCLUDED_BY_EXCLUSIVE' | 'LOST_MAX' | 'INACTIVE'
  /** Regla de país reemplazada por una de la compañía con el mismo código. */
  | 'OVERRIDDEN_BY_PARTY'
  /** La fecha del viaje cae fuera del período de vigencia de la regla. */
  | 'OUT_OF_PERIOD'
  /** La regla tiene una forma que el kernel no sabe leer: operador o condición desconocidos. */
  | 'RULE_BROKEN'
  /** El liquidador cambió la base de cálculo: esta regla BASE (o la estructura de costos) ya no aplica. */
  | 'BASE_REEMPLAZADA'
  /** Cobra el mismo concepto que la base elegida (p. ej. otra regla por km): se omite para no cobrar doble. */
  | 'DUPLICA_BASE';

export interface DiscardedRule {
  ruleCode: string;
  reason: DiscardReason;
  detail: string;
}

/**
 * Un problema que IMPIDE emitir la liquidación tal como está. Distinto de `warnings`, que son
 * avisos informativos: si algo hace que el total sea incorrecto, no alcanza con un texto que nadie
 * lee — tiene que frenar la emisión hasta que alguien lo resuelva o lo autorice.
 */
export interface CalcIssue {
  code:
    | 'BASE_NO_DISPONIBLE'
    | 'REFERENCIA_CIRCULAR'
    | 'TOTAL_NEGATIVO'
    | 'VARIABLE_INEXISTENTE'
    | 'COMPANIA_SIN_PERFIL'
    | 'COMPANIA_INACTIVA'
    /** Una regla no se pudo leer: el total está incompleto hasta arreglarla. */
    | 'REGLA_ILEGIBLE';
  message: string;
  ruleCode?: string;
}

// ── Cambio de base de cálculo ─────────────────────────────────────────────────────────────────
// La fase BASE sale por defecto de la estructura de costos (flota propia) o de las reglas BASE
// (terceros). El liquidador puede cambiarla por otro tipo de cobro; solo cambia la base, las demás
// fases siguen igual.

/** Tipos de cobro que puede tomar la base. TENDERING existe en el catálogo pero no tiene mecánica definida. */
export type BaseMethodId = 'PER_KM' | 'PER_UNIT' | 'FIXED' | 'VOLUME' | 'TENDERING';

/** De dónde sale la base elegida. */
export type BaseSourceKind = 'RULE' | 'RATE_TABLE' | 'COST_STRUCTURE';

export interface BaseSource {
  kind: BaseSourceKind;
  /** Código de la regla / del tarifario, o id de la estructura de costos. */
  ref: string;
  /** Nombre legible para la persona. */
  label: string;
}

/** Lo que pide el liquidador: qué tipo de cobro usar como base. */
export interface BaseOverride {
  method: BaseMethodId;
}

/** Cómo se resolvió la base elegida: es lo que se muestra y lo que se guarda al emitir. */
export interface BaseInfo {
  method: BaseMethodId;
  source: BaseSource;
  /** Códigos de las reglas BASE (o de la estructura de costos) que dejaron de aplicar. */
  replaced: string[];
  /** Reglas de otras fases que cobraban lo mismo que la base y se omitieron. */
  duplicates: { ruleCode: string; detail: string }[];
}

/** La base elegida tal como queda en la liquidación emitida (auditoría). */
export interface SettlementBaseChange extends BaseInfo {
  changedBy: string | null;
  changedAt: string;
}

// El motor calcula cuánto se le debe LIQUIDAR (pagar) al transportista por el viaje — nunca un
// cobro a un cliente. No hay "costo interno vs cobrado" que comparar (no existe margen de venta en
// este módulo): la misma regla de negocio (propio → nómina, outsourcing → cuentas por pagar) se
// resuelve enteramente con reglas condicionadas por `fleetType`/`carrierId`, igual que cualquier
// otra condición del AST — nunca con un `if` de código que bifurque el modelo de cálculo.
export interface CalcResult {
  trace: TraceLine[];
  discarded: DiscardedRule[];
  stageSubtotals: Record<Stage, Money>;
  /** Total a liquidar. Es el importe que se paga y el que se muestra. */
  totalLiquidado: Money;
  /** Moneda del país: `country.localCurrency`. Todo el resultado está en ella. */
  currency: string;
  /** Gastos operativos de la estructura de costos (flota propia); ya están dentro del total liquidado. */
  cost: CostBreakdown;
  /** Ganancia/pérdida de auditoría: valor de la mercancía contra gastos operativos. */
  margin: MarginResult;
  /** Cómo se reparte el total entre las casas comerciales; null si el viaje no tiene pedidos cargados. */
  allocation: Allocation | null;
  /** Avisos informativos: el total es correcto, pero algo merece una mirada. */
  warnings: string[];
  /** Problemas que hacen que el total NO sea confiable. Vacío = la liquidación se puede emitir. */
  blockingIssues: CalcIssue[];
  /** Presente solo si el liquidador cambió la base de cálculo. */
  base?: BaseInfo;
}
