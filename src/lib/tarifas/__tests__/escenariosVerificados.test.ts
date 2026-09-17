// @vitest-environment jsdom
//
// Los escenarios de demostración, verificados.
//
// El problema que resuelve: una plantilla de viaje demostraba que el motor CORRE, no que sigue
// calculando lo mismo que ayer. Cambiar el orden de una etapa, el redondeo de un país o la
// condición de una regla movía los totales de la demostración y nadie se enteraba hasta abrirla
// delante de alguien.
//
// Ahora cada plantilla declara su `expectedTotal` y este test recorre las que trae la semilla. Si
// un cambio de reglas mueve un total, el build se pone rojo acá, con el nombre del escenario y la
// diferencia — no una pantalla en blanco en una reunión.
//
// Un total que se movió A PROPÓSITO se arregla actualizando el `expectedTotal` de esa plantilla en
// `seed.json`. Eso es deliberado: obliga a mirar el número nuevo y decir "sí, ahora vale esto".

import { describe, expect, it } from 'vitest';
import { db } from '../data';
import { calculate } from '../index';
import { loadTarifasCatalog } from '../catalogLoader';
import { buildCalculateInput } from '../settlementInput';
import {
  checkScenario, describeCheck, normalizeTrip, toScenario, type TemplateScenario,
} from '../templateScenarios';

async function escenarios(): Promise<TemplateScenario[]> {
  const rows = await db().find('pricingTemplate');
  return rows.map((r) => toScenario(r as never));
}

function calcular(scenario: TemplateScenario) {
  const catalog = loadTarifasCatalog(scenario.countryId, scenario.trip.partyId);
  const { input, issues } = buildCalculateInput(catalog, scenario.trip);
  return { result: calculate(input), issues };
}

describe('escenarios de la semilla', () => {
  it('todos declaran un total esperado', async () => {
    // Una plantilla sin esperado no verifica nada: es una demostración que puede romperse callada.
    const sinEsperado = (await escenarios()).filter((s) => s.expectedTotal === null);
    expect(sinEsperado.map((s) => s.name)).toEqual([]);
  });

  it('cada uno sigue dando el total que declara', async () => {
    const movidos: string[] = [];

    for (const scenario of await escenarios()) {
      const { result } = calcular(scenario);
      const check = checkScenario(scenario, result.totalLiquidado);
      if (check.verdict !== 'OK') movidos.push(describeCheck(check));
    }

    expect(movidos).toEqual([]);
  });

  it('ninguno queda bloqueado ni con el viaje a medio armar', async () => {
    // Un escenario que no se puede emitir no demuestra el cálculo: demuestra un dato faltante.
    for (const scenario of await escenarios()) {
      const { result, issues } = calcular(scenario);
      expect([scenario.name, ...issues.map((i) => i.message)]).toEqual([scenario.name]);
      expect([scenario.name, ...result.blockingIssues.map((i) => i.message)]).toEqual([scenario.name]);
    }
  });
});

// ── Lo que cada escenario tiene que seguir ejercitando ────────────────────────────────────────
//
// El total solo no alcanza: podría seguir dando 474,00 con las recolectas apagadas y otra cosa
// compensando. Estas comprobaciones fijan QUÉ reglas lo componen.

describe('lo que demuestra cada escenario', () => {
  const buscar = async (id: string) => {
    const s = (await escenarios()).find((x) => x.id === id);
    if (!s) throw new Error(`falta la plantilla ${id}`);
    return { scenario: s, ...calcular(s) };
  };

  it('el escenario de terceros cobra las recolectas y las horas de espera', async () => {
    // Son las dos capacidades que valían CERO EN SILENCIO antes de la unificación: el formulario
    // no tenía dónde cargar recolectas ni variables por viaje.
    const { result } = await buscar('TPL_VE_2');
    const linea = (code: string) => result.trace.find((l) => l.ruleCode === code);

    expect(linea('R_RECOLECTAS')?.final).toBe('50.00'); // 2 recolectas x 25,00
    expect(linea('R_ESPERA')?.final).toBe('24.00');     // 3 horas x 8,00
  });

  it('el escenario de terceros toma la base del tarifario de zonas, no del respaldo', async () => {
    const { result } = await buscar('TPL_VE_2');
    const base = result.trace.find((l) => l.stage === 'BASE');

    expect(base?.tableMatch?.matchedKey).toBe('CAR | CCS');
    expect(result.warnings).toEqual([]); // sin fila, el motor avisa; acá no debe avisar
  });

  it('el escenario de flota propia se costea contra la estructura, no contra una tarifa de tercero', async () => {
    const { result } = await buscar('TPL_VE_1');

    expect(result.trace.map((l) => l.ruleCode)).toEqual(['R1', 'R2', 'R3']);
    expect(Number(result.cost.total)).toBeGreaterThan(0);
    // Fase 8: la flota propia de Venezuela ya tiene estructura de costos cargada (§4.1 decía
    // "construida, sin datos"). Antes de eso, este mismo assert pasaba igual pero por casualidad:
    // costeaba contra `ownCostParams` porque `costStructures` estaba vacío.
    expect(result.cost.modelId).toBe('CSTR_VE_OWN');
  });

  it('el escenario colombiano deja ver una pérdida, que es justo lo que la política debe detectar', async () => {
    // No es un error de la semilla: es el caso que hace visible el semáforo de margen.
    const { result } = await buscar('TPL_CO_1');
    expect(result.margin.status).toBe('LOSS');
  });
});

