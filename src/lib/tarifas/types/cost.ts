// Costos de operación y márgenes: estructura de costos y política de márgenes.

import type { Money } from './variables';
import type { CustomVarKey } from './variables';
import type { Pred } from './ast';
import type { TraceLine } from './trace';

// ── Costo + margen (Fase 2) ───────────────────────────────────────────────────────────────────
// El costo de operar un viaje de FLOTA PROPIA es lo que se liquida: la acumulación de gastos de la
// estructura de costos es el total a pagar (y las reglas, si las hay, solo ajustan encima). Vive
// fuera del AST de Rule porque sus conceptos (prorrateo mensual, costo por km) no son de tarifas.

// ── Estructura de costos por filas ────────────────────────────────────────────────────────────
// Es la ÚNICA fuente de costo de la flota propia (antes había además tres tasas fijas por país).
// Una estructura de costos real tiene
// decenas de conceptos —salarios, aguinaldo, seguros, depreciación, mantenimiento por km— y cada
// uno se prorratea de una manera distinta. Eso es una TABLA, no tres columnas.

/** Cómo se convierte el importe de una fila en plata de ESTE viaje. */
export type BuiltinCostDriver =
  /** Importe fijo por viaje. */
  | 'FIXED'
  /** Por kilómetro recorrido. */
  | 'PER_KM'
  /** Por día del viaje (1 + noches de pernocta). */
  | 'PER_DAY'
  /** Importe MENSUAL: se divide entre los días operativos del mes y se multiplica por los días
   *  del viaje. Es la forma en que las planillas reales cargan salarios y depreciación. */
  | 'PER_MONTH_PRORATED'
  /** Por parada/cliente atendido. */
  | 'PER_CLIENT'
  /** Por hora de duración del viaje. */
  | 'PER_HOUR';

/** Un driver del sistema o una variable personalizada NUMÉRICA de la compañía ("peajes", "bultos"). */
export type CostDriver = BuiltinCostDriver | CustomVarKey;

/** Cada cuánto se repite el costo de un componente (ver `componentCostPerKm`). */
export type CostFrequency = 'km' | 'year' | 'month';

/** Grupo de presentación de una fila de la estructura. */
export type CostGroup = 'conductor' | 'ayudante' | 'otros' | 'depreciacion' | 'mantenimiento';

/** Valores con los que se calculan las filas de una estructura (los edita quien la carga). */
export interface CostStructureParams {
  /** Kilómetros que recorre un camión en un año. Amortiza los componentes `year` y `month`. */
  kmPerYear: number | null;
  /** Precio del litro de combustible. Sin él no se calcula la línea de combustible. */
  fuelPrice: Money | null;
  /** Rendimiento km por litro, por tipo de camión (`vehicles.vehicle_type`). */
  fuelEfficiency: Record<string, Money>;
}

export interface CostStructure {
  id: string;
  /** Compañía dueña de esta estructura. Null = estructura por defecto del país (flota propia). */
  partyId: string | null;
  countryId: string;
  name: string;
  /** Divisor de `PER_MONTH_PRORATED`. En la planilla de ejemplo son 30. */
  operatingDaysPerMonth: number;
  params: CostStructureParams;
  /** Desde cuándo rige. Null = siempre. */
  effectiveFrom: string | null;
  active: boolean;
  notes: string | null;
}

export interface CostStructureRow {
  id: string;
  structureId: string;
  /** Identificador corto y estable de la fila ("SALARIO_CHOFER"). */
  code: string;
  label: string;
  driver: CostDriver;
  /** SIEMPRE sin signo: el signo lo pone `sign`, igual que el efecto en las reglas. */
  amount: Money;
  sign: 'ADD' | 'SUBTRACT';
  /**
   * Condición para que la fila cuente en este viaje. Reusa el mismo vocabulario que las reglas, así
   * que "la depreciación del camión de 3-4.5 t solo aplica a ese camión" se escribe igual que
   * cualquier otra condición del sistema.
   */
  appliesWhen: Pred | null;
  /** Solo presentación ("₡/km", "1 UND"). */
  unit: string | null;
  order: number;
  active: boolean;
  /** Grupo de presentación. Null = sin grupo. */
  group: CostGroup | null;
  /**
   * Componente que se repite cada cierto tiempo (mantenimiento, llantas…). Si está, la fila cuesta
   * `costPerKm × km del viaje`: `amount` es el costo de UNA reposición y `frequency`+`frequencyQty`
   * dicen cada cuánto se repite. `driver` se ignora.
   */
  frequency: CostFrequency | null;
  /** Cada cuántos km / años / meses se repite (según `frequency`). */
  frequencyQty: number | null;
  /** Cuántas unidades del componente se compran (informativo: el costo ya viene total). */
  unitQty: number | null;
  /** Costo por km derivado (para mostrar y exportar; el cálculo lo recalcula de sus datos). */
  costPerKm: Money | null;
  /** Solo para este tipo de camión (`vehicles.vehicle_type`). Null = todos. */
  truckType: string | null;
}

export interface CostBreakdown {
  total: Money;
  breakdown: TraceLine[];
  modelId: string;
  /** Moneda del costo. Siempre la local del país: el margen compara moneda contra la misma moneda. */
  currency: string;
}

// La ganancia o pérdida del viaje es un dato de AUDITORÍA, no de la liquidación: compara el valor
// de la mercancía que el viaje lleva (los pedidos de sus guías de despacho) contra los gastos
// operativos (lo que se liquida). No bloquea ni pide motivo: quien liquida solo ve cuánto se paga.
// Los umbrales solo colorean la alerta de auditoría.
export interface MarginPolicy {
  countryId: string;
  /** Proporción 0..1. Como string decimal exacto (el contrato `numeric` de la BD); `number` solo en fixtures. */
  warnBelow: Money | number;
  criticalBelow: Money | number;
  /** Sin efecto desde 2026-10-05 (el margen es informativo). Se conserva por compatibilidad. */
  requireReasonBelow: Money | number;
  /** Sin efecto desde 2026-10-05 (el margen es informativo). Se conserva por compatibilidad. */
  blockOnLoss: boolean;
}

export type MarginStatus = 'OK' | 'WARN' | 'CRITICAL' | 'LOSS';

export interface MarginResult {
  /** Valor de la mercancía − gastos operativos. */
  amount: Money;
  /** amount ÷ valor de la mercancía. */
  pct: string;
  status: MarginStatus;
  /** CARGO = se midió contra el valor de la mercancía; NONE = el viaje no tiene valor de pedidos cargado. */
  basis: 'CARGO' | 'NONE';
  /** Valor de la mercancía del viaje (suma de sus pedidos). */
  cargoValue: Money;
  /** Gastos operativos: lo que se liquida. */
  expense: Money;
  /** Moneda del margen: la local del país, igual que el total liquidado y el costo. */
  currency: string;
}
