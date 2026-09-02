import { describe, it, expect } from 'vitest';
import { toCofersaDia, rutasActivas, type CofersaDia } from './cofersa-dias';

describe('toCofersaDia', () => {
  it('extrae el número de zona (prefijo o token)', () => {
    expect(toCofersaDia({ zona: '1 Casco' }).numero).toBe(1);
    expect(toCofersaDia({ zona: '17 Grecia' }).numero).toBe(17);
    expect(toCofersaDia({ zona: '21 Casco' }).numero).toBe(21);
    // número no al inicio ("Upala 31") → cae al match del primer dígito
    expect(toCofersaDia({ zona: 'Upala 31' }).numero).toBe(31);
  });

  it('normaliza días y citaPrevia', () => {
    const c = toCofersaDia({
      zona: '1 Casco',
      categoria: 'GAM',
      citaPrevia: false,
      lunes: 'ambos',
      sabado: null,
    });
    expect(c.dias.lunes).toBe('ambos');
    expect(c.dias.sabado).toBeNull();
    // día ausente en el JSON → null
    expect(c.dias.martes).toBeNull();
    expect(c.citaPrevia).toBe(false);
  });

  it('descarta valores de día no reconocidos', () => {
    expect(toCofersaDia({ zona: '1', lunes: 'basura' }).dias.lunes).toBeNull();
  });
});

describe('rutasActivas', () => {
  const cofersa: CofersaDia[] = [
    toCofersaDia({ zona: '1 Casco', categoria: 'GAM', lunes: 'ambos', viernes: 'ambos', sabado: null }),
    toCofersaDia({ zona: '08 San Carlos', categoria: 'Rural', lunes: 'carga', martes: 'entrega' }),
    toCofersaDia({ zona: '44 REY', categoria: 'GAM', citaPrevia: true }),
  ];

  it('devuelve los números activos ese día (cita previa aparte)', () => {
    // lunes: 1 Casco 'ambos' + San Carlos 'carga'
    expect(rutasActivas(cofersa, 'lunes').sort((a, b) => a - b)).toEqual([1, 8]);
    // martes: 1 Casco null (no fijado), San Carlos 'entrega'
    expect(rutasActivas(cofersa, 'martes')).toEqual([8]);
    // sábado: nadie activo
    expect(rutasActivas(cofersa, 'sabado')).toEqual([]);
  });

  it('nunca incluye rutas de cita previa', () => {
    for (const d of ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const) {
      expect(rutasActivas(cofersa, d)).not.toContain(44);
    }
  });
});
