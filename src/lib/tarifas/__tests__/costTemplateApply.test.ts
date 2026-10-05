// @vitest-environment jsdom
//
// Aplicar una plantilla deja la estructura del ámbito con exactamente sus filas, y el motor la usa.

import { beforeEach, describe, expect, it } from 'vitest';
import { activeStructure, applyCostTemplate, listRows } from '../costStructureDataSource';
import { costTemplateSheets, parseCostTemplate } from '../costTemplate';
import { loadTarifasCatalog } from '../catalogLoader';

beforeEach(() => { localStorage.clear(); });

const plantilla = () => {
  const parsed = parseCostTemplate(costTemplateSheets());
  if (parsed.errors.length > 0) throw new Error(JSON.stringify(parsed.errors));
  return parsed;
};

describe('aplicar plantilla a la estructura por defecto del país', () => {
  it('reemplaza la estructura anterior y el catálogo la entrega al motor', async () => {
    const t = plantilla();
    const aplicar = () => applyCostTemplate({
      partyId: null, countryId: 'VE', name: 'Flota propia VE', operatingDaysPerMonth: t.operatingDays ?? 30,
      params: t.params, rows: t.rows,
    });

    const first = await aplicar();
    expect(first.status).toBe('saved');
    const second = await aplicar();
    expect(second.status).toBe('saved');
    if (first.status !== 'saved' || second.status !== 'saved') return;

    // Una sola estructura activa por país, con las filas de la plantilla y nada más.
    const activa = await activeStructure(null, 'VE');
    expect(activa?.id).toBe(second.structureId);
    expect(await listRows(second.structureId)).toHaveLength(t.rows.length);

    const catalogo = await loadTarifasCatalog('VE', null);
    expect(catalogo.defaultCostStructure?.id).toBe(second.structureId);
    expect(catalogo.defaultCostStructureRows).toHaveLength(t.rows.length);
    expect(catalogo.defaultCostStructure?.params.kmPerYear).toBe(36000);
  });

  it('guarda los campos de componente y los parámetros', async () => {
    const t = plantilla();
    const r = await applyCostTemplate({
      partyId: null, countryId: 'VE', name: 'X', operatingDaysPerMonth: 30, params: t.params, rows: t.rows,
    });
    if (r.status !== 'saved') throw new Error('no guardó');
    const filas = await listRows(r.structureId);
    const bateria = filas.find((f) => f.label === 'Batería')!;
    expect(bateria).toMatchObject({ frequency: 'year', frequencyQty: 2, truckType: 'Camión mediano', group: 'mantenimiento' });
    expect(Number(bateria.costPerKm)).toBeCloseTo(90400 / (2 * 36000), 4);
  });

  it('rechaza sin nombre o sin días operativos', async () => {
    const t = plantilla();
    const r = await applyCostTemplate({
      partyId: null, countryId: 'VE', name: '', operatingDaysPerMonth: 0, params: t.params, rows: t.rows,
    });
    expect(r.status).toBe('failed');
  });
});
