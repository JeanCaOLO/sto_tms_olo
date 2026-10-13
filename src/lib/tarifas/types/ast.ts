// AST del lenguaje de reglas: predicados, expresiones, condiciones, estadios.

import type { Money } from './variables';
import type { NumericVarKey, VarKey } from './trip';

export type ComparisonOp = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE';

export type Pred =
  | { p: ComparisonOp; left: VarKey; right: string | number }
  | { p: 'IN'; left: VarKey; values: (string | number)[] }
  | { p: 'BETWEEN'; left: VarKey; from: number; to: number }
  | { p: 'AND' | 'OR'; args: Pred[] }
  | { p: 'NOT'; arg: Pred }
  | { p: 'ALWAYS' };

// Los operadores del constructor visual de condiciones: las seis comparaciones más IN y BETWEEN.
// El motor los ejecuta desde siempre (ver Pred); antes de la Fase 9 solo se alcanzaban por JSON.
export type ConditionRowOperator = ComparisonOp | 'IN' | 'BETWEEN';

/** Una fila del constructor visual de condiciones. */
export interface ConditionRowForm {
  left: VarKey;
  op: ConditionRowOperator;
  /** Envuelve la fila en NOT ("no se cumple que..."). */
  negate: boolean;
  /** Para las seis comparaciones. */
  right: string;
  /** Para IN: valores separados por coma. */
  values: string;
  /** Para BETWEEN. */
  from: string;
  to: string;
}

export type ConditionMode = 'always' | 'rows' | 'advanced';

/**
 * La condición tal como se armó en el formulario visual. El motor NO ejecuta esto: ejecuta el `Pred`
 * compilado a partir de acá. Se guarda para poder REABRIR la regla en el formulario simple en vez de
 * mandar a nadie a editar JSON — mismo motivo por el que existe `RuleBuilderForm` del lado del
 * cálculo, y el mismo defecto (A1) que tenía forzar JSON en la segunda edición.
 */
export interface ConditionBuilderForm {
  mode: ConditionMode;
  /** Cómo se combinan las filas entre sí, cuando hay más de una. Sin efecto con una sola fila. */
  combinator: 'AND' | 'OR';
  rows: ConditionRowForm[];
}

// Todo porcentaje declara su base de forma explícita — un "+8%" sin base es la causa #1 de
// discrepancias irreproducibles en motores de tarifas.
export type BaseRef =
  | { of: 'STAGE_SUBTOTAL'; stage: Stage }
  | { of: 'RUNNING_SUBTOTAL' }
  | { of: 'RULE'; ruleCode: string };

export type Expr =
  | { op: 'FIXED'; amount: Money }
  | { op: 'PER_UNIT'; unit: NumericVarKey; rate: Money }
  | { op: 'PER_KM'; rate: Money }
  | { op: 'PERCENT'; pct: string; base: BaseRef }
  /**
   * Escalones. `mode` decide QUÉ significa el `amount` de cada tramo — y la diferencia es plata:
   * con la tabla "hasta 100 km: 2 · 101-300: 1,50 · +300: 1,20" y un viaje de 250 km,
   *   FLAT        -> 1,50        (el tramo fija un importe)
   *   RATE        -> 375         (250 × 1,50: el tramo fija la tarifa de TODAS las unidades)
   *   PROGRESSIVE -> 425         (100×2 + 150×1,50: cada tramo cobra solo lo suyo)
   * Ausente = 'FLAT', que es como se interpretaban los escalones antes de que existiera el campo.
   */
  | { op: 'TIERED'; unit: NumericVarKey; mode?: TierMode; tiers: Tier[] }
  // "Cada N unidades completas, sumar X": 25 peajes con blockSize 10 dan 2 bloques. Con TIERED
  // había que enumerar un escalón por cada tramo posible, que no escala.
  | { op: 'PER_BLOCK'; unit: NumericVarKey; blockSize: number; amount: Money }
  // Busca en una tabla de tarifas por su código. Gana la fila MÁS ESPECÍFICA (la que menos
  // comodines usa); si ninguna coincide, se evalúa `fallback`. `column` elige cuál de las columnas
  // de valor de la fila se usa (sin ella, el valor principal). Si la fila no trae ese valor, también
  // se evalúa `fallback`, y se avisa.
  | { op: 'LOOKUP_TABLE'; table: string; column?: string; fallback: Expr }
  | { op: 'MIN' | 'MAX'; args: Expr[] }
  | { op: 'CLAMP'; value: Expr; min?: Money; max?: Money }
  | { op: 'IF'; cond: Pred; then: Expr; else: Expr };

/** Cómo se interpreta el importe de cada escalón. Ver el operador TIERED. */
export type TierMode =
  /** El tramo fija un IMPORTE fijo. */
  | 'FLAT'
  /** El tramo fija una TARIFA POR UNIDAD, aplicada a todas las unidades. */
  | 'RATE'
  /** Cada tramo cobra su tarifa solo por las unidades que caen dentro de él (marginal). */
  | 'PROGRESSIVE';

export interface Tier {
  /** Límite superior INCLUSIVO del tramo. `null` = de acá en adelante; debe ser el último. */
  upTo: number | null;
  /** Importe fijo o tarifa por unidad, según el `mode` de la expresión. */
  amount: Money;
}

