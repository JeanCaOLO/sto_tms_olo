// La máquina de dependencias del alta de liquidación.
//
// El defecto que cierra: cambiar de transportista en el formulario **no recalculaba**. El selector
// decidía a quién se le paga, pero el cálculo seguía usando el transportista original de la ruta —
// con sus reglas, su tarifario y sus variables.
//
// Con la máquina en un módulo puro, la cadena entera —"cambio de compañía ⇒ se descarta la ruta
// incompatible ⇒ cambia el partyId ⇒ hay que recalcular"— se prueba con objetos planos.

import { describe, expect, it } from 'vitest';
import {
  applyDriverSelection, applyPartySelection, applyRouteSelection, applyVehicleSelection,
  availableDrivers, availableRoutes, availableVehicleTypes, draftProblems, emptyDraft,
  isDraftReady, type FormCatalogs, type SettlementDraft,
} from '../settlementForm';
import type { DriverDef, RouteDef } from '../types';

const ruta = (id: string, partyId: string, code: string, active = true): RouteDef => ({
  id, countryId: 'VE', partyId, code, name: code,
  originZoneId: 'Z_CAR', destZoneId: 'Z_CCS',
  km: 180, stopCount: 40, packageCount: 120, weightKg: 1200,
  tollCount: 3, tollsAmount: '60', durationHours: 4, notes: null, active,
});

const conductor = (id: string, partyId: string, fullName: string, active = true): DriverDef => ({
  id, countryId: 'VE', partyId, fullName, document: null, phone: null,
  license: null, licenseExpiresAt: null, notes: null, active,
});

const CATALOGOS: FormCatalogs = {
  parties: [
    { id: 'P_A', name: 'Transporte Andino', classification: 'OUTSOURCED', status: 'active' },
    { id: 'P_B', name: 'Logística del Centro', classification: 'OUTSOURCED', status: 'active' },
    { id: 'P_BAJA', name: 'Cargas del Sur', classification: 'OUTSOURCED', status: 'inactive' },
  ],
  routes: [ruta('R_A1', 'P_A', 'CAR-CCS'), ruta('R_A2', 'P_A', 'CAR-ZUL'), ruta('R_B1', 'P_B', 'CCS-ZUL')],
  drivers: [conductor('D_A1', 'P_A', 'José Ramírez'), conductor('D_B1', 'P_B', 'María Pérez')],
  vehicleTypes: [{ code: 'NPR', name: 'Isuzu NPR' }, { code: 'FRR', name: 'Isuzu FRR' }],
};

// ── Qué se ofrece ─────────────────────────────────────────────────────────────────────────────

describe('lo que se puede elegir', () => {
  it('sin compañía se ofrece TODO, no nada', () => {
    // La guía trae la ruta o el conductor, casi nunca la compañía: obligar a elegirla primero
    // invertiría el orden en que la gente tiene los datos.
    expect(availableRoutes(CATALOGOS, null)).toHaveLength(3);
    expect(availableDrivers(CATALOGOS, null)).toHaveLength(2);
  });

  it('con compañía se acota a la suya', () => {
    expect(availableRoutes(CATALOGOS, 'P_A').map((r) => r.code)).toEqual(['CAR-CCS', 'CAR-ZUL']);
    expect(availableDrivers(CATALOGOS, 'P_A').map((d) => d.fullName)).toEqual(['José Ramírez']);
  });

  it('las rutas y conductores de baja no se ofrecen', () => {
    const conBajas: FormCatalogs = {
      ...CATALOGOS,
      routes: [ruta('R_X', 'P_A', 'VIEJA', false)],
      drivers: [conductor('D_X', 'P_A', 'Retirado', false)],
    };
    expect(availableRoutes(conBajas, 'P_A')).toHaveLength(0);
    expect(availableDrivers(conBajas, 'P_A')).toHaveLength(0);
  });

  it('los vehículos SÍ exigen compañía: son su catálogo', () => {
    expect(availableVehicleTypes(CATALOGOS, null)).toHaveLength(0);
    expect(availableVehicleTypes(CATALOGOS, 'P_A')).toHaveLength(2);
  });
});

