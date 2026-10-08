// Tablas de tarifas: catálogos de valores indexados por combinaciones de variables.

import type { Money } from './variables';
import type { VarKey } from './trip';

// ── Tablas de tarifas ─────────────────────────────────────────────────────────────────────────
// El vacío que dejaba la tabla zona-a-zona: su clave eran DOS columnas fijas (origen, destino).
// Un tarifario real se indexa por combinaciones — zona, tipo de camión, tipo de servicio, cliente —
// y con el modelo anterior cada combinación necesitaba su propia regla: 5 zonas × 4 camiones eran
// 20 reglas para lo que en una planilla son 20 FILAS.
//
// Una tabla de tarifas declara QUÉ variables forman su clave y guarda una fila por combinación.
// Es la mitad "tabular" que le faltaba al motor, y la que hace que un Excel se importe tal cual.

export interface RateTable {
  id: string;
  countryId: string;
  /** Compañía dueña. null = tabla del país, la usan todas. */
  partyId: string | null;
  /** Código con el que la referencia una regla. */
  code: string;
  name: string;
  /**
   * Variables que forman la clave, EN ORDEN. Cada fila trae un valor por cada una.
   * Pueden ser del sistema (`truckTypeId`, `originZone`) o personalizadas de la compañía.
   */
  keyColumns: VarKey[];
  /**
   * Columnas de valor ADEMÁS del principal (`amount`): un mismo tarifario puede dar, por ejemplo,
   * "flete" y "peaje" para la misma combinación, y cada regla elige la que usa. Vacío o ausente =
   * un solo valor por fila, como siempre.
   */
  valueColumns?: string[];
  active: boolean;
}

/** Valor que hace que una columna de la clave acepte cualquier cosa. */
export const RATE_TABLE_WILDCARD = '*';

export interface RateTableRow {
  id: string;
  tableId: string;
  /** Un valor por cada `keyColumns`, en el mismo orden. `*` acepta cualquier valor. */
  key: string[];
  /** Valor principal de la fila. */
  amount: Money;
  /** Valores de las columnas adicionales (`RateTable.valueColumns`), por nombre. Puede faltar alguno. */
  values?: Record<string, Money>;
  order: number;
  active: boolean;
}

/** Cómo resolvió una búsqueda en tabla, para que el desglose lo pueda explicar. */
export interface RateTableMatch {
  /** Id del tarifario (para abrirlo desde el desglose). */
  tableId: string;
  tableCode: string;
  /** Compañía dueña del tarifario; null = del país. */
  tablePartyId: string | null;
  rowId: string;
  /** La clave de la fila que ganó, ya legible ("CCS | NPR | *"). */
  matchedKey: string;
  /** Cuántas columnas coincidieron de forma exacta (sin comodín). */
  specificity: number;
  /** Columna de valor que se leyó. Ausente = la principal. */
  column?: string;
}

// La edición manual nunca sobreescribe en silencio — siempre queda registrada con un motivo.
export interface Override {
  value: Money;
  reason: string;
}
