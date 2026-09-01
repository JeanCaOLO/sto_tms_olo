import { describe, it, expect } from 'vitest';
import {
  excelSerialToISO,
  maskName,
  parseCofersa,
  parseProgramacionViajes,
} from './parse';

describe('excelSerialToISO', () => {
  it('convierte el serial de Excel a ISO (base 1899-12-30)', () => {
    expect(excelSerialToISO(45293)).toBe('2024-01-02');
    expect(excelSerialToISO(46265)).toBe('2026-08-31');
  });
  it('no-números -> null', () => {
    expect(excelSerialToISO('2024-01-01')).toBeNull();
    expect(excelSerialToISO(null)).toBeNull();
  });
});

describe('maskName', () => {
  it('deja inicial del nombre + apellidos', () => {
    expect(maskName('ARAMIS VILLASANA')).toBe('A. VILLASANA');
    expect(maskName('JOSE GREGORIO PEREZ')).toBe('J. GREGORIO PEREZ');
  });
  it('un solo token queda igual', () => {
    expect(maskName('SINDATO')).toBe('SINDATO');
  });
});

describe('parseCofersa', () => {
  const rows = [
    ['Zona #', null, 'Días de Carga ', 'Días de entrega '],
    ['08 San Carlos ', 'Rural ', 'Lunes -Miercoles-Viernes ', 'Martes-Jueves-Sabado'],
    ['1 Casco ', 'GAM ', 'Lunes a Viernes', null],
    [null, null, null, null],
  ];

  it('mapea cada zona recortando espacios y descarta filas sin zona', () => {
    const out = parseCofersa(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      zona: '08 San Carlos',
      categoria: 'Rural',
      diasCarga: 'Lunes -Miercoles-Viernes',
      diasEntrega: 'Martes-Jueves-Sabado',
    });
    expect(out[1].diasEntrega).toBeNull();
  });

  it('lanza si falta la cabecera', () => {
    expect(() => parseCofersa([['otra cosa']])).toThrow();
  });
});

describe('parseProgramacionViajes', () => {
  // Cabecera en la fila 2: hay basura arriba, como en el fichero real.
  const rows = [
    [' ', null, null],
    [8, null, null],
    ['MES', 'Fecha De Asignacion', 'Febeca Patio Viaje', 'Febeca Bulto', 'N° Viaje Sillaca', 'N° Viaje Beval', 'Destino', 'Localidad Referencia', 'VIAJE WMH', 'N° Prioridad', 'GUIAS ADICIONALES', 'PUERTA DE CARGA', 'x', 'x', 'x', 'x', 'x', 'Conductor'],
    ['ENERO', 45293, 'UT09-G1P-1', 'UT09-G1-2', null, 'UT09-G-4', 'GUARICO', 'GUARICO 1', 20, 0, 'LLEVA X', 13, null, null, null, null, null, 'ARAMIS VILLASANA'],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ];

  it('detecta la cabecera y mapea columnas por nombre', () => {
    const [row] = parseProgramacionViajes(rows);
    expect(row).toMatchObject({
      mes: 'ENERO',
      fecha: '2024-01-02',
      destino: 'GUARICO',
      localidad: 'GUARICO 1',
      febecaPatio: 'UT09-G1P-1',
      sillaca: null,
      prioridad: 0,
      puertaCarga: 13,
    });
  });

  it('enmascara el conductor por defecto y lo deja intacto con maskConductor:false', () => {
    expect(parseProgramacionViajes(rows)[0].conductor).toBe('A. VILLASANA');
    expect(parseProgramacionViajes(rows, { maskConductor: false })[0].conductor).toBe('ARAMIS VILLASANA');
  });

  it('descarta filas sin fecha ni destino', () => {
    expect(parseProgramacionViajes(rows)).toHaveLength(1);
  });

  it('lanza si no hay fila de cabecera reconocible', () => {
    expect(() => parseProgramacionViajes([['a', 'b']])).toThrow();
  });
});
