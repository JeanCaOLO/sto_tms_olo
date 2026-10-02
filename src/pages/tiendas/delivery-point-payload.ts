// Arma el cuerpo de la llamada atómica a /v1/delivery-points a partir del
// formulario. Al crear se manda cliente + código; al editar esos campos son
// inmutables y se omiten. Las coordenadas van juntas o ninguna (el backend
// rechaza una sola), por eso ambas caen a undefined cuando falta una.
import type { DeliveryPointForm } from './components/DeliveryPointModal';

export interface DeliveryPointRequest {
  method: 'POST' | 'PATCH';
  path: string;
  body: Record<string, unknown>;
}

function buildAddress(form: DeliveryPointForm) {
  const hasBoth = form.latitude !== '' && form.longitude !== '';
  return {
    line1: form.line1 || undefined,
    line2: form.line2 || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    latitude: hasBoth ? Number(form.latitude) : undefined,
    longitude: hasBoth ? Number(form.longitude) : undefined,
  };
}

export function buildDeliveryPointRequest(form: DeliveryPointForm): DeliveryPointRequest {
  const address = buildAddress(form);
  if (form.id) {
    return {
      method: 'PATCH',
      path: `/v1/delivery-points/${form.id}`,
      body: {
        name: form.name,
        delivery_instructions: form.delivery_instructions || null,
        zone_id: form.zone_id || null,
        route_code: form.route_code || null,
        active: form.active,
        address,
      },
    };
  }
  return {
    method: 'POST',
    path: '/v1/delivery-points',
    body: {
      customer_id: form.customer_id,
      external_code: form.external_code,
      name: form.name,
      delivery_instructions: form.delivery_instructions || undefined,
      zone_id: form.zone_id || undefined,
      route_code: form.route_code || undefined,
      address,
    },
  };
}
