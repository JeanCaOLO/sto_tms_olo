// La máquina de dependencias del alta de liquidación.
//
// Lo que trae la guía física es nro de viaje, ruta, conductor y cédula. Todo lo demás se deriva, y
// las tres puertas de entrada tienen que llevar al mismo lugar:
//
//   elegir RUTA          -> su compañía; si el conductor elegido es de otra, se descarta
//   elegir CONDUCTOR     -> su compañía; si la ruta elegida es de otra, se descarta
//   elegir TRANSPORTISTA -> filtra rutas, conductores y vehículos; descarta lo que ya no pertenece
//
// Por qué es un módulo puro y no lógica de componente: el defecto más caro del formulario era que
// cambiar de transportista NO recalculaba — el selector decidía a quién se le paga, pero el cálculo
// seguía usando el transportista original de la ruta. Con la máquina acá, "cambio de compañía ⇒ se
// descarta la ruta incompatible ⇒ cambia el partyId ⇒ hay que recalcular" se prueba con objetos
// planos, sin montar un formulario.

import type { DriverDef, RouteDef } from './types';

/** Compañía, en la forma mínima que el formulario necesita. */
export interface PartyOption {
  id: string;
  name: string;
  classification: 'OWN' | 'OUTSOURCED';
  status: string;
}

export interface VehicleOption {
  code: string;
  name: string;
  /**
   * Capacidad del vehículo. Viaja junto al código porque es de donde salen `truckVolumeM3` y
   * `truckWeightTons` del viaje: elegir el vehículo y no arrastrar su capacidad dejaba toda regla
   * por volumen o tonelaje en cero, sin ninguna señal.
   */
  volumeM3?: number;
  weightTons?: number;
}

export interface FormCatalogs {
  parties: PartyOption[];
  routes: RouteDef[];
  drivers: DriverDef[];
  /** Vehículos de la compañía actualmente elegida. */
  vehicleTypes: VehicleOption[];
}

/** Lo que el formulario tiene elegido en un momento dado. */
export interface SettlementDraft {
  partyId: string | null;
  routeId: string | null;
  driverId: string | null;
  truckTypeCode: string | null;
}

export const emptyDraft = (): SettlementDraft => ({
  partyId: null,
  routeId: null,
  driverId: null,
  truckTypeCode: null,
});

/** Qué se descartó al aplicar un cambio, para poder decirlo en pantalla en vez de borrarlo callado. */
export interface DraftChange {
  draft: SettlementDraft;
  /** Campos que se limpiaron porque ya no pertenecen a la compañía resultante. */
  cleared: ('routeId' | 'driverId' | 'truckTypeCode')[];
}

// ── Qué se puede elegir ───────────────────────────────────────────────────────────────────────

/**
 * Sin compañía elegida se ofrece TODO, no nada.
 *
 * Es deliberado: la guía trae la ruta o el conductor, casi nunca la compañía. Obligar a elegirla
 * primero invertiría el orden en que la gente tiene los datos.
 */
export function availableRoutes(catalogs: FormCatalogs, partyId: string | null): RouteDef[] {
  return catalogs.routes.filter((r) => r.active && (!partyId || r.partyId === partyId));
}

export function availableDrivers(catalogs: FormCatalogs, partyId: string | null): DriverDef[] {
  return catalogs.drivers.filter((d) => d.active && (!partyId || d.partyId === partyId));
}

export function availableVehicleTypes(catalogs: FormCatalogs, partyId: string | null): VehicleOption[] {
  // Los vehículos SÍ exigen compañía: son su catálogo, y sin ella no hay lista que mostrar.
  return partyId ? catalogs.vehicleTypes : [];
}

// ── Las tres puertas de entrada ───────────────────────────────────────────────────────────────

/** Deja en el borrador sólo lo que pertenece a `partyId`, y dice qué se descartó. */
function reconcile(
  draft: SettlementDraft,
  partyId: string | null,
  catalogs: FormCatalogs,
): DraftChange {
  const cleared: DraftChange['cleared'] = [];
  const next: SettlementDraft = { ...draft, partyId };

  if (next.routeId) {
    const ruta = catalogs.routes.find((r) => r.id === next.routeId);
    if (!ruta || (partyId && ruta.partyId !== partyId)) {
      next.routeId = null;
      cleared.push('routeId');
    }
  }

  if (next.driverId) {
    const conductor = catalogs.drivers.find((d) => d.id === next.driverId);
    if (!conductor || (partyId && conductor.partyId !== partyId)) {
      next.driverId = null;
      cleared.push('driverId');
    }
  }

  if (next.truckTypeCode) {
    // El catálogo de vehículos es por compañía: un código que no está en el de la compañía nueva
    // dejaría el viaje sin capacidad, y las reglas por volumen valdrían cero sin avisar.
    const existe = partyId && catalogs.vehicleTypes.some((v) => v.code === next.truckTypeCode);
    if (!existe) {
      next.truckTypeCode = null;
      cleared.push('truckTypeCode');
    }
  }

  return { draft: next, cleared };
}