// ── Las tres puertas de entrada ───────────────────────────────────────────────────────────────

describe('elegir la RUTA arrastra su compañía', () => {
  it('fija el transportista', () => {
    const { draft } = applyRouteSelection(emptyDraft(), 'R_A1', CATALOGOS);
    expect(draft.partyId).toBe('P_A');
    expect(draft.routeId).toBe('R_A1');
  });

  it('descarta el conductor que ya no pertenece, y lo dice', () => {
    const inicial: SettlementDraft = { ...emptyDraft(), partyId: 'P_B', driverId: 'D_B1' };
    const { draft, cleared } = applyRouteSelection(inicial, 'R_A1', CATALOGOS);

    expect(draft.partyId).toBe('P_A');
    expect(draft.driverId).toBeNull();
    expect(cleared).toContain('driverId');
  });

  it('conserva el conductor que sí pertenece', () => {
    const inicial: SettlementDraft = { ...emptyDraft(), partyId: 'P_A', driverId: 'D_A1' };
    const { draft, cleared } = applyRouteSelection(inicial, 'R_A2', CATALOGOS);

    expect(draft.driverId).toBe('D_A1');
    expect(cleared).toEqual([]);
  });
});

describe('elegir el CONDUCTOR arrastra su compañía', () => {
  it('fija el transportista', () => {
    // Es el caso de la guía física: trae el nombre y la cédula, no la empresa.
    const { draft } = applyDriverSelection(emptyDraft(), 'D_B1', CATALOGOS);
    expect(draft.partyId).toBe('P_B');
  });

  it('descarta la ruta que ya no pertenece', () => {
    const inicial: SettlementDraft = { ...emptyDraft(), partyId: 'P_A', routeId: 'R_A1' };
    const { draft, cleared } = applyDriverSelection(inicial, 'D_B1', CATALOGOS);

    expect(draft.partyId).toBe('P_B');
    expect(draft.routeId).toBeNull();
    expect(cleared).toContain('routeId');
  });
});

describe('elegir el TRANSPORTISTA filtra todo lo demás', () => {
  it('descarta ruta, conductor y vehículo que ya no pertenecen', () => {
    // Éste es el defecto que el módulo cierra: antes esto no pasaba, y el cálculo seguía usando el
    // transportista de la ruta.
    const inicial: SettlementDraft = {
      partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: 'NPR',
    };
    const { draft, cleared } = applyPartySelection(inicial, 'P_B', {
      ...CATALOGOS,
      // Al cambiar de compañía, el catálogo de vehículos es el de la nueva.
      vehicleTypes: [{ code: 'CABEZAL', name: 'Cabezal' }],
    });

    expect(draft.partyId).toBe('P_B');
    expect(draft.routeId).toBeNull();
    expect(draft.driverId).toBeNull();
    expect(draft.truckTypeCode).toBeNull();
    expect(cleared.sort()).toEqual(['driverId', 'routeId', 'truckTypeCode']);
  });

  it('no descarta nada si todo pertenece a la compañía nueva', () => {
    const inicial: SettlementDraft = {
      partyId: null, routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: 'NPR',
    };
    const { draft, cleared } = applyPartySelection(inicial, 'P_A', CATALOGOS);

    expect(cleared).toEqual([]);
    expect(draft).toMatchObject({ partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: 'NPR' });
  });

  it('limpiar la compañía no borra lo elegido', () => {
    // Sin compañía no hay contra qué comparar: borrar sería perder trabajo del usuario.
    const inicial: SettlementDraft = { partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: null };
    const { draft } = applyPartySelection(inicial, null, CATALOGOS);

    expect(draft.routeId).toBe('R_A1');
    expect(draft.driverId).toBe('D_A1');
  });

  it('un vehículo que no está en el catálogo de la compañía se descarta', () => {
    // Dejarlo haría que las reglas por volumen valieran cero sin avisar.
    const inicial: SettlementDraft = { ...emptyDraft(), truckTypeCode: 'AJENO' };
    const { draft, cleared } = applyPartySelection(inicial, 'P_A', CATALOGOS);

    expect(draft.truckTypeCode).toBeNull();
    expect(cleared).toContain('truckTypeCode');
  });
});

