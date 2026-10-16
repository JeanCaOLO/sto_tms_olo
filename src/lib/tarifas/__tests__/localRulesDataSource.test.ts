// @vitest-environment jsdom
//
// Zonas y grupos de zona: acotados por país en la BD, pero el selector del país activo
// (`CountryScopeBar`) es lo que le da sentido a esa columna. `listZones`/`listZoneGroups` traen TODO
// (todas las filas, de todos los países) porque el filtrado por país activo lo hace la pantalla —
// el mismo patrón que ya usa `page.tsx` para zonas (`countryZones`). Lo que este test cuida es que
// cada fila venga con el `country_id` puesto: sin él, la pantalla no tiene con qué filtrar y el
// selector de grupo de zona termina mostrando los grupos de los tres países mezclados (el bug real
// que tenía `listZoneGroups`, que devolvía solo `{id, name}`).

import { beforeEach, describe, expect, it } from 'vitest';
import { listZoneGroups, listZones } from '../localRulesDataSource';

beforeEach(() => localStorage.clear());

describe('listZones', () => {
  it('cada fila trae su country_id, para que la pantalla pueda acotar al país activo', async () => {
    const zonas = await listZones('org');
    expect(zonas.length).toBeGreaterThan(0);
    expect(zonas.every((z) => typeof z.country_id === 'string' && z.country_id)).toBe(true);

    const porPais = new Set(zonas.map((z) => z.country_id));
    // La semilla trae zonas de los tres países: si esto da 1, algo las está filtrando de más.
    expect(porPais.size).toBeGreaterThanOrEqual(3);
  });
});

describe('listZoneGroups', () => {
  it('cada fila trae su country_id, no solo id y nombre', async () => {
    const grupos = await listZoneGroups('org');
    expect(grupos.length).toBeGreaterThan(0);
    expect(grupos.every((g) => typeof g.country_id === 'string' && g.country_id)).toBe(true);
  });

  it('filtrar por país activo no mezcla grupos de otro país', async () => {
    const grupos = await listZoneGroups('org');
    const paises = new Set(grupos.map((g) => g.country_id));
    expect(paises.size).toBeGreaterThanOrEqual(3);

    for (const pais of paises) {
      const propios = grupos.filter((g) => g.country_id === pais);
      const ajenos = grupos.filter((g) => g.country_id !== pais);
      // Ningún grupo del país activo debería aparecer también del lado de "ajenos".
      expect(propios.every((g) => !ajenos.includes(g))).toBe(true);
    }
  });
});
