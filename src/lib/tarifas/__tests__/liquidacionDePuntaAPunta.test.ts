// @vitest-environment jsdom
//
// El recorrido completo con los datos de la semilla (ROADMAP §8): un viaje COMPLETADO de guía de
// despacho aparece en la bandeja, se calcula con sus datos tal cual vienen, se cargan solo las
// variables por viaje, se emite, y se re-liquida dejando historial.
//
// Es la prueba de que las piezas encajan. Cada una tiene sus tests; ésta verifica que juntas hacen
// lo que el módulo promete: el viaje no se teclea, y todo se lee por la capa de datos.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateTrip, type TripCalculation } from '../tripSettlement';
import { listLiquidableTrips, getTrip } from '../tripsDataSource';
import {
  emitSettlement, getSettlement, listTripSettlements, reliquidateSettlement, type SettlementInput,
} from '../settlementsDataSource';
import { deactivateParty } from '../partiesDataSource';
import { parseCustomVarValues } from '../customVarFields';
import { calculate } from '../index';
import { computeSettlementTotals, resultWithTotal } from '../settlementTotals';
import { db } from '../data';
import { explainResult } from '../explain';
import type { TripEdits, TripRecord } from '../types';

beforeEach(() => { localStorage.clear(); });

/** El viaje de la semilla del transportista CARRIER_VE_1 (lane Carabobo → Caracas). */
async function viajeDeTercero(): Promise<TripRecord> {
  const viajes = await listLiquidableTrips({ countryId: 'VE', carrierId: 'CARRIER_VE_1' });
  const viaje = viajes[0];
  if (!viaje) throw new Error('la semilla no trae viajes de CARRIER_VE_1');
  return viaje;
}

async function calcular(trip: TripRecord, edits: TripEdits = { customVars: {} }): Promise<TripCalculation> {
  const r = await calculateTrip(trip, edits);
  if (r.status !== 'ok') throw new Error(`no se pudo calcular: ${r.status}`);
  return r.calculation;
}

function aEmitir(c: TripCalculation, edits: TripEdits): SettlementInput {
  return {
    trip: c.trip,
    partyId: c.partyId,
    edits,
    status: 'Borrador',
    notes: null,
    marginReason: null,
    context: c.context,
    calc: c.result,
    totalAmount: c.result.totalLiquidado,
  };
}

describe('la bandeja de viajes por liquidar', () => {
  it('trae los viajes completados y no los planificados', async () => {
    const viajes = await listLiquidableTrips({ countryId: 'VE' });
    expect(viajes.length).toBeGreaterThan(0);
    expect(viajes.every((v) => v.status === 'completed')).toBe(true);
    expect(viajes.map((v) => v.id)).not.toContain('TRIP_PLANIFICADO_1');
  });
});