export type Stage = 'BASE' | 'VARIABLE' | 'MODIFIER' | 'SURCHARGE' | 'ADJUSTMENT' | 'TAX';
export const STAGE_ORDER: readonly Stage[] = ['BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX'];

export type Stacking = 'SUM' | 'MAX' | 'EXCLUSIVE';

/**
 * De quién es la regla. Las de país son la base compartida; las de compañía se suman a ellas y, si
 * repiten el `code` de una de país, la REEMPLAZAN para esa compañía. Ese único mecanismo cubre los
 * tres casos: heredar, agregar y sobrescribir — incluida la reactivación para una compañía de una
 * regla de país que está desactivada.
 */
export type RuleScope = 'COUNTRY' | 'PARTY';

/**
 * Si la regla sube o baja el total. El importe de la regla se guarda SIEMPRE en positivo y el signo
 * lo pone esto: así "peajes × 20 que disminuye" y "peajes × -20" no son dos formas de escribir lo
 * mismo, que es la causa habitual de reglas que se contradicen sin que nadie lo note.
 */
export type RuleEffect = 'INCREASE' | 'DECREASE';

/** Los operadores del formulario visual, en el idioma del usuario. */
export type BuilderOperator =
  /** Monto fijo, sin variable. */
  | 'FIXED'
  /** variable × valor — "por cada peaje, 20". */
  | 'TIMES'
  /** variable ÷ bloque — "cada 10 peajes, 15". Solo cuenta bloques completos. */
  | 'PER_BLOCK'
  /** porcentaje sobre una base declarada. */
  | 'PERCENT'
  /** escalones por tramos: el modo decide qué significa el importe de cada uno. */
  | 'TIERED'
  /** el importe lo dice una fila de un tarifario, buscada por la clave de la tabla. */
  | 'RATE_TABLE';

/**
 * La regla tal como la armó la persona en el formulario visual. El motor NO ejecuta esto: ejecuta
 * la `expression` compilada a partir de acá. Se guarda para poder REABRIR la regla en el formulario
 * simple en vez de mandar a nadie a editar JSON.
 */
export interface RuleBuilderForm {
  /** null solo cuando el operador es FIXED. */
  variable: NumericVarKey | null;
  operator: BuilderOperator;
  /** Importe o porcentaje, SIEMPRE sin signo. El signo lo decide `effect`. */
  value: string;
  /** Tamaño de bloque para PER_BLOCK. */
  blockSize?: number;
  /** Base del porcentaje para PERCENT. */
  percentBase?: BaseRef;
  /** Tramos y su interpretación, para TIERED. */
  tiers?: Tier[];
  tierMode?: TierMode;
  /** Código del tarifario a consultar, para RATE_TABLE. */
  rateTableCode?: string;
  /** Columna de valor del tarifario a usar. Vacío = el valor principal. */
  rateTableColumn?: string;
  effect: RuleEffect;
  /**
   * Tope y piso sobre el resultado YA calculado, cualquiera sea el operador. Compila a un CLAMP que
   * envuelve la expresión. Ambos vacíos = sin acotar, que es como se comportaba toda regla antes de
   * este campo.
   */
  clamp?: { min?: string; max?: string };
}

export interface Rule {
  id: string;
  countryId: string;
  /** 'COUNTRY' si no se declara: es como se interpretaban todas las reglas antes de este campo. */
  scope?: RuleScope;
  /** Compañía dueña de la regla cuando `scope` es 'PARTY'. */
  partyId?: string | null;
  /**
   * Desde cuándo rige, en formato `YYYY-MM-DD` INCLUSIVE. Null = desde siempre.
   *
   * Sin esto, editar una regla cambiaba el cálculo de liquidaciones que todavía no se habían
   * emitido, y no había forma de responder "¿qué regla estaba vigente el día de este viaje?" — que
   * es la primera pregunta de cualquier auditoría.
   */
  effectiveFrom?: string | null;
  /** Hasta cuándo rige, `YYYY-MM-DD` INCLUSIVE (cubre todo ese día). Null = sin vencimiento. */
  effectiveTo?: string | null;
  code: string;
  name: string;
  stage: Stage;
  priority: number; // menor = se evalúa antes; dentro de EXCLUSIVE, gana la de menor priority
  stacking: Stacking;
  exclusionGroup: string | null; // reglas MAX mutuamente excluyentes comparten este grupo
  conditions: Pred;
  expression: Expr;
  /** Explicación en castellano. Autogenerada desde `builder`, editable a mano. */
  description?: string | null;
  /** Motivo de negocio por el que existe la regla. Texto libre, para auditoría. */
  reason?: string | null;
  effect?: RuleEffect | null;
  /** Forma visual con la que se armó. Ausente = regla escrita en modo avanzado. */
  builder?: RuleBuilderForm | null;
  /** Forma visual de la condición. Ausente = condición escrita en modo avanzado, o "Siempre". */
  conditionBuilder?: ConditionBuilderForm | null;
  isAdhoc: boolean;
  active: boolean;
  version: number; // se incrementa al editar; nunca se sobreescribe en silencio
}