describe('elegir el vehículo', () => {
  it('no toca nada más', () => {
    const inicial: SettlementDraft = { partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: null };
    expect(applyVehicleSelection(inicial, 'NPR')).toEqual({ ...inicial, truckTypeCode: 'NPR' });
  });
});

// ── Qué falta ─────────────────────────────────────────────────────────────────────────────────

describe('draftProblems', () => {
  it('un borrador vacío no está listo y dice todo lo que falta', () => {
    const problems = draftProblems(emptyDraft(), CATALOGOS);
    expect(problems.map((p) => p.code).sort())
      .toEqual(['SIN_COMPANIA', 'SIN_CONDUCTOR', 'SIN_RUTA', 'SIN_VEHICULO']);
    expect(isDraftReady(emptyDraft(), CATALOGOS)).toBe(false);
  });

  it('el vehículo avisa pero NO bloquea', () => {
    // Hay viajes que se liquidan sin que el vehículo importe; pero sin él toda regla por volumen
    // vale cero en silencio, así que el aviso queda.
    const draft: SettlementDraft = { partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: null };
    const problems = draftProblems(draft, CATALOGOS);

    expect(problems.map((p) => p.code)).toEqual(['SIN_VEHICULO']);
    expect(problems[0]?.blocking).toBe(false);
    expect(isDraftReady(draft, CATALOGOS)).toBe(true);
  });

  it('conductor de una compañía y ruta de otra BLOQUEA', () => {
    // El viaje se tarifaría contra una de las dos, y cuál depende del orden en que se tocaron los
    // campos. Es exactamente la ambigüedad que hay que impedir.
    const draft: SettlementDraft = { partyId: 'P_A', routeId: 'R_A1', driverId: 'D_B1', truckTypeCode: 'NPR' };
    const conflicto = draftProblems(draft, CATALOGOS).find((p) => p.code === 'CONFLICTO_DE_COMPANIA');

    expect(conflicto?.blocking).toBe(true);
    expect(conflicto?.message).toContain('Transporte Andino');
    expect(conflicto?.message).toContain('Logística del Centro');
    expect(isDraftReady(draft, CATALOGOS)).toBe(false);
  });

  it('una compañía dada de baja bloquea', () => {
    const draft: SettlementDraft = { partyId: 'P_BAJA', routeId: null, driverId: null, truckTypeCode: null };
    const problema = draftProblems(draft, CATALOGOS).find((p) => p.code === 'COMPANIA_INACTIVA');

    expect(problema?.blocking).toBe(true);
    expect(problema?.message).toContain('Cargas del Sur');
  });

  it('un borrador completo está listo', () => {
    const draft: SettlementDraft = { partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: 'NPR' };
    expect(draftProblems(draft, CATALOGOS)).toEqual([]);
    expect(isDraftReady(draft, CATALOGOS)).toBe(true);
  });
});

// ── Pureza ────────────────────────────────────────────────────────────────────────────────────

describe('no muta el borrador recibido', () => {
  it('devuelve uno nuevo', () => {
    const inicial: SettlementDraft = { partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: 'NPR' };
    const { draft } = applyPartySelection(inicial, 'P_B', CATALOGOS);

    expect(draft).not.toBe(inicial);
    expect(inicial).toEqual({ partyId: 'P_A', routeId: 'R_A1', driverId: 'D_A1', truckTypeCode: 'NPR' });
  });
});
