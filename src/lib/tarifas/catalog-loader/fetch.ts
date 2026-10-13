// Lectura del catálogo completo en DOS idas y vueltas a la API (antes eran ~14): primero todo lo que se
// puede pedir sin saber nada más, y después las filas hijas (renglones de costo y de tarifario) de lo
// que apareció.

import { db, findMany, primaryKeyOf, type FindRequest } from '../data';
import { toCountry } from './country';
import { buildMarginPolicy, buildRules, RULES_GLOBAL, RULES_OF_COUNTRY } from './rules';
import { buildZones, toZoneGroup, zoneGroupQuery, zoneQuery } from './zones';
import {
  buildCostStructure, buildPartyVariables, buildRateTableRows, costRowsQuery, costStructureQuery,
  pickRateTables, rateTableRowsQuery, rateTablesQuery,
} from './party';
import { CatalogError, type TarifasCatalog } from './types';

const eq = (column: string, value: unknown) => ({ column, op: 'eq' as const, value });

export async function fetchCatalog(countryId: string, partyId: string | null): Promise<TarifasCatalog> {
  const partyCost = costStructureQuery({ partyId });
  const defaultCost = costStructureQuery({ countryId });

  const requests: FindRequest[] = [
    { entity: 'country', options: { where: [eq(primaryKeyOf('country'), countryId)], limit: 1 } },
    { entity: 'countrySettings', options: { where: [eq('country_id', countryId)], limit: 1 } },
    { entity: 'marginPolicy', options: { where: [eq('country_id', countryId)], limit: 1 } },
    { entity: 'pricingRule', options: RULES_OF_COUNTRY(countryId) },
    { entity: 'pricingRule', options: RULES_GLOBAL },
    { entity: 'zone', options: zoneQuery(countryId) },
    { entity: 'zoneGroup', options: zoneGroupQuery(countryId) },
    { entity: 'rateTable', options: rateTablesQuery(countryId) },
  ];
  if (partyId) requests.push({ entity: 'partyVariable', options: { where: [eq('party_id', partyId)] } });
  if (partyCost) requests.push({ entity: 'costStructure', options: partyCost });
  if (defaultCost) requests.push({ entity: 'costStructure', options: defaultCost });

  const first = await findMany(db(), requests);
  const [countryRows, settingsRows, marginRows, ofCountry, global, zoneRows, groupRows, rateTableRows] = first;
  let next = 8;
  const partyVariableRows = partyId ? first[next++] : [];
  const partyStructureRow = partyCost ? first[next++][0] : undefined;
  const defaultStructureRow = defaultCost ? first[next++][0] : undefined;

  const country = countryRows[0] ? toCountry(countryRows[0], settingsRows[0]) : null;
  if (!country) {
    throw new CatalogError(
      `El país "${countryId}" no tiene configuración de cálculo (redondeo, pernocta) en Tarifas. `
        + 'Cargala antes de liquidar.',
    );
  }
  const marginPolicy = buildMarginPolicy(marginRows[0], countryId);
  if (!marginPolicy) {
    throw new CatalogError(
      `No hay política de margen para ${country.name} en Reglas de Tarifa → Política de Margen.`,
    );
  }

  const tables = pickRateTables(rateTableRows, partyId);

  // Segunda tanda: las filas hijas de lo que apareció.
  const children: FindRequest[] = [];
  if (partyStructureRow) children.push({ entity: 'costStructureRow', options: costRowsQuery(partyStructureRow.id) });
  if (defaultStructureRow) children.push({ entity: 'costStructureRow', options: costRowsQuery(defaultStructureRow.id) });
  if (tables.length) children.push({ entity: 'rateTableRow', options: rateTableRowsQuery(tables.map((t) => t.id)) });
  const second = children.length ? await findMany(db(), children) : [];
  let child = 0;
  const partyCostRows = partyStructureRow ? second[child++] : [];
  const defaultCostRows = defaultStructureRow ? second[child++] : [];
  const tableRows = tables.length ? second[child++] : [];

  const groups = groupRows.map(toZoneGroup);
  const cost = buildCostStructure(partyStructureRow, partyCostRows);
  const defaults = buildCostStructure(defaultStructureRow, defaultCostRows);

  return {
    country,
    rules: buildRules(ofCountry, global, countryId),
    zones: buildZones(zoneRows, groups),
    zoneGroups: groups,
    marginPolicy,
    partyVariables: buildPartyVariables(partyVariableRows),
    costStructure: cost.structure,
    costStructureRows: cost.rows,
    defaultCostStructure: defaults.structure,
    defaultCostStructureRows: defaults.rows,
    rateTables: tables,
    rateTableRows: buildRateTableRows(tableRows),
  };
}