describe('el cálculo toma el viaje tal cual viene', () => {
  it('km, paradas, peso, flota, vehículo y zona salen del viaje', async () => {
    const viaje = await viajeDeTercero();
    const c = await calcular(viaje);

    expect(c.context.km).toBe(viaje.km);
    expect(c.context.clientCount).toBe(viaje.completedStops);
    expect(c.context.weightKg).toBe(viaje.weightKg);
    expect(c.context.fleetType).toBe('OUTSOURCED');
    expect(c.context.truckTypeId).toBe(viaje.vehicleType);
    expect(c.context.truckWeightTons).toBe(viaje.capacityWeightKg / 1000);
    expect(c.context.destLocationId).toBe(viaje.destZoneId);
    expect(c.context.originLocationId).toBe('');
    // El perfil de cálculo del transportista se resuelve solo.
    expect(c.partyId).toBe('CARRIER_VE_1');
    expect(c.notLiquidableReason).toBeNull();
  });

  it('ofrece como campos las variables por viaje del perfil (peajes, recolectas, espera…)', async () => {
    const c = await calcular(await viajeDeTercero());
    const claves = c.customVarFields.map((f) => f.key);
    expect(claves).toContain('custom:recolectas');
    expect(claves).toContain('custom:horas_espera');
  });

  it('lo cargado a mano suma con las reglas de SU transportista', async () => {
    const viaje = await viajeDeTercero();
    const sin = await calcular(viaje);

    const campos = sin.customVarFields;
    const { values, errors } = parseCustomVarValues(campos, { 'custom:recolectas': '2', 'custom:horas_espera': '3' });
    expect(errors).toEqual({});
    const con = await calcular(viaje, { customVars: values });

    const linea = (code: string) => con.result.trace.find((l) => l.ruleCode === code)?.final;
    expect(linea('R_RECOLECTAS')).toBe('50.00'); // 2 × 25
    expect(linea('R_ESPERA')).toBe('24.00');     // 3 × 8
  });

  it('el desglose explica cada línea', async () => {
    const c = await calcular(await viajeDeTercero());
    const explicacion = explainResult(c.result, { rules: c.input.rules });
    expect(explicacion.stages.length).toBeGreaterThan(0);
    expect(explicacion.total).toBe(c.result.totalLiquidado);
  });

  it('un transportista sin perfil activo se liquida solo con las reglas del país', async () => {
    const viaje = await viajeDeTercero();
    await deactivateParty('CARRIER_VE_1');
    const c = await calcular(viaje);
    expect(c.partyId).toBeNull();
    expect(c.result.trace.map((l) => l.ruleCode)).not.toContain('R_RECOLECTAS');
  });
});

