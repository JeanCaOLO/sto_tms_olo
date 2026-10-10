// Evidencia de auditoría (copia aislada): con HttpDataSource, `tx.insert` devuelve lo ENVIADO, sin el id
// que genera el servidor. `saveStructure` de una estructura nueva usa ese retorno.
import { describe, expect, it } from 'vitest';
import { HttpDataSource } from '../data/http-datasource';
import { setDataSource } from '../data';
import { saveStructure, addRow } from '../costStructureDataSource';

describe('H9 — id de una estructura de costos nueva con el driver HTTP', () => {
  it('saveStructure devuelve structure.id undefined', async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url: `${init?.method ?? 'GET'} ${url}`, body: init?.body });
      if (url.endsWith('/tarifas/tx')) return new Response(JSON.stringify([{ id: 'cstr_servidor_1' }]), { status: 200 });
      return new Response('[]', { status: 200 }); // find(): no hay otras estructuras activas
    };
    setDataSource(new HttpDataSource({ baseUrl: 'http://x/api', fetchImpl: fetchImpl as unknown as typeof fetch, retries: 0 }));
    const r = await saveStructure({ partyId: 'party_1', countryId: 'c-1', name: 'Estructura nueva', operatingDaysPerMonth: 30, effectiveFrom: null, active: true, notes: null });
    console.log('RESULTADO', JSON.stringify(r), '\nLLAMADAS', JSON.stringify(calls.map((c) => c.url)));
    expect(r.status).toBe('saved');
    if (r.status === 'saved') {
      expect(r.structure.id).toBeUndefined(); // documenta el defecto
      calls.length = 0;
      const row = await addRow(r.structure.id, { code: 'SALARIO', label: 'Salario', driver: 'PER_MONTH_PRORATED', amount: '1000', sign: 'ADD', appliesWhen: null, unit: null, active: true } as never).catch((e) => ({ error: String(e) }));
      console.log('ADDROW', JSON.stringify(row), JSON.stringify(calls));
    }
  });
});
