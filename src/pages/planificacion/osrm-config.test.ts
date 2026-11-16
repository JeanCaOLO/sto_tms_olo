import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const token = vi.hoisted(() => ({ valor: null as string | null }));
vi.mock('../../lib/api-client', () => ({ currentAccessToken: () => token.valor }));

import { osrmFetch } from './osrm-config';

const RUTA = 'route/v1/driving/-84.09,9.93;-85.43,10.63?overview=false';

describe('osrmFetch', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    token.valor = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('con sesión va al OSRM propio por el backend, con el token', async () => {
    token.valor = 'tk';
    fetchMock.mockResolvedValueOnce(new Response('{"code":"Ok"}', { status: 200 }));
    const res = await osrmFetch(RUTA);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/planificacion/osrm/${RUTA}`);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tk');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si el backend no tiene OSRM para esos puntos (503) usa el público', async () => {
    token.valor = 'tk';
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    fetchMock.mockResolvedValueOnce(new Response('{"code":"Ok"}', { status: 200 }));
    await osrmFetch(RUTA);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://router.project-osrm.org/${RUTA}`);
  });

  it('un error de OSRM que no es 503/404 se devuelve tal cual (sin ir al público)', async () => {
    token.valor = 'tk';
    fetchMock.mockResolvedValueOnce(new Response('{"code":"NoRoute"}', { status: 400 }));
    expect((await osrmFetch(RUTA)).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin sesión va directo al público', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await osrmFetch(RUTA);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://router.project-osrm.org/${RUTA}`);
  });

  it('si la petición se abortó no reintenta con el público', async () => {
    token.valor = 'tk';
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(osrmFetch(RUTA, { signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
