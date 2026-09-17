// Los campos del formulario que salen de las variables personalizadas.
//
// Cierra el agujero más silencioso del módulo: `trip.customVars` **no lo rellenaba nadie en toda la
// aplicación**. Se podía declarar una variable "por viaje", escribir una regla que la usara, verla
// ofrecida en el constructor... y que en cada liquidación resolviera siempre a su valor por
// defecto, sin campo donde cargarla y sin ningún aviso.

import { describe, expect, it } from 'vitest';
import {
  buildCustomVarFields, constantVars, describeCustomVars, initialCustomVarValues,
  missingDeclaredVars, parseCustomVarValues,
} from '../customVarFields';
import type { PartyVariable } from '../types';

const variable = (overrides: Partial<PartyVariable> = {}): PartyVariable => ({
  id: 'V1',
  partyId: 'P1',
  key: 'custom:horas_espera',
  label: 'Horas de espera',
  kind: 'NUMBER',
  origin: 'PER_TRIP',
  defaultValue: '0',
  unit: 'h',
  active: true,
  ...overrides,
});

// ── Qué se dibuja ─────────────────────────────────────────────────────────────────────────────

describe('buildCustomVarFields', () => {
  it('sólo las variables POR VIAJE: son las que el formulario tiene que preguntar', () => {
    const fields = buildCustomVarFields([
      variable(),
      variable({ id: 'V2', key: 'custom:bono', label: 'Bono', origin: 'CONSTANT', defaultValue: '25' }),
    ]);

    expect(fields.map((f) => f.key)).toEqual(['custom:horas_espera']);
  });

  it('las inactivas no se dibujan', () => {
    expect(buildCustomVarFields([variable({ active: false })])).toEqual([]);
  });

  it('conserva unidad y tipo, para poder rotular y validar el campo', () => {
    const [campo] = buildCustomVarFields([variable()]);
    expect(campo).toMatchObject({ label: 'Horas de espera', kind: 'NUMBER', unit: 'h' });
  });
});

describe('constantVars', () => {
  it('las constantes se muestran aparte, de sólo lectura', () => {
    // Ver la diferencia entre los dos orígenes sin abrir el catálogo es lo que hace entendible por
    // qué una suma y la otra no.
    const constantes = constantVars([
      variable(),
      variable({ id: 'V2', key: 'custom:bono', label: 'Bono', origin: 'CONSTANT', defaultValue: '25' }),
    ]);
    expect(constantes.map((f) => f.key)).toEqual(['custom:bono']);
  });
});

// ── Valores iniciales ─────────────────────────────────────────────────────────────────────────

describe('initialCustomVarValues', () => {
  it('arranca en el valor por defecto declarado, no en vacío', () => {
    const fields = buildCustomVarFields([variable({ defaultValue: '2' })]);
    expect(initialCustomVarValues(fields)).toEqual({ 'custom:horas_espera': '2' });
  });
});

// ── Lo tecleado al motor ──────────────────────────────────────────────────────────────────────

describe('parseCustomVarValues', () => {
  const fields = buildCustomVarFields([
    variable(),
    variable({ id: 'V2', key: 'custom:observacion', label: 'Observación', kind: 'TEXT', unit: null, defaultValue: '' }),
  ]);

  it('convierte los números y deja el texto tal cual', () => {
    const { values, errors } = parseCustomVarValues(fields, {
      'custom:horas_espera': '3.5',
      'custom:observacion': 'demora en planta',
    });

    expect(values).toEqual({ 'custom:horas_espera': 3.5, 'custom:observacion': 'demora en planta' });
    expect(errors).toEqual({});
  });

  it('un número ilegible es un ERROR, no un cero silencioso', () => {
    // Un cero silencioso es indistinguible de "cargué cero", y la diferencia son las horas de
    // espera que nadie va a cobrar.
    const { values, errors } = parseCustomVarValues(fields, { 'custom:horas_espera': 'tres' });

    expect(errors['custom:horas_espera']).toContain('Horas de espera');
    expect(values['custom:horas_espera']).toBeUndefined();
  });

  it('un campo vacío toma el valor por defecto, no cero', () => {
    const conDefault = buildCustomVarFields([variable({ defaultValue: '1' })]);
    const { values } = parseCustomVarValues(conDefault, { 'custom:horas_espera': '' });
    expect(values['custom:horas_espera']).toBe(1);
  });

  it('un campo que no se tocó también toma su valor por defecto', () => {
    const conDefault = buildCustomVarFields([variable({ defaultValue: '4' })]);
    expect(parseCustomVarValues(conDefault, {}).values['custom:horas_espera']).toBe(4);
  });

  it('el cero tecleado se respeta', () => {
    const conDefault = buildCustomVarFields([variable({ defaultValue: '5' })]);
    expect(parseCustomVarValues(conDefault, { 'custom:horas_espera': '0' }).values['custom:horas_espera']).toBe(0);
  });

  it('recorta los espacios', () => {
    expect(parseCustomVarValues(fields, { 'custom:horas_espera': '  2  ' }).values['custom:horas_espera']).toBe(2);
  });
});

// ── Variables que las reglas nombran y nadie declaró ──────────────────────────────────────────

describe('missingDeclaredVars', () => {
  it('nombra las que faltan', () => {
    // El motor las resuelve como 0 con un aviso que se pierde entre los demás. Mostrarlo junto a la
    // sección convierte "esta regla no suma nada" en "falta declarar esta variable".
    const faltantes = missingDeclaredVars(
      ['km', 'custom:horas_espera', 'custom:no_declarada'],
      [variable()],
    );
    expect(faltantes).toEqual(['custom:no_declarada']);
  });

  it('una variable dada de baja cuenta como faltante', () => {
    expect(missingDeclaredVars(['custom:horas_espera'], [variable({ active: false })]))
      .toEqual(['custom:horas_espera']);
  });

  it('las del sistema no cuentan', () => {
    expect(missingDeclaredVars(['km', 'clientCount'], [])).toEqual([]);
  });

  it('no repite', () => {
    expect(missingDeclaredVars(['custom:x', 'custom:x'], [])).toEqual(['custom:x']);
  });
});

// ── Resumen legible ───────────────────────────────────────────────────────────────────────────

describe('describeCustomVars', () => {
  it('arma etiqueta y valor con su unidad, para el panel del desglose', () => {
    const fields = buildCustomVarFields([variable()]);
    expect(describeCustomVars(fields, { 'custom:horas_espera': 3 }))
      .toEqual([{ label: 'Horas de espera', value: '3 h' }]);
  });
});
