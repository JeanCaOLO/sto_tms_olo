import { describe, expect, it } from 'vitest';
import {
  agruparPorRuta,
  debeDispararViaje,
  esGrupoUrgente,
  generarPropuestasDeViaje,
  UMBRAL_ACUMULACION_DEFAULT,
} from './viaje-trigger';
import type { FlotaSlot } from './fleet-split';
import type { PedidoAlistado } from './pedidos-alistados-api';
import type { Vehiculo } from './types';

let seq = 0;
function pedidoAlistado(over: Partial<PedidoAlistado> = {}): PedidoAlistado {
  seq += 1;
  return {
    id: `p${seq}`,
    order_number: `ORD-${seq}`,
    customer_id: 'c',
    store_id: '',
    delivery_address: '',
    delivery_city: '',
    delivery_zone: '07',
    total_weight: 0,
    total_volume: 0,
    status: 'pending',
    order_date: '2026-09-23',
    cant_lineas: 1,
    id_compania: '0109',
    prioridad: 20,
    tier: 4,
    esClienteRetira: false,
    ...over,
  };
}

function vehiculo(over: Partial<Vehiculo>): Vehiculo {
  return { id: 'v', plate: 'AAA', brand: 'b', model: 'm', vehicle_type: 'camion', capacity_weight: 1000, capacity_volume: 10, ...over };
}
function slot(over: Partial<Vehiculo>, conductorId = 'd'): FlotaSlot {
  return { vehiculo: vehiculo(over), conductorId };
}

describe('agruparPorRuta', () => {
  it('agrupa por delivery_zone (código de ruta del WMS)', () => {
    const grupos = agruparPorRuta([
      pedidoAlistado({ delivery_zone: '07' }),
      pedidoAlistado({ delivery_zone: '04' }),
      pedidoAlistado({ delivery_zone: '07' }),
    ]);
    expect(grupos.get('07')).toHaveLength(2);
    expect(grupos.get('04')).toHaveLength(1);
  });

  it('usa "(sin ruta)" cuando delivery_zone viene vacío', () => {
    const grupos = agruparPorRuta([pedidoAlistado({ delivery_zone: '' })]);
    expect(grupos.has('(sin ruta)')).toBe(true);
  });
});

describe('esGrupoUrgente / debeDispararViaje', () => {
  it('un solo pedido urgente (prioridad<=3) dispara el viaje aunque el grupo sea de 1', () => {
    const grupo = [pedidoAlistado({ prioridad: 2, tier: 1 })];
    expect(esGrupoUrgente(grupo)).toBe(true);
    expect(debeDispararViaje(grupo)).toEqual({ disparar: true, motivo: 'urgencia' });
  });

  it('un solo pedido "cliente retira" dispara el viaje aunque no sea T-1 por fecha', () => {
    const grupo = [pedidoAlistado({ prioridad: 1, tier: 1, esClienteRetira: true })];
    expect(debeDispararViaje(grupo)).toEqual({ disparar: true, motivo: 'urgencia' });
  });

  it('sin urgencia y por debajo del umbral, el grupo espera', () => {
    const grupo = [pedidoAlistado(), pedidoAlistado()]; // 2 < UMBRAL_ACUMULACION_DEFAULT (3)
    expect(debeDispararViaje(grupo)).toEqual({ disparar: false, motivo: null });
  });

  it('alcanzar el umbral de acumulación dispara el viaje por "umbral", no "urgencia"', () => {
    const grupo = Array.from({ length: UMBRAL_ACUMULACION_DEFAULT }, () => pedidoAlistado());
    expect(debeDispararViaje(grupo)).toEqual({ disparar: true, motivo: 'umbral' });
  });

  it('un grupo vacío nunca dispara', () => {
    expect(debeDispararViaje([])).toEqual({ disparar: false, motivo: null });
  });
});

describe('generarPropuestasDeViaje', () => {
  it('separa rutas que ya deben salir de las que siguen esperando', () => {
    const urgente = pedidoAlistado({ delivery_zone: '07', prioridad: 2, tier: 1 });
    const enEspera = pedidoAlistado({ delivery_zone: '04' });

    const { propuestas, gruposEnEspera } = generarPropuestasDeViaje([urgente, enEspera], []);

    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].ruta).toBe('07');
    expect(propuestas[0].motivoDisparo).toBe('urgencia');
    expect(gruposEnEspera).toEqual([{ ruta: '04', pedidos: [enEspera] }]);
  });

  it('prioriza flota propia al asignar el slot de un viaje disparado', () => {
    const grupo = [pedidoAlistado({ delivery_zone: '07', prioridad: 2, tier: 1 })];
    const tercero = slot({ id: 'tercero', is_flota_propia: false, capacity_weight: 9000 });
    const propio = slot({ id: 'propio', is_flota_propia: true, capacity_weight: 100 });

    const { propuestas } = generarPropuestasDeViaje(grupo, [tercero, propio]);

    expect(propuestas[0].slotAsignado?.vehiculo.id).toBe('propio');
  });

  it('una ruta urgente se queda con el único camión de flota propia antes que una ruta que solo llegó al umbral', () => {
    const rutaUrgente = [pedidoAlistado({ delivery_zone: 'urgente', prioridad: 2, tier: 1 })];
    const rutaPorUmbral = Array.from({ length: UMBRAL_ACUMULACION_DEFAULT }, () => pedidoAlistado({ delivery_zone: 'umbral' }));
    const unicoPropio = slot({ id: 'propio', is_flota_propia: true });

    const { propuestas } = generarPropuestasDeViaje([...rutaPorUmbral, ...rutaUrgente], [unicoPropio]);

    const propuestaUrgente = propuestas.find((p) => p.ruta === 'urgente');
    const propuestaUmbral = propuestas.find((p) => p.ruta === 'umbral');
    expect(propuestaUrgente?.slotAsignado?.vehiculo.id).toBe('propio');
    expect(propuestaUmbral?.slotAsignado).toBeNull();
  });

  it('si no hay ningún slot disponible, el viaje se propone igual con slotAsignado=null (no se pierde la decisión de disparar)', () => {
    const grupo = [pedidoAlistado({ delivery_zone: '07', esClienteRetira: true, prioridad: 1, tier: 1 })];
    const { propuestas } = generarPropuestasDeViaje(grupo, []);
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].slotAsignado).toBeNull();
  });

  it('respeta un umbral de acumulación personalizado', () => {
    const grupo = [pedidoAlistado({ delivery_zone: '09' }), pedidoAlistado({ delivery_zone: '09' })];
    const { propuestas, gruposEnEspera } = generarPropuestasDeViaje(grupo, [], 2);
    expect(propuestas).toHaveLength(1);
    expect(gruposEnEspera).toHaveLength(0);
  });
});
