import { describe, expect, it } from 'vitest';
import { tripAlerts } from '../tripAlerts';

const base = { guideCount: 5, deliveredGuides: 5, returnCount: 0, novedadCount: 0, pickupCount: 0 };

describe('tripAlerts', () => {
  it('no devuelve nada si el viaje viene limpio', () => {
    expect(tripAlerts(base)).toEqual([]);
  });

  it('cuenta y pluraliza cada tipo', () => {
    const labels = tripAlerts({ guideCount: 5, deliveredGuides: 4, returnCount: 2, novedadCount: 1, pickupCount: 3 }).map((a) => a.label);
    expect(labels).toEqual(['1 novedad', '3 recolectas', '2 devoluciones', '1 pedido no entregado']);
  });

  it('nunca cuenta no entregados negativos', () => {
    expect(tripAlerts({ ...base, guideCount: 2, deliveredGuides: 3 })).toEqual([]);
  });
});
