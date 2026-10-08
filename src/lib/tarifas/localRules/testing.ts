// Utilidades para el "Probador del motor": expone datos crudos sin pasar por `repository.ts`.

import { listCountries } from './countries';
import { listZoneGroups, listZones } from './zones';
import { listRules } from './rules';
import { listSimulatedCarriers } from './carriers';
import { listMarginPolicies } from './margins';

export async function listRulesAndZonesForTesting(organizationId: string) {
  const [
    countries, zoneGroups, zones, rules, carriers,
    marginPolicies,
  ] = await Promise.all([
    listCountries(organizationId),
    listZoneGroups(organizationId),
    listZones(organizationId),
    listRules(organizationId),
    listSimulatedCarriers(organizationId),
    listMarginPolicies(organizationId),
  ]);
  return {
    countries, zoneGroups, zones, rules, carriers,
    marginPolicies,
  };
}
