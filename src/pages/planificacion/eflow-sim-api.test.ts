import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchExpedicionesCabecera,
  fetchExpedicionesDetalle,
  actualizarCabecera,
  actualizarDetalle,
} from './eflow-sim-api';

afterEach(() => vi.restoreAllMocks());

// Mock de fetch que devuelve `payload` como JSON y captura la URL/opciones de
// la última llamada para aseverar query string y método/body.
function mockFetch(payload: unknown, { ok = true, status = 200 } = {}) {
  const spy = vi.fn((..._args: Parameters<typeof fetch>) =>
    Promise.resolve({ ok, status, json: async () => payload }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('fetchExpedicionesCabecera', () => {
  it('arma el query string solo con los filtros no vacíos', async () => {
    const spy = mockFetch([]);
    await fetchExpedicionesCabecera({ IDCOMPANIA: '0109', TPEXES: 'DISP', IDALMACEN: '', PRIORIDAD: undefined });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/api/eflow-sim/expediciones-cabecera?');
    expect(url).toContain('IDCOMPANIA=0109');
    expect(url).toContain('TPEXES=DISP');
    expect(url).not.toContain('IDALMACEN');
    expect(url).not.toContain('PRIORIDAD');
  });

  it('sin filtros no agrega query string y devuelve las filas', async () => {
    const fila = { IDEXPEDICION: 'EXP-000123', IDCOMPANIA: '0109', PRIORIDAD: null };
    const spy = mockFetch([fila]);
    const rows = await fetchExpedicionesCabecera();
    expect(spy.mock.calls[0][0]).toBe('/api/eflow-sim/expediciones-cabecera');
    expect(rows).toEqual([fila]);
  });

  it('lanza si la respuesta no es ok', async () => {
    mockFetch({ status: 'error', message: 'boom' }, { ok: false, status: 500 });
    await expect(fetchExpedicionesCabecera()).rejects.toThrow('HTTP 500');
  });
});

describe('fetchExpedicionesDetalle', () => {
  it('no manda BAJADA (no está en el tipo) y usa la ruta de detalle', async () => {
    const spy = mockFetch([]);
    await fetchExpedicionesDetalle({ IDEXPEDICION: 'EXP-000123' });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/api/eflow-sim/expediciones-detalle?');
    expect(url).toContain('IDEXPEDICION=EXP-000123');
    expect(url).not.toContain('BAJADA');
  });
});

describe('actualizarCabecera / actualizarDetalle', () => {
  it('hace POST con JSON y devuelve la respuesta de success', async () => {
    const resp = { status: 'success', message: 'Updated', IDEXPEDICION: 'EXP-000123' };
    const spy = mockFetch(resp);
    const payload = { IDEXPEDICION: 'EXP-000123', IDCOMPANIA: '0109', IDALMACEN: '0001', IDSUCURSAL: '0001', TPEXSI: 'GENE' };
    const out = await actualizarCabecera(payload);
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe('/api/eflow-sim/expediciones-cabecera');
    expect(opts?.method).toBe('POST');
    expect(JSON.parse(opts?.body as string)).toEqual(payload);
    expect(out).toEqual(resp);
  });

  it('actualizarDetalle llega a la ruta de detalle', async () => {
    const spy = mockFetch({ status: 'success', message: 'Updated' });
    await actualizarDetalle({ IDEXPEDICION: 'EXP-000123', IDCOMPANIA: '0109', IDALMACEN: '0001', IDSUCURSAL: '0001', PRIORIDAD: 1 });
    expect(spy.mock.calls[0][0]).toBe('/api/eflow-sim/expediciones-detalle');
  });

  it('propaga el error cuando el POST responde no-ok', async () => {
    mockFetch({ status: 'error', message: 'faltan claves' }, { ok: false, status: 400 });
    await expect(
      actualizarCabecera({ IDEXPEDICION: '', IDCOMPANIA: '', IDALMACEN: '', IDSUCURSAL: '' }),
    ).rejects.toThrow('HTTP 400');
  });
});
