// Plantillas de viaje leídas como escenarios verificables.
//
// Lo que se cuida acá: que una plantilla vieja —guardada antes de que existieran las recolectas o
// la cantidad de peajes— se siga pudiendo calcular, y que la comparación del total no dé falsas
// alarmas por cómo esté escrito el número.

import { describe, expect, it } from 'vitest';
import {
  checkScenario, describeCheck, normalizeTrip, toScenario, toTemplateRow,
} from '../templateScenarios';

describe('normalizeTrip', () => {
  it('completa lo que la plantilla vieja no traía, con cero', () => {
    // Una plantilla anterior a las recolectas describe un viaje SIN recolectas: cero es la lectura
    // correcta, no un dato faltante.
    const trip = normalizeTrip({ originLocationId: 'Z1', destLocationId: 'Z2', km: 100 }, 'VE');

    expect(trip).toMatchObject({
      countryId: 'VE',
      km: 100,
      tollCount: 0,
      pickupCount: 0,
      truckVolumeM3: 0,
      truckWeightTons: 0,
      tollsAmount: '0',
      serviceType: 'STANDARD',
      fleetType: 'OWN',
    });
  });

  it('un viaje totalmente vacío no rompe: queda en ceros', () => {
    expect(() => normalizeTrip(null, 'VE')).not.toThrow();
    expect(normalizeTrip(null, 'VE').km).toBe(0);
  });

  it('un número ilegible no se cuela como NaN', () => {
    // Un NaN atravesaría el motor hasta salir como total "NaN": mejor leerlo como cero.
    expect(normalizeTrip({ km: 'ciento ochenta' }, 'VE').km).toBe(0);
  });

  it('respeta el país del propio viaje si lo trae', () => {
    expect(normalizeTrip({ countryId: 'CO' }, 'VE').countryId).toBe('CO');
  });

  it('conserva las variables personalizadas', () => {
    const trip = normalizeTrip({ customVars: { 'custom:horas_espera': 3 } }, 'VE');
    expect(trip.customVars).toEqual({ 'custom:horas_espera': 3 });
  });
});

describe('toScenario', () => {
  const fila = {
    id: 'TPL_1',
    country_id: 'VE',
    name: 'Caracas → Carabobo',
    trip: { km: 180, expectedTotal: '510.00' },
  };

  it('separa la expectativa del viaje', () => {
    const s = toScenario(fila);

    expect(s.expectedTotal).toBe('510.00');
    // Y NO queda dentro del viaje: una expectativa no es un dato de entrada del motor.
    expect((s.trip as unknown as Record<string, unknown>).expectedTotal).toBeUndefined();
  });

  it('una plantilla sin total esperado se lee como no verificada, no como cero', () => {
    // Confundir las dos cosas haría que una plantilla sin verificar apruebe cualquier total menos 0.
    expect(toScenario({ ...fila, trip: { km: 180 } }).expectedTotal).toBeNull();
    expect(toScenario({ ...fila, trip: { km: 180, expectedTotal: '  ' } }).expectedTotal).toBeNull();
  });

  it('vuelve a la forma de la fila sin perder el esperado', () => {
    const volvio = toTemplateRow(toScenario(fila));
    expect(volvio.trip?.expectedTotal).toBe('510.00');
    expect(volvio.country_id).toBe('VE');
  });
});

describe('checkScenario', () => {
  const s = { id: 'T', name: 'Escenario', expectedTotal: '510.00' };

  it('compara por valor, no por texto', () => {
    // "510" y "510.00" son el mismo total; marcarlo como regresión sería una falsa alarma, y a la
    // tercera nadie vuelve a mirar el test.
    expect(checkScenario(s, '510').verdict).toBe('OK');
    expect(checkScenario(s, '510.000').verdict).toBe('OK');
  });

  it('detecta el movimiento y dice de cuánto y en qué dirección', () => {
    const subio = checkScenario(s, '530.00');
    expect(subio.verdict).toBe('MOVIO');
    expect(subio.drift).toBe('20');

    expect(checkScenario(s, '500.00').drift).toBe('-10');
  });

  it('una plantilla sin esperado no aprueba ni reprueba', () => {
    const check = checkScenario({ ...s, expectedTotal: null }, '999');
    expect(check.verdict).toBe('SIN_ESPERADO');
    expect(check.drift).toBeNull();
  });

  it('el renglón dice lo suficiente para arreglarlo sin abrir el código', () => {
    expect(describeCheck(checkScenario(s, '530.00')))
      .toBe('Escenario: esperaba 510.00 y dio 530.00 (diferencia 20).');
  });
});