describe('emitir y re-liquidar', () => {
  it('emite, saca el viaje de la bandeja y guarda la foto del viaje', async () => {
    const viaje = await viajeDeTercero();
    const edits: TripEdits = { customVars: { 'custom:recolectas': 2 } };
    const c = await calcular(viaje, edits);

    const result = await emitSettlement(aEmitir(c, edits));
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;

    const guardada = await getSettlement(result.settlement.id);
    expect(guardada?.tripInfo.routeNumber).toBe(viaje.routeNumber);
    expect(guardada?.tripEdits).toEqual(edits);
    expect(guardada?.totalAmount).toBe(c.result.totalLiquidado);

    expect((await listLiquidableTrips({ countryId: 'VE' })).map((v) => v.id)).not.toContain(viaje.id);
    // Calcular de nuevo avisa que ya está liquidado: el camino es re-liquidar.
    expect((await calcular((await getTrip(viaje.id))!)).notLiquidableReason).toContain('re-liquidalo');
  });

  it('re-liquidar con otras variables deja la vieja anulada y la nueva vigente', async () => {
    const viaje = await viajeDeTercero();
    const primeras: TripEdits = { customVars: { 'custom:recolectas': 1 } };
    const emitida = await emitSettlement(aEmitir(await calcular(viaje, primeras), primeras));
    if (emitida.status !== 'saved') throw new Error('no se emitió');

    const corregidas: TripEdits = { customVars: { 'custom:recolectas': 3 } };
    const recalculo = await calculateTrip((await getTrip(viaje.id))!, corregidas, { allowSettled: true });
    if (recalculo.status !== 'ok') throw new Error('no se recalculó');
    expect(recalculo.calculation.notLiquidableReason).toBeNull();

    const nueva = await reliquidateSettlement(
      emitida.settlement.id, aEmitir(recalculo.calculation, corregidas), 'Faltaban dos recolectas',
    );
    expect(nueva.status).toBe('saved');
    if (nueva.status !== 'saved') return;

    // 2 recolectas más × 25.
    expect(Number(nueva.settlement.totalAmount) - Number(emitida.settlement.totalAmount)).toBe(50);

    const historial = await listTripSettlements(viaje.id);
    expect(historial.map((s) => s.status).sort()).toEqual(['Anulado', 'Borrador']);
    expect(historial.find((s) => s.status === 'Anulado')?.supersededBy).toBe(nueva.settlement.id);
  });

  it('destildar una línea baja el total emitido', async () => {
    const viaje = await viajeDeTercero();
    const c = await calcular(viaje, { customVars: { 'custom:recolectas': 2 } });
    const recolectas = c.result.trace.find((l) => l.ruleCode === 'R_RECOLECTAS');
    if (!recolectas) throw new Error('falta la línea de recolectas');

    const totales = computeSettlementTotals(c.result.trace, [recolectas.seq], c.input.country);
    expect(Number(c.result.totalLiquidado) - Number(totales.total)).toBe(50);
  });

  it('destildar una línea recalcula la ganancia y el reparto contra el total que se paga', async () => {
    const viaje = await viajeDeTercero();
    const cargo = {
      value: '5000.00', weightKg: 300, volumeM3: 3, orders: 2,
      parts: [
        { customerId: 'A', code: 'EPA', name: 'EPA', value: '3000.00', weightKg: 100, volumeM3: 1, items: 2, orders: 1 },
        { customerId: 'B', code: 'COF', name: 'Cofersa', value: '2000.00', weightKg: 200, volumeM3: 2, items: 3, orders: 1 },
      ],
    };
    const c = await calcular(viaje, { customVars: { 'custom:recolectas': 2 } });
    const input = { ...c.input, cargo };
    const recolectas = c.result.trace.find((l) => l.ruleCode === 'R_RECOLECTAS');
    if (!recolectas) throw new Error('falta la línea de recolectas');

    const base = calculate({ ...input });
    const totales = computeSettlementTotals(base.trace, [recolectas.seq], input.country);
    const ajustado = resultWithTotal(base, totales, input);

    expect(ajustado.totalLiquidado).toBe(totales.total);
    expect(ajustado.margin.expense).toBe(totales.total);
    expect(Number(ajustado.margin.amount)).toBe(5000 - Number(totales.total));
    expect(Number(ajustado.margin.amount)).toBeGreaterThan(Number(base.margin.amount));
    // El reparto sigue cuadrando al centavo y reparte el total editado, 60 % / 40 %.
    expect(ajustado.allocation?.total).toBe(totales.total);
    const [epa, cof] = ajustado.allocation!.shares;
    expect(Number(epa.amount) + Number(cof.amount)).toBeCloseTo(Number(totales.total), 2);
    expect(Number(epa.share)).toBeCloseTo(0.6, 6);
    // Sin exclusiones no cambia nada.
    const sinCambios = computeSettlementTotals(base.trace, [], input.country);
    expect(resultWithTotal(base, sinCambios, input)).toBe(base);
  });

  it('una flota propia sin estructura de costos se informa como falta de catálogo, no como excepción', async () => {
    const viaje = (await listLiquidableTrips({ countryId: 'VE' })).find((t) => t.isOwnFleet === true);
    if (!viaje) return; // la semilla no trae un viaje de flota propia completado
    for (const e of ['costStructure'] as const) {
      for (const r of await db().find(e)) await db().delete(e, r.id);
    }
    const r = await calculateTrip(viaje, { customVars: {} });
    expect(r.status).toBe('catalog-error');
    if (r.status === 'catalog-error') expect(r.message).toMatch(/estructura de costos/i);
  });
});

describe('mercancía del viaje ilegible', () => {
  it('si no se puede leer la mercancía, el cálculo sigue (lo que se paga no cambia) y avisa', async () => {
    const viaje = await viajeDeTercero();
    const normal = await calcular(viaje);
    const original = db().find.bind(db());
    const spy = vi.spyOn(db(), 'find').mockImplementation(async (entity, options) => {
      if (entity === 'tripOrder') throw new Error('Tabla desconocida para el tarifador: "tarifas_v_viaje_pedidos"');
      return original(entity, options);
    });
    try {
      const sinCarga = await calcular(viaje);
      expect(sinCarga.result.totalLiquidado).toBe(normal.result.totalLiquidado);
      expect(sinCarga.warnings.some((w) => /mercancía del viaje/.test(w))).toBe(true);
      expect(sinCarga.result.margin.basis).toBe('NONE');
    } finally {
      spy.mockRestore();
    }
  });
});
