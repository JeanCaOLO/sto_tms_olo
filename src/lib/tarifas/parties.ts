// Dominio de las compañías a liquidar: tipos y validación. Módulo PURO — no importa React, ni
// Supabase, ni la capa de datos, ni usa `Date.now()`. Así la regla "qué datos exige un tercero que
// no exige la flota propia" se puede probar sin montar un componente.
//
// La diferencia entre flota propia y tercero es de DATOS EXIGIDOS y de PRESENTACIÓN, no de modelo:
// una sola entidad, un solo cálculo. Lo que cambia es qué campos son obligatorios y en qué pantalla
// se administra cada una. Ver `data/schema.ts` → `settlementParty`.

export type PartyClassification = 'OWN' | 'OUTSOURCED';
export type PartyStatus = 'active' | 'inactive';

/** Tipo de identificación fiscal. Depende del país, por eso es un dato y no una constante. */
export type TaxIdType = 'RIF' | 'NIT' | 'CEDULA_JURIDICA' | 'OTRO';

export const TAX_ID_TYPES: { value: TaxIdType; label: string; countries: string[] }[] = [
  { value: 'RIF', label: 'RIF', countries: ['VE'] },
  { value: 'NIT', label: 'NIT', countries: ['CO'] },
  { value: 'CEDULA_JURIDICA', label: 'Cédula jurídica', countries: ['CR'] },
  { value: 'OTRO', label: 'Otro', countries: [] },
];

/** Tipo fiscal sugerido para un país, o 'OTRO' si no hay uno conocido. Sugerencia, no imposición. */
export function suggestedTaxIdType(countryIso2: string): TaxIdType {
  return TAX_ID_TYPES.find((t) => t.countries.includes(countryIso2))?.value ?? 'OTRO';
}

/** Forma de fila tal como viaja por la capa de datos (snake_case, igual que en Postgres). */
export interface SettlementPartyRow {
  id: string;
  country_id: string;
  classification: PartyClassification;
  code: string;
  name: string;
  tax_id: string | null;
  tax_id_type: TaxIdType | null;
  /** `carriers.id` del TMS, cuando este perfil corresponde a un transportista ya cargado allá. */
  carrier_id: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: PartyStatus;
  notes: string | null;
}

export type SettlementPartyInput = Omit<SettlementPartyRow, 'id'> & { id?: string };

export const CLASSIFICATION_LABELS: Record<PartyClassification, string> = {
  OWN: 'Flota propia',
  OUTSOURCED: 'Tercero',
};

// ── Validación ────────────────────────────────────────────────────────────────────────────────

/** Errores por campo. Vacío = la compañía es válida. */
export type PartyErrors = Partial<Record<keyof SettlementPartyRow, string>>;

export interface ValidationContext {
  /** El resto de las compañías ya guardadas, para verificar unicidad. */
  existing: Pick<SettlementPartyRow, 'id' | 'code' | 'country_id' | 'carrier_id'>[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blank(value: string | null | undefined): boolean {
  return !value || value.trim() === '';
}

export function validateParty(party: SettlementPartyInput, context: ValidationContext): PartyErrors {
  const errors: PartyErrors = {};
  const others = context.existing.filter((p) => p.id !== party.id);

  if (blank(party.name)) errors.name = 'El nombre es obligatorio.';
  if (blank(party.country_id)) errors.country_id = 'Elegí el país: define la moneda de la liquidación.';

  if (blank(party.code)) {
    errors.code = 'El código es obligatorio.';
  } else if (
    others.some(
      (p) => p.country_id === party.country_id && p.code.trim().toUpperCase() === party.code.trim().toUpperCase(),
    )
  ) {
    errors.code = 'Ya existe una compañía con este código en el mismo país.';
  }

  // Un tercero se factura: sin identificación fiscal no se le puede liquidar. La flota propia no
  // emite factura contra sí misma, así que ahí el dato es opcional.
  if (party.classification === 'OUTSOURCED') {
    if (blank(party.tax_id)) {
      errors.tax_id = 'Un transportista tercero necesita identificación fiscal para poder liquidarle.';
    }
    if (blank(party.tax_id_type)) {
      errors.tax_id_type = 'Indicá qué tipo de identificación fiscal es.';
    }
  }

  // Un perfil por transportista del TMS: dos perfiles sobre el mismo transportista harían que un
  // viaje pudiera liquidarse con dos juegos de reglas distintos según cuál se eligiera.
  if (!blank(party.carrier_id) && others.some((p) => p.carrier_id === party.carrier_id)) {
    errors.carrier_id = 'Ese transportista del TMS ya está enlazado a otra compañía.';
  }

  if (!blank(party.email) && !EMAIL.test(party.email!.trim())) {
    errors.email = 'El correo no tiene un formato válido.';
  }

  return errors;
}

export function isValid(errors: PartyErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Normaliza antes de guardar: recorta espacios y convierte los vacíos en null. */
export function normalizeParty(party: SettlementPartyInput): SettlementPartyInput {
  const text = (value: string | null | undefined): string | null =>
    blank(value) ? null : value!.trim();

  return {
    ...party,
    code: (party.code ?? '').trim().toUpperCase(),
    name: (party.name ?? '').trim(),
    tax_id: text(party.tax_id),
    tax_id_type: party.classification === 'OUTSOURCED' ? party.tax_id_type : (party.tax_id_type ?? null),
    carrier_id: text(party.carrier_id),
    contact_name: text(party.contact_name),
    email: text(party.email),
    phone: text(party.phone),
    address: text(party.address),
    notes: text(party.notes),
  };
}

/** Código sugerido para una compañía nueva: prefijo por clasificación + correlativo por país. */
export function suggestCode(
  classification: PartyClassification,
  countryIso2: string,
  existing: Pick<SettlementPartyRow, 'code' | 'country_id' | 'classification'>[],
): string {
  const prefix = classification === 'OWN' ? 'FP' : 'TR';
  const sameScope = existing.filter(
    (p) => p.classification === classification && p.country_id === countryIso2,
  );
  return `${prefix}-${countryIso2}-${String(sameScope.length + 1).padStart(3, '0')}`;
}
