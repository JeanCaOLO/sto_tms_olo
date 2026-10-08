// Variables del sistema: dinero, variables personalizadas, tipos de valor.

export type Money = string; // "400.00", "-12.5" — NUNCA number de JS

/** De dónde sale el valor de una variable personalizada al liquidar un viaje. */
export type CustomVarOrigin =
  /** Valor fijo configurado en la compañía. Se usa igual en todos sus viajes. */
  | 'CONSTANT'
  /** Dato que se carga en cada liquidación; `defaultValue` es solo el valor inicial. */
  | 'PER_TRIP';

export interface PartyVariable {
  id: string;
  partyId: string;
  /** Siempre con prefijo `custom:`. */
  key: CustomVarKey;
  label: string;
  kind: 'NUMBER' | 'TEXT';
  origin: CustomVarOrigin;
  defaultValue: string | null;
  unit: string | null;
  active: boolean;
}

/**
 * Variable declarada por una compañía. El prefijo `custom:` no es decorativo: separa el vocabulario
 * del sistema —que el compilador verifica— del que cada compañía agrega en caliente, y hace
 * imposible que una variable personalizada pise a una del sistema.
 */
export type CustomVarKey = `custom:${string}`;

export type VarValue = string | number;
