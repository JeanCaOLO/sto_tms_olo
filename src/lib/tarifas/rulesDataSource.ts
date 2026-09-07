// Fuente de datos para Zonas/Grupos de Zona/Reglas/Tarifas por zona/Tasas de cambio/Plantillas del
// módulo Liquidador — habla con `supabaseLiquidador` (proyecto de Supabase TEMPORAL, exclusivo
// para desarrollo/pruebas de este prototipo, con datos simulados). No es el Supabase real del TMS
// (`src/lib/supabase.ts`), que no se toca.
//
// El esquema de este proyecto temporal es de un solo tenant (sin `organization_id`) — el parámetro
// `organizationId` se mantiene en las firmas por compatibilidad con los llamadores (que sí son
// multi-tenant en el TMS real), pero no se usa para filtrar acá.

import { supabaseLiquidador } from './supabaseLiquidador';

export async function listCountries(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador.from('countries').select('*').order('name');
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------------------------
// Zone groups
// ---------------------------------------------------------------------------------------------

export async function listZoneGroups(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador.from('zone_groups').select('id, name').order('name');
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------------------------

export async function listZones(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador
    .from('zones')
    .select('*, zone_groups(name), countries(name)')
    .order('code');
  if (error) throw error;
  return data || [];
}

export async function saveZone(_organizationId: string, payload: Record<string, any>, id?: string): Promise<{ error: any }> {
  if (id) {
    const { error } = await supabaseLiquidador.from('zones').update(payload).eq('id', id);
    return { error };
  }
  const { error } = await supabaseLiquidador.from('zones').insert([payload]);
  return { error };
}

export async function deleteZone(id: string): Promise<{ error: any }> {
  const { error } = await supabaseLiquidador.from('zones').delete().eq('id', id);
  return { error };
}

// ---------------------------------------------------------------------------------------------
// Pricing rules — reglas de liquidación (pago al transportista)
// ---------------------------------------------------------------------------------------------

export async function listRules(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador
    .from('pricing_rules')
    .select('*')
    .order('stage')
    .order('priority');
  if (error) throw error;
  return data || [];
}

export async function saveRule(_organizationId: string, payload: Record<string, any>, id?: string): Promise<{ error: any }> {
  if (id) {
    const { error } = await supabaseLiquidador.from('pricing_rules').update(payload).eq('id', id);
    return { error };
  }
  const { error } = await supabaseLiquidador.from('pricing_rules').insert([payload]);
  return { error };
}

export async function deleteRule(id: string): Promise<{ error: any }> {
  const { error } = await supabaseLiquidador.from('pricing_rules').delete().eq('id', id);
  return { error };
}

// ---------------------------------------------------------------------------------------------
// Tarifas por zona (LOOKUP_ZONE)
// ---------------------------------------------------------------------------------------------

export async function listZoneLaneRates(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador.from('zone_lane_rates').select('*');
  if (error) throw error;
  return data || [];
}

export async function saveZoneLaneRate(_organizationId: string, payload: Record<string, any>, id?: string): Promise<{ error: any }> {
  if (id) {
    const { error } = await supabaseLiquidador.from('zone_lane_rates').update(payload).eq('id', id);
    return { error };
  }
  const { error } = await supabaseLiquidador.from('zone_lane_rates').insert([{ status: 'active', ...payload }]);
  return { error };
}

export async function deleteZoneLaneRate(id: string): Promise<{ error: any }> {
  const { error } = await supabaseLiquidador.from('zone_lane_rates').delete().eq('id', id);
  return { error };
}

// ---------------------------------------------------------------------------------------------
// Tasas de cambio
// ---------------------------------------------------------------------------------------------

export async function listFxRates(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador.from('fx_rates').select('*');
  if (error) throw error;
  return data || [];
}

export async function saveFxRate(_organizationId: string, payload: Record<string, any>, id?: string): Promise<{ error: any }> {
  if (id) {
    const { error } = await supabaseLiquidador.from('fx_rates').update(payload).eq('id', id);
    return { error };
  }
  const { error } = await supabaseLiquidador.from('fx_rates').insert([payload]);
  return { error };
}

export async function deleteFxRate(id: string): Promise<{ error: any }> {
  const { error } = await supabaseLiquidador.from('fx_rates').delete().eq('id', id);
  return { error };
}

// ---------------------------------------------------------------------------------------------
// Plantillas de viaje frecuente
// ---------------------------------------------------------------------------------------------

export async function listTemplates(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador.from('pricing_templates').select('*');
  if (error) throw error;
  return data || [];
}

export async function saveTemplate(_organizationId: string, payload: Record<string, any>, id?: string): Promise<{ error: any }> {
  if (id) {
    const { error } = await supabaseLiquidador.from('pricing_templates').update(payload).eq('id', id);
    return { error };
  }
  const { error } = await supabaseLiquidador.from('pricing_templates').insert([payload]);
  return { error };
}

export async function deleteTemplate(id: string): Promise<{ error: any }> {
  const { error } = await supabaseLiquidador.from('pricing_templates').delete().eq('id', id);
  return { error };
}

// ---------------------------------------------------------------------------------------------
// Carriers/transportistas simulados — solo para que el Probador tenga con qué condicionar
// `carrierId` sin tener que escribir un uuid a mano.
// ---------------------------------------------------------------------------------------------

export async function listSimulatedCarriers(_organizationId: string): Promise<any[]> {
  const { data, error } = await supabaseLiquidador.from('carriers').select('*').order('name');
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------------------------
// Usado por el "Probador del motor" — expone los datos crudos para armar un CalculateInput sin
// pasar por src/lib/tarifas/repository.ts (que asume rutas/tiendas/tipos de ruta reales del TMS).
// ---------------------------------------------------------------------------------------------

export async function listRulesAndZonesForTesting(organizationId: string) {
  const [countries, zoneGroups, zones, rules, zoneLaneRates, fxRates, carriers] = await Promise.all([
    listCountries(organizationId),
    listZoneGroups(organizationId),
    listZones(organizationId),
    listRules(organizationId),
    listZoneLaneRates(organizationId),
    listFxRates(organizationId),
    listSimulatedCarriers(organizationId),
  ]);
  return { countries, zoneGroups, zones, rules, zoneLaneRates, fxRates, carriers };
}
