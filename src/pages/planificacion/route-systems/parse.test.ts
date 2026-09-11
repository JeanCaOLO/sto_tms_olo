import { describe, it, expect } from 'vitest';
import {
  excelSerialToISO,
  maskName,
  parseCofersa,
  parseDias,
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
    ['3 Guadalupe ', 'GAM ', null, null],
    ['44 REY ', 'GAM ', 'Cita Previa', null],
    [null, null, null, null],
  ];

  it('mapea cada zona recortando espacios y descarta filas sin zona', () => {
    const out = parseCofersa(rows);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({
      zona: '08 San Carlos',
      categoria: 'Rural',
      diasCarga: 'Lunes -Miercoles-Viernes',
      diasEntrega: 'Martes-Jueves-Sabado',
      // rural sin cambios: carga=verde, entrega=rojo
      lunes: 'carga',
      martes: 'entrega',
      miercoles: 'carga',
      jueves: 'entrega',
      viernes: 'carga',
      sabado: 'entrega',
    });
  });

  it('GAM "1 Casco" (solo "Lunes a Viernes" de carga) → Lun-Vie ambos, Sáb null', () => {
    const [, casco] = parseCofersa(rows);
    expect(casco.zona).toBe('1 Casco');
    expect(casco.lunes).toBe('ambos');
    expect(casco.martes).toBe('ambos');
    expect(casco.miercoles).toBe('ambos');
    expect(casco.jueves).toBe('ambos');
    expect(casco.viernes).toBe('ambos');
    expect(casco.sabado).toBeNull();
    expect(casco.citaPrevia).toBeUndefined();
  });

  it('GAM "3 Guadalupe" (días vacíos) → Lun-Vie ambos, Sáb null', () => {
    const guada = parseCofersa(rows)[2];
    expect(guada.zona).toBe('3 Guadalupe');
    expect(guada.lunes).toBe('ambos');
    expect(guada.viernes).toBe('ambos');
    expect(guada.sabado).toBeNull();
  });

  it('"44 REY" (Cita Previa) → citaPrevia:true y los 6 días null', () => {
    const rey = parseCofersa(rows)[3];
    expect(rey.zona).toBe('44 REY');
    expect(rey.citaPrevia).toBe(true);
    for (const d of ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const) {
      expect(rey[d]).toBeNull();
    }
  });

  it('GAM con split explícito (EPA) NO se convierte en ambos', () => {
    // categoria GAM pero con carga/entrega reales → regla 3, no regla 2.
    const [epa] = parseCofersa([
      ['Zona #', null, 'Días de Carga', 'Días de entrega'],
      ['33 Cartago Epa', 'GAM', 'Viernes', 'Lunes'],
    ]);
    expect(epa.viernes).toBe('carga');
    expect(epa.lunes).toBe('entrega');
    expect(epa.martes).toBeNull();
  });

  it('día presente en ambas listas explícitas → ambos', () => {
    const [z] = parseCofersa([
      ['Zona #', null, 'Días de Carga', 'Días de entrega'],
      ['99 Test', 'Rural', 'Lunes', 'Lunes-Martes'],
    ]);
    expect(z.lunes).toBe('ambos');
    expect(z.martes).toBe('entrega');
  });

  it('lanza si falta la cabecera', () => {
    expect(() => parseCofersa([['otra cosa']])).toThrow();
  });
});

describe('parseDias', () => {
  it('parsea listas separadas por guion, espacios y acentos', () => {
    expect([...parseDias('Lunes -Miercoles-Viernes')]).toEqual(['lunes', 'miercoles', 'viernes']);
    expect([...parseDias('Martes-Jueves-Sabado')]).toEqual(['martes', 'jueves', 'sabado']);
    expect([...parseDias('jueves')]).toEqual(['jueves']);
  });
  it('expande el rango "X a Y"', () => {
    expect([...parseDias('Lunes a Viernes')]).toEqual(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']);
  });
  it('devuelve vacío para texto no reconocido o null', () => {
    expect(parseDias('Cita Previa').size).toBe(0);
    expect(parseDias(null).size).toBe(0);
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
