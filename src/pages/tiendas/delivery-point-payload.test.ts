import { describe, it, expect } from 'vitest';
import { buildDeliveryPointRequest } from './delivery-point-payload';
import type { DeliveryPointForm } from './components/DeliveryPointModal';

const base: DeliveryPointForm = {
  customer_id: 'cust-1', external_code: 'COF-001', name: 'Sucursal Centro',
  delivery_instructions: '', zone_id: '', route_code: '', active: true,
  line1: 'Av. Central 100', line2: '', city: 'San José', state: '',
  latitude: '', longitude: '',
};

describe('buildDeliveryPointRequest', () => {
  it('crea con POST e incluye cliente y código', () => {
    const req = buildDeliveryPointRequest(base);
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/v1/delivery-points');
    expect(req.body.customer_id).toBe('cust-1');
    expect(req.body.external_code).toBe('COF-001');
  });

  it('edita con PATCH, omite cliente/código e incluye el id en la ruta', () => {
    const req = buildDeliveryPointRequest({ ...base, id: 'dp-9' });
    expect(req.method).toBe('PATCH');
    expect(req.path).toBe('/v1/delivery-points/dp-9');
    expect(req.body).not.toHaveProperty('customer_id');
    expect(req.body).not.toHaveProperty('external_code');
    expect(req.body.active).toBe(true);
  });

  it('manda ambas coordenadas cuando vienen las dos', () => {
    const req = buildDeliveryPointRequest({ ...base, latitude: '9.9', longitude: '-84.1' });
    const address = req.body.address as Record<string, unknown>;
    expect(address.latitude).toBe(9.9);
    expect(address.longitude).toBe(-84.1);
  });

  it('descarta una coordenada suelta (backend exige ambas o ninguna)', () => {
    const req = buildDeliveryPointRequest({ ...base, latitude: '9.9', longitude: '' });
    const address = req.body.address as Record<string, unknown>;
    expect(address.latitude).toBeUndefined();
    expect(address.longitude).toBeUndefined();
  });
});