// ── Fase 8 — bordes y capacidades que la semilla no ejercitaba ───────────────────────────────
//
// C8 del ROADMAP: multi-país, flota propia con costos reales, escalones en sus tres modos,
// porcentaje/exclusividad/vigencia, y los bordes (lane sin fila, regla vencida, compañía sin
// catálogo de vehículos, tarifario con comodín). Cada `it` de acá referencia el escenario nuevo que
// lo demuestra, igual que el bloque de arriba.

describe('Fase 8 — lo que demuestran los escenarios nuevos', () => {
  const buscar = async (id: string) => {
    const s = (await escenarios()).find((x) => x.id === id);
    if (!s) throw new Error(`falta la plantilla ${id}`);
    return { scenario: s, ...calcular(s) };
  };

  it('TPL_VE_3: una lane sin fila propia resuelve por el comodín "*" del tarifario, no por el respaldo por km', async () => {
    const { result } = await buscar('TPL_VE_3');
    const base = result.trace.find((l) => l.stage === 'BASE');

    expect(base?.tableMatch?.matchedKey).toBe('* | CCS');
    expect(base?.tableMatch?.specificity).toBe(1);
    expect(base?.final).toBe('550.00');
    expect(result.warnings).toEqual([]);
  });

  it('TPL_CO_2: una lane sin ninguna fila cae al respaldo por km, no a cero', async () => {
    const { result } = await buscar('TPL_CO_2');
    const base = result.trace.find((l) => l.stage === 'BASE');

    expect(base?.tableMatch).toBeUndefined();
    expect(base?.ruleCode).toBe('R_ZONE_FALLBACK');
    expect(Number(base?.final)).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('no tiene fila'))).toBe(true);
  });

  it('TPL_CO_3: la variable personalizada por viaje descuenta por unidad, con el signo del efecto', async () => {
    const { result } = await buscar('TPL_CO_3');
    const linea = result.trace.find((l) => l.ruleCode === 'R_MATERIAL_AVERIADO');

    expect(linea?.final).toBe('-30000'); // 2 unidades averiadas × -15.000 COP
  });

  it('TPL_CO_3: la variable de texto por viaje activa el recargo de zona de riesgo', async () => {
    const { result } = await buscar('TPL_CO_3');
    expect(result.trace.find((l) => l.ruleCode === 'R_ZONA_RIESGO')?.final).toBe('50000');
  });

  it('TPL_CO_3: los escalones RATE y PROGRESSIVE de la compañía se aplican los dos', async () => {
    const { result } = await buscar('TPL_CO_3');
    const codigos = result.trace.map((l) => l.ruleCode);

    expect(codigos).toContain('R_PESO_ESCALON');       // modo RATE
    expect(codigos).toContain('R_PARADAS_PROGRESIVA');  // modo PROGRESSIVE
  });

  it('TPL_CR_2 / TPL_CR_3: una regla vencida sigue liquidando bien un viaje de su período, y ya no el de hoy', async () => {
    const vigente = await buscar('TPL_CR_2'); // viaje de diciembre 2025, dentro de la promo
    const vencida = await buscar('TPL_CR_3'); // mismo transportista y lane, viaje de 2026

    expect(vigente.result.trace.map((l) => l.ruleCode)).toContain('R_PROMO_LANZAMIENTO');
    expect(vencida.result.trace.map((l) => l.ruleCode)).not.toContain('R_PROMO_LANZAMIENTO');

    const descarte = vencida.result.discarded.find((d) => d.ruleCode === 'R_PROMO_LANZAMIENTO');
    expect(descarte?.reason).toBe('OUT_OF_PERIOD');

    // La diferencia entre los dos totales es exactamente el descuento de la promo: no desapareció,
    // dejó de estar vigente.
    expect(Number(vencida.result.totalLiquidado) - Number(vigente.result.totalLiquidado)).toBe(8000);
  });

  it('una compañía sin catálogo de vehículos no rompe el cálculo y avisa (borde C8)', () => {
    // SP_CO_OWN es flota propia y, a propósito, NO tiene ninguna fila en `partyVehicleTypes` —
    // el mismo estado en el que queda cualquier compañía nueva antes de cargar su catálogo.
    const catalog = loadTarifasCatalog('CO', 'SP_CO_OWN');
    expect(catalog.partyVehicleTypes).toEqual([]);

    const trip = normalizeTrip({
      partyId: 'SP_CO_OWN',
      quotedAt: '2026-03-16T12:00:00.000Z',
      originLocationId: 'Z_CO_BOG',
      destLocationId: 'Z_CO_MED',
      km: 415,
      clientCount: 30,
      truckTypeId: 'TT-350',
      fleetType: 'OWN',
    }, 'CO');

    const { input, issues, warnings } = buildCalculateInput(catalog, trip);
    expect(issues).toEqual([]);

    // No revienta, la capacidad del camión queda en 0 —no hay de dónde derivarla— y ahora SÍ avisa:
    // un catálogo enteramente vacío es indistinguible en sus efectos de un código que no está en el
    // catálogo, así que `settlementInput.ts` avisa en los dos casos (antes sólo avisaba cuando el
    // catálogo tenía algo y el código no calzaba).
    expect(() => calculate(input)).not.toThrow();
    expect(input.trip.truckVolumeM3).toBe(0);
    expect(input.trip.truckWeightTons).toBe(0);
    expect(warnings.some((w) => w.includes('no tiene catálogo de vehículos cargado'))).toBe(true);
  });
});
