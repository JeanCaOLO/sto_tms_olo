// La bitácora no puede tumbar un cambio ya guardado, pero tampoco fallar en silencio (auditoría B2).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataSource } from '../tarifas/data';
import { HttpDataSource } from '../tarifas/data/http-datasource';
import { createFakeBackend } from '../tarifas/data/memory/fakeBackend';
import { onAuditFailure, registrarEventoSeguro } from './auditLog';

const evento = { entidad: 'pricing_rules', entidadId: 'r1', accion: 'UPDATE' as const, usuario: 'u@x.com', rol: 'Rol' };
const sinPermiso = async () => new Response(
  JSON.stringify({ data: null, error: { message: 'Tu rol no tiene permiso para "create" en "tarifas".' } }),
  { status: 403, headers: { 'Content-Type': 'application/json' } },
);

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe('registrarEventoSeguro', () => {
  it('registra y devuelve true cuando la bitácora acepta el evento', async () => {
    setDataSource(new HttpDataSource({ baseUrl: 'http://mock.local/api', fetchImpl: createFakeBackend(), retries: 0 }));
    const listener = vi.fn();
    const off = onAuditFailure(listener);
    expect(await registrarEventoSeguro(evento)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('si la bitácora responde 403 no lanza, devuelve false y avisa', async () => {
    setDataSource(new HttpDataSource({ baseUrl: 'http://mock.local/api', fetchImpl: sinPermiso as unknown as typeof fetch, retries: 0 }));
    const listener = vi.fn();
    const off = onAuditFailure(listener);
    await expect(registrarEventoSeguro(evento)).resolves.toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(String((listener.mock.calls[0][0] as Error).message)).toContain('Tu rol no tiene permiso');
    off();
  });
});
