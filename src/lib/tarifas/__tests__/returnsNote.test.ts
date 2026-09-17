// Devoluciones informadas en un viaje.
//
// Una devolución es mercancía que volvió en medio del viaje. **No cambia lo que se le paga al
// transportista** —el viaje lo hizo igual—, así que no entra al cálculo: se registra para que quede
// constancia y para poder cruzarla después con la factura.

import { describe, expect, it } from 'vitest';
import { describeReturn, emptyReturn, mergeIntoNotes, toNote, validateReturn } from '../returnsNote';
import type { SettlementReturn } from '../types';

const devolucion = (overrides: Partial<SettlementReturn> = {}): SettlementReturn => ({
  invoiceNumber: 'F-1029',
  productCode: 'SKU-44',
  kind: 'PARCIAL',
  notes: null,
  ...overrides,
});

describe('validateReturn', () => {
  it('exige el nro de factura', () => {
    expect(validateReturn(devolucion({ invoiceNumber: '  ' })).invoiceNumber).toBeDefined();
  });

  it('una devolución PARCIAL exige el código de producto', () => {
    expect(validateReturn(devolucion({ productCode: '' })).productCode).toBeDefined();
  });

  it('una devolución TOTAL no lo exige: abarca toda la factura', () => {
    // Pedirlo sería pedir que alguien elija un producto arbitrario de los que volvieron todos.
    expect(validateReturn(devolucion({ kind: 'TOTAL', productCode: '' })).productCode).toBeUndefined();
  });

  it('una devolución completa es válida', () => {
    expect(validateReturn(devolucion())).toEqual({});
  });
});

describe('describeReturn', () => {
  it('nombra la factura y el producto', () => {
    expect(describeReturn(devolucion())).toBe('factura F-1029, producto SKU-44 (Parcial)');
  });

  it('una total dice que abarca toda la factura', () => {
    expect(describeReturn(devolucion({ kind: 'TOTAL' }))).toBe('factura F-1029, toda la factura (Total)');
  });

  it('agrega la aclaración si la hay', () => {
    expect(describeReturn(devolucion({ notes: 'cliente ausente' })))
      .toContain('— cliente ausente');
  });
});

describe('toNote', () => {
  it('sin devoluciones no escribe nada', () => {
    expect(toNote([])).toBe('');
  });

  it('arma un bloque con una línea por devolución', () => {
    const texto = toNote([devolucion(), devolucion({ invoiceNumber: 'F-1030', kind: 'TOTAL' })]);

    expect(texto.split('\n')).toEqual([
      'Devoluciones informadas:',
      '- factura F-1029, producto SKU-44 (Parcial)',
      '- factura F-1030, toda la factura (Total)',
    ]);
  });
});

describe('mergeIntoNotes', () => {
  it('agrega el bloque después de la nota existente', () => {
    const resultado = mergeIntoNotes('El camión llegó tarde.', [devolucion()]);
    expect(resultado).toBe('El camión llegó tarde.\n\nDevoluciones informadas:\n- factura F-1029, producto SKU-44 (Parcial)');
  });

  it('REEMPLAZA el bloque anterior en vez de acumular otro', () => {
    // Sin el reemplazo, editar las devoluciones dejaría dos bloques contradictorios en la nota.
    const primera = mergeIntoNotes('Nota original.', [devolucion()]);
    const segunda = mergeIntoNotes(primera, [devolucion({ invoiceNumber: 'F-9999' })]);

    expect(segunda).toContain('F-9999');
    expect(segunda).not.toContain('F-1029');
    expect(segunda?.match(/Devoluciones informadas:/g)).toHaveLength(1);
    expect(segunda).toContain('Nota original.');
  });

  it('quitar todas las devoluciones borra el bloque y conserva la nota', () => {
    const conBloque = mergeIntoNotes('Nota original.', [devolucion()]);
    expect(mergeIntoNotes(conBloque, [])).toBe('Nota original.');
  });

  it('sin nota ni devoluciones devuelve nulo', () => {
    expect(mergeIntoNotes(null, [])).toBeNull();
  });

  it('sin nota previa, el bloque queda solo', () => {
    expect(mergeIntoNotes(null, [devolucion()])).toBe(
      'Devoluciones informadas:\n- factura F-1029, producto SKU-44 (Parcial)',
    );
  });
});

describe('emptyReturn', () => {
  it('arranca en parcial, que es el caso más común', () => {
    expect(emptyReturn()).toMatchObject({ kind: 'PARCIAL', invoiceNumber: '', productCode: '' });
  });
});
