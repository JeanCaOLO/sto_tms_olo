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
  // Zona: en modo 'auto' se manda zone_source='map' (la BD la recalcula por la
  // geocerca e ignora zone_id); en 'manual' se manda la zona fija (la BD la
  // marca zone_source='manual'). El endpoint solo acepta 'map'/'manual'.
  const auto = form.zone_mode === 'auto';
  if (form.id) {
    return {
      method: 'PATCH',
      path: `/v1/delivery-points/${form.id}`,
      body: {
        name: form.name,
        delivery_instructions: form.delivery_instructions || null,
        contact_phone: form.contact_phone || null,
        ...(auto ? { zone_source: 'map' } : { zone_id: form.zone_id || null, zone_source: 'manual' }),
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
      contact_phone: form.contact_phone || undefined,
      ...(auto ? { zone_source: 'map' } : { zone_id: form.zone_id || undefined, zone_source: 'manual' }),
      route_code: form.route_code || undefined,
      address,
    },
  };
}
