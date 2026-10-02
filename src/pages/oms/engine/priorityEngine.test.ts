import { describe, expect, it } from 'vitest';
import { calcularPrioridad, esClienteRetira } from './priorityEngine';

const HOY = '2026-09-22';

describe('esClienteRetira', () => {
  it('detecta la frase en cualquier capitalización', () => {
    expect(esClienteRetira('CLIENTE RETIRA en bodega')).toBe(true);
    expect(esClienteRetira('el cliente retira mañana')).toBe(true);
  });

  it('no detecta falsos positivos en observaciones normales', () => {
    expect(esClienteRetira('entregar en muelle 3, con cita previa')).toBe(false);
  });

  it('maneja observaciones nulas sin lanzar', () => {
    expect(esClienteRetira(null)).toBe(false);
  });
});

describe('calcularPrioridad', () => {
  it('cliente retira siempre gana prioridad 1 / tier 1, sin importar la fecha', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: '2026-10-30', fechaExpedicion: null, observaciones: 'cliente retira' },
      HOY,
    );
    expect(r.prioridad).toBe(1);
    expect(r.tier).toBe(1);
    expect(r.esClienteRetira).toBe(true);
    expect(r.appliedRules).toEqual([{ name: 'Cliente retira', weight: 1 }]);
  });

  it('regla T-1: entrega mañana (ventana "listo hoy") -> prioridad urgente', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: '2026-09-23', fechaExpedicion: null, observaciones: null },
      HOY,
    );
    expect(r.prioridad).toBe(3);
    expect(r.tier).toBe(1);
    expect(r.esClienteRetira).toBe(false);
  });

  it('entrega vencida (fecha pasada) es más urgente que "hoy"', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: '2026-09-20', fechaExpedicion: null, observaciones: null },
      HOY,
    );
    expect(r.prioridad).toBe(2);
    expect(r.tier).toBe(1);
  });

  it('entrega lejana en el futuro cae en la banda de menor urgencia (tier 4) y se limita a 49', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: '2027-01-01', fechaExpedicion: null, observaciones: null },
      HOY,
    );
    expect(r.tier).toBe(4);
    expect(r.prioridad).toBeLessThanOrEqual(49);
  });

  it('sin fecha planificada ni fecha de expedición usable -> banda más baja, sin regla de fecha aplicada', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: null, fechaExpedicion: null, observaciones: null },
      HOY,
    );
    expect(r.prioridad).toBe(50);
    expect(r.tier).toBe(4);
    expect(r.appliedRules).toEqual([]);
  });

  it('cae a fecha_expedicion cuando no hay fecha_planificada (caso Cofersa sin fecha de entrega)', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: null, fechaExpedicion: '2026-09-23', observaciones: null },
      HOY,
    );
    expect(r.prioridad).toBe(3);
    expect(r.appliedRules).toEqual([{ name: 'Regla T-1 (fecha de despacho)', weight: 1 }]);
  });

  it('ignora una fecha_planificada con formato inválido y usa el fallback', () => {
    const r = calcularPrioridad(
      { fechaPlanificada: 'no-es-una-fecha', fechaExpedicion: '2026-09-23', observaciones: null },
      HOY,
    );
    expect(r.prioridad).toBe(3);
  });
});
