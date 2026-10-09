// Detecta que un viaje NO tiene con qué calcularse y arma el enlace para cargarlo.
//
// Una liquidación necesita lógica de costos de la compañía del viaje:
//   - flota propia: estructura de costos (la de la compañía o, si no, la del país);
//   - tercero: reglas aplicables o tarifario propio.
// Sin eso el total sería un cero silencioso (terceros) o un error de texto (propia). Acá se
// reconoce el caso para mostrar qué falta y llevar a la pantalla de ESA compañía.
//
// Puro: no lee nada. Lo usan `calculateTrip` y la pantalla de liquidación.

import type { TarifasCatalog } from './catalogLoader';
import type { Rule, TripRecord } from './types';

export type MissingPiece = 'perfil' | 'costos' | 'tarifario' | 'reglas';

export interface NoLogicInfo {
  fleet: 'OWN' | 'OUTSOURCED';
  carrierId: string | null;
  carrierName: string | null;
  missing: MissingPiece[];
}

/** Qué abre la pantalla de la compañía al llegar por el enlace. */
export type CompanyPanel = 'costs' | 'rates' | 'variables';

const activeWithRows = (
  structure: { active: boolean } | null | undefined,
  rows: unknown[] | undefined,
) => !!structure?.active && !!rows?.length;

/** Reglas activas que pueden aplicarle a este perfil: las del país y las suyas. */
export function activeRulesFor(catalog: Pick<TarifasCatalog, 'rules'>, partyId: string | null): Rule[] {
  return catalog.rules.filter(
    (r) => r.active && ((r.scope ?? 'COUNTRY') !== 'PARTY' || r.partyId === partyId),
  );
}

/**
 * Lo que le falta al viaje para poder calcularse, o null si tiene con qué.
 *
 * Terceros: se exige al menos UNA regla activa aplicable (del país o de la compañía) o un
 * tarifario activo de la compañía. Que ninguna regla termine aplicando se detecta después del
 * cálculo (`noRuleApplied`), porque depende de las condiciones del viaje.
 */
export function detectMissingLogic(
  catalog: TarifasCatalog,
  trip: Pick<TripRecord, 'carrierId' | 'carrierName' | 'isOwnFleet'>,
  partyId: string | null,
): NoLogicInfo | null {
  const fleet = trip.isOwnFleet ? 'OWN' : 'OUTSOURCED';
  const missing: MissingPiece[] = [];

  if (fleet === 'OWN') {
    const hasCosts = activeWithRows(catalog.costStructure, catalog.costStructureRows)
      || activeWithRows(catalog.defaultCostStructure, catalog.defaultCostStructureRows);
    if (!hasCosts) missing.push('costos');
  } else {
    const hasRules = activeRulesFor(catalog, partyId).length > 0;
    const hasTables = catalog.rateTables.some((t) => t.active);
    if (!hasRules && !hasTables) missing.push('reglas', 'tarifario');
  }

  if (missing.length === 0) return null;
  if (!partyId) missing.unshift('perfil');
  return { fleet, carrierId: trip.carrierId, carrierName: trip.carrierName, missing };
}

/** Terceros: el catálogo tenía reglas, pero ninguna se aplicó a este viaje. */
export function noRuleApplied(
  trip: Pick<TripRecord, 'carrierId' | 'carrierName' | 'isOwnFleet'>,
  partyId: string | null,
  appliedLines: number,
): NoLogicInfo | null {
  if (trip.isOwnFleet || appliedLines > 0) return null;
  return {
    fleet: 'OUTSOURCED',
    carrierId: trip.carrierId,
    carrierName: trip.carrierName,
    missing: partyId ? ['reglas', 'tarifario'] : ['perfil', 'reglas', 'tarifario'],
  };
}

const LABEL: Record<MissingPiece, string> = {
  perfil: 'perfil de cálculo',
  costos: 'estructura de costos',
  tarifario: 'tarifario',
  reglas: 'reglas de tarifa',
};

export function noLogicMessage(info: NoLogicInfo): string {
  const who = info.carrierName ? `"${info.carrierName}"` : 'esta compañía';
  const what = info.missing.map((m) => LABEL[m]).join(', ');
  return info.fleet === 'OWN'
    ? `La flota propia ${who} no tiene con qué calcular este viaje: falta ${what}.`
    : `El transportista ${who} no tiene con qué calcular este viaje: falta ${what}.`;
}

/** Panel de la compañía que resuelve lo que falta. */
export function panelFor(info: NoLogicInfo): CompanyPanel {
  if (info.missing.includes('costos')) return 'costs';
  return 'rates';
}

/** Enlace a la pantalla de ESA compañía (flota propia o terceros) con el panel abierto. */
export function noLogicHref(info: NoLogicInfo): string | null {
  if (!info.carrierId) return null;
  const base = info.fleet === 'OWN' ? '/tarifas/flota-propia' : '/tarifas/transportistas';
  const params = new URLSearchParams({ carrier: info.carrierId, open: panelFor(info) });
  return `${base}?${params.toString()}`;
}
