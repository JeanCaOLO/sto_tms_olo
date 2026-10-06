// Compañías a liquidar: transportistas del catálogo + su perfil de cálculo. Módulo PURO.
//
// Desde 2026-10-02 (ROADMAP §8) la compañía ES el transportista del catálogo (`carriers`): nombre,
// identificación fiscal y flota propia/tercero se leen de ahí y el liquidador no los edita. Lo que
// el liquidador agrega es el PERFIL DE CÁLCULO (`settlementParty`), 1:1 con el transportista, que
// ancla sus variables personalizadas, su estructura de costos, sus tarifarios y sus reglas propias.

import type { Row } from './data';

export type PartyClassification = 'OWN' | 'OUTSOURCED';
export type PartyStatus = 'active' | 'inactive';

export const CLASSIFICATION_LABELS: Record<PartyClassification, string> = {
  OWN: 'Flota propia',
  OUTSOURCED: 'Tercero',
};

/** Flota propia o tercero sale SOLO de `carriers.is_flota_propia`. */
export function classificationOf(isOwnFleet: boolean | null | undefined): PartyClassification {
  return isOwnFleet ? 'OWN' : 'OUTSOURCED';
}

/** Fila del perfil de cálculo tal como viaja por la capa de datos. */
export interface SettlementPartyRow {
  id: string;
  carrier_id: string;
  status: PartyStatus;
  notes: string | null;
}

/** Un transportista del catálogo visto desde el liquidador: datos del catálogo + su perfil. */
export interface CarrierProfile {
  carrierId: string;
  code: string;
  name: string;
  taxId: string | null;
  countryId: string | null;
  classification: PartyClassification;
  /** Estado del transportista en el catálogo. */
  carrierStatus: string | null;
  /** Perfil de cálculo, o null si todavía no se configuró nada para este transportista. */
  partyId: string | null;
  profileStatus: PartyStatus | null;
}

/**
 * Une transportistas y perfiles. Un transportista sin perfil aparece igual (con `partyId: null`):
 * se puede liquidar con las reglas del país, y el perfil se crea la primera vez que se le configura
 * algo propio.
 */
export function mergeCarriersWithProfiles(carriers: Row[], profiles: Row[]): CarrierProfile[] {
  const byCarrier = new Map(profiles.map((p) => [String(p.carrier_id), p]));
  return carriers.map((c) => {
    const profile = byCarrier.get(String(c.id));
    return {
      carrierId: String(c.id),
      code: String(c.code ?? ''),
      name: String(c.name ?? ''),
      taxId: c.tax_id ?? null,
      countryId: c.country_id ?? null,
      classification: classificationOf(c.is_flota_propia),
      carrierStatus: c.status ?? null,
      partyId: profile ? String(profile.id) : null,
      profileStatus: profile ? (profile.status as PartyStatus) : null,
    };
  });
}
