import { describe, expect, it } from 'vitest';
import { mapExpedicionAlistadaToPedido } from './pedidos-alistados-api';

const HOY = '2026-09-22';

describe('mapExpedicionAlistadaToPedido', () => {
  it('mapea una fila alistada real con final_customer_id resuelto y calcula su prioridad', () => {
    const row = {
      id: 'abc-123',
      expedicion: 'PL0000003081-M',
      final_customer_id: 'fc-1',
      cliente_code: '020205008',
      ruta: '07',
      fecha_planificada: '2026-09-23',
      fecha_expedicion: null,
      observaciones: null,
      nombre_cliente: 'NELSON GONZALEZ (obs.)',
      cant_lineas: 3,
      id_compania: '0109',
    };
    const pedido = mapExpedicionAlistadaToPedido(row, HOY);
    expect(pedido).toMatchObject({
      id: 'abc-123',
      order_number: 'PL0000003081-M',
      customer_id: 'fc-1',
      delivery_zone: '07',
      order_date: '2026-09-23',
      customer_name: 'NELSON GONZALEZ (obs.)',
      cant_lineas: 3,
      id_compania: '0109',
      status: 'pending',
      total_weight: 0,
      total_volume: 0,
      prioridad: 3,
      tier: 1,
      esClienteRetira: false,
    });
  });

  it('cae a cliente_code cuando el cliente todavía no está onboardeado (final_customer_id null)', () => {
    const row = {
      id: 'abc-2', expedicion: 'X', final_customer_id: null, cliente_code: 'T005',
      ruta: null, fecha_planificada: null, fecha_expedicion: '2026-09-24', observaciones: null,
      nombre_cliente: 'T005 TIBAS', cant_lineas: 11, id_compania: '0029',
    };
    const pedido = mapExpedicionAlistadaToPedido(row, HOY);
    expect(pedido.customer_id).toBe('T005');
    expect(pedido.order_date).toBe('2026-09-24');
    expect(pedido.delivery_zone).toBe('(sin ruta)');
  });

  it('marca esClienteRetira cuando las observaciones lo indican, con prioridad 1', () => {
    const row = {
      id: 'abc-3', expedicion: 'Y', final_customer_id: 'fc-2', cliente_code: 'T002',
      ruta: '02', fecha_planificada: '2027-01-01', fecha_expedicion: null,
      observaciones: 'Cliente retira en bodega', nombre_cliente: 'T002', cant_lineas: 1, id_compania: '0029',
    };
    const pedido = mapExpedicionAlistadaToPedido(row, HOY);
    expect(pedido.esClienteRetira).toBe(true);
    expect(pedido.prioridad).toBe(1);
    expect(pedido.tier).toBe(1);
  });
});