export function applyPartySelection(
  draft: SettlementDraft,
  partyId: string | null,
  catalogs: FormCatalogs,
): DraftChange {
  return reconcile(draft, partyId, catalogs);
}

/** Elegir la ruta arrastra su compañía. Es la puerta más común: la guía trae el código de ruta. */
export function applyRouteSelection(
  draft: SettlementDraft,
  routeId: string | null,
  catalogs: FormCatalogs,
): DraftChange {
  if (!routeId) return { draft: { ...draft, routeId: null }, cleared: [] };

  const ruta = catalogs.routes.find((r) => r.id === routeId);
  if (!ruta) return { draft: { ...draft, routeId: null }, cleared: [] };

  const { draft: reconciliado, cleared } = reconcile(draft, ruta.partyId, catalogs);
  return { draft: { ...reconciliado, routeId }, cleared: cleared.filter((c) => c !== 'routeId') };
}

/** Elegir el conductor arrastra su compañía: la guía trae su nombre y cédula, no la empresa. */
export function applyDriverSelection(
  draft: SettlementDraft,
  driverId: string | null,
  catalogs: FormCatalogs,
): DraftChange {
  if (!driverId) return { draft: { ...draft, driverId: null }, cleared: [] };

  const conductor = catalogs.drivers.find((d) => d.id === driverId);
  if (!conductor) return { draft: { ...draft, driverId: null }, cleared: [] };

  const { draft: reconciliado, cleared } = reconcile(draft, conductor.partyId, catalogs);
  return { draft: { ...reconciliado, driverId }, cleared: cleared.filter((c) => c !== 'driverId') };
}

export function applyVehicleSelection(
  draft: SettlementDraft,
  truckTypeCode: string | null,
): SettlementDraft {
  return { ...draft, truckTypeCode };
}

// ── Qué falta y qué no cierra ─────────────────────────────────────────────────────────────────

export type DraftProblemCode =
  | 'SIN_COMPANIA'
  | 'SIN_RUTA'
  | 'SIN_CONDUCTOR'
  | 'SIN_VEHICULO'
  | 'COMPANIA_INACTIVA'
  | 'CONFLICTO_DE_COMPANIA';

export interface DraftProblem {
  code: DraftProblemCode;
  message: string;
  /** Un problema bloqueante impide emitir; el resto son avisos. */
  blocking: boolean;
}

/**
 * Qué le falta al borrador para poder liquidar.
 *
 * El conflicto de compañía —conductor de una, ruta de otra— es bloqueante y no un aviso: el viaje
 * se tarifaría contra una de las dos, y cuál es cuestión del orden en que se tocaron los campos.
 */
export function draftProblems(draft: SettlementDraft, catalogs: FormCatalogs): DraftProblem[] {
  const problems: DraftProblem[] = [];

  const ruta = draft.routeId ? catalogs.routes.find((r) => r.id === draft.routeId) : null;
  const conductor = draft.driverId ? catalogs.drivers.find((d) => d.id === draft.driverId) : null;

  if (ruta && conductor && ruta.partyId !== conductor.partyId) {
    const nombre = (id: string) => catalogs.parties.find((p) => p.id === id)?.name ?? id;
    problems.push({
      code: 'CONFLICTO_DE_COMPANIA',
      message: `La ruta es de ${nombre(ruta.partyId)} y el conductor de ${nombre(conductor.partyId)}. `
        + 'Elegí a cuál de las dos se le liquida.',
      blocking: true,
    });
  }

  if (!draft.partyId) {
    problems.push({
      code: 'SIN_COMPANIA',
      message: 'Falta la compañía a la que se le liquida.',
      blocking: true,
    });
  } else {
    const party = catalogs.parties.find((p) => p.id === draft.partyId);
    if (party && party.status !== 'active') {
      problems.push({
        code: 'COMPANIA_INACTIVA',
        message: `${party.name} está dada de baja: revisá si corresponde liquidarle este viaje.`,
        blocking: true,
      });
    }
  }

  if (!draft.routeId) {
    problems.push({
      code: 'SIN_RUTA',
      message: 'Elegí la ruta: de ella salen las zonas, los kilómetros, las paradas y los peajes.',
      blocking: true,
    });
  }

  if (!draft.driverId) {
    problems.push({
      code: 'SIN_CONDUCTOR',
      message: 'Falta el conductor. La guía física trae su nombre y su cédula.',
      blocking: true,
    });
  }

  if (!draft.truckTypeCode) {
    // NO bloquea: hay viajes que se liquidan sin que el vehículo importe. Pero avisa, porque sin él
    // toda regla por volumen o tonelaje vale cero en silencio.
    problems.push({
      code: 'SIN_VEHICULO',
      message: 'Sin vehículo elegido, las reglas por volumen o capacidad no se aplican.',
      blocking: false,
    });
  }

  return problems;
}

export function isDraftReady(draft: SettlementDraft, catalogs: FormCatalogs): boolean {
  return !draftProblems(draft, catalogs).some((p) => p.blocking);
}
