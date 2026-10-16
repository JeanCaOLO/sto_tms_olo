// La plantilla de estructura de costos: se genera, se llena y se lee sin perder ni inventar nada.

import { describe, expect, it } from 'vitest';
import { costTemplateSheets, parseCostTemplate, type SheetMatrix } from '../costTemplate';
import { COMPONENTES_CR, FIJOS_CR, PARAMETROS_CR } from './fixtures/costaRicaFleet';

/** La estructura de Costa Rica escrita en el formato de la plantilla, tal como la llenaría una persona. */
function plantillaCR(): Record<string, SheetMatrix> {
  const variables: SheetMatrix = [['componente', 'tipo_camion', 'frecuencia', 'cantidad_frecuencia', 'costo', 'unidad_componente']];
  for (const [nombre, frecuencia, unidades, porTipo] of COMPONENTES_CR) {
    for (const tipo of ['T1', 'T3', 'T5'] as const) {
      variables.push([nombre, tipo, frecuencia, porTipo[tipo][0], porTipo[tipo][1], unidades]);
    }
  }
  return {
    Variables: variables,
    Fijos: [
      ['concepto', 'monto_mensual', 'aplica_a', 'tipo_camion', 'valor_vehiculo', 'vida_meses'],
      ['Costos del conductor', FIJOS_CR.conductor, 'conductor', '', '', ''],
      ['Costos del ayudante', FIJOS_CR.ayudante, 'ayudante', '', '', ''],
      ['Depreciación', '', 'depreciacion', 'T1', 10000000, 60],
      ['Depreciación', '', 'depreciacion', 'T3', 20000000, 72],
      ['Depreciación', '', 'depreciacion', 'T5', 35000000, 72],
    ],
    Parámetros: [
      ['clave', 'valor'],
      ['dias_operativos', PARAMETROS_CR.diasOperativos],
      ['km_anual', PARAMETROS_CR.kmAnual],
      ['precio_combustible', PARAMETROS_CR.precioDiesel],
      ['rendimiento_km_litro:T1', 8.5],
      ['rendimiento_km_litro:T3', 6],
      ['rendimiento_km_litro:T5', 4.2],
    ],
  };
}

describe('la plantilla vacía', () => {
  it('se lee sin errores (los ejemplos son válidos)', () => {
    const r = parseCostTemplate(costTemplateSheets());
    expect(r.errors).toEqual([]);
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

describe('estructura de Costa Rica cargada por plantilla', () => {
  const r = parseCostTemplate(plantillaCR(), { knownTruckTypes: ['T1', 'T3', 'T5'] });

  it('no tiene errores ni avisos', () => {
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('trae 40 componentes por camión + 5 filas fijas', () => {
    expect(r.rows.filter((x) => x.frequency)).toHaveLength(120);
    expect(r.rows.filter((x) => x.driver === 'PER_MONTH_PRORATED')).toHaveLength(5);
  });

  it('el resumen del camión T3 coincide con la planilla: 48.8118 por km y 57,525.69 al día', () => {
    const t3 = r.summary.find((s) => s.truckType === 'T3')!;
    expect(Number(t3.variablePerKm)).toBeCloseTo(48.8118, 2);
    expect(Number(t3.fixedDaily)).toBeCloseTo(57525.69, 2);
    expect(Number(t3.fuelPerKm)).toBeCloseTo(635 / 6, 3);
  });

  it('la depreciación sale de valor ÷ vida útil', () => {
    const dep = r.rows.find((x) => x.label === 'Depreciación' && x.truckType === 'T3')!;
    expect(Number(dep.amount)).toBeCloseTo(20000000 / 72, 2);
  });

  it('la fila del ayudante solo cuenta si el viaje lo declara', () => {
    const ayudante = r.rows.find((x) => x.group === 'ayudante')!;
    expect(ayudante.appliesWhen).toEqual({ p: 'GT', left: 'custom:con_ayudante', right: 0 });
  });

  it('guarda el costo por km derivado y los códigos son únicos', () => {
    const agua = r.rows.find((x) => x.label === 'Filtro de Agua' && x.truckType === 'T3')!;
    expect(Number(agua.costPerKm)).toBeCloseTo(0.7533, 4);
    const codigos = r.rows.map((x) => x.code);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

describe('errores y avisos con hoja y fila', () => {
  const con = (cambio: (s: Record<string, SheetMatrix>) => void) => {
    const s = plantillaCR();
    cambio(s);
    return parseCostTemplate(s, { knownTruckTypes: ['T1', 'T3', 'T5'] });
  };

  it('frecuencia inválida', () => {
    const r = con((s) => { s.Variables[1][2] = 'cada rato'; });
    expect(r.errors).toContainEqual(expect.objectContaining({ sheet: 'Variables', row: 2 }));
    expect(r.errors[0].message).toMatch(/frecuencia/);
  });

  it('costo no numérico', () => {
    const r = con((s) => { s.Variables[2][4] = 'caro'; });
    expect(r.errors.some((e) => e.row === 3 && /costo/.test(e.message))).toBe(true);
  });

  it('frecuencia anual sin km_anual', () => {
    const r = con((s) => { s.Parámetros = s.Parámetros.filter((row) => row[0] !== 'km_anual'); });
    expect(r.errors.some((e) => /km_anual/.test(e.message))).toBe(true);
  });

  it('sin días operativos no se puede prorratear', () => {
    const r = con((s) => { s.Parámetros = s.Parámetros.filter((row) => row[0] !== 'dias_operativos'); });
    expect(r.errors.some((e) => /dias_operativos/.test(e.message))).toBe(true);
  });

  it('aplica_a desconocido', () => {
    const r = con((s) => { s.Fijos[1][2] = 'gerente'; });
    expect(r.errors.some((e) => e.sheet === 'Fijos' && /aplica_a/.test(e.message))).toBe(true);
  });

  it('un tipo de camión que no está en el catálogo se avisa', () => {
    const r = con((s) => { s.Variables[1][1] = 'Camión fantasma'; });
    expect(r.warnings.some((w) => /Camión fantasma/.test(w.message))).toBe(true);
  });

  it('acepta encabezados con tildes, mayúsculas y alias de frecuencia en español', () => {
    const r = parseCostTemplate({
      'variables': [['Componente', 'Tipo Camión', 'Frecuencia', 'Cantidad frecuencia', 'Costo'], ['Llanta', '', 'mensual', 1, 12000]],
      'fijos': [['Concepto', 'Aplica a'], ],
      'PARÁMETROS': [['Clave', 'Valor'], ['Días operativos', 30], ['km_anual', 36000]],
    });
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ frequency: 'month', truckType: null });
  });
});
