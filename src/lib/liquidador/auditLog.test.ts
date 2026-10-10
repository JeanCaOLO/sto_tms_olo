// La bitácora no puede tumbar un cambio ya guardado, pero tampoco fallar en silencio (auditoría B2).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataSource } from '../tarifas/data';
import { HttpDataSource } from '../tarifas/data/http-datasource';
import { createFakeBackend, type MockRole } from '../tarifas/data/memory/fakeBackend';
import { onAuditFailure, registrarEventoSeguro } from './auditLog';

let role: MockRole = 'admin';
const evento = { entidad: 'pricing_rules', entidadId: 'r1', accion: 'UPDATE' as const, usuario: 'u@x.com', rol: 'Rol' };

beforeEach(() => {
  role = 'admin';
  setDataSource(new HttpDataSource({ baseUrl: 'http://mock.local/api', fetchImpl: createFakeBackend({ role: () => role }), retries: 0 }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('registrarEventoSeguro', () => {
  it('registra y devuelve true cuando el rol puede escribir la bitácora', async () => {
    const listener = vi.fn();
    const off = onAuditFailure(listener);
    expect(await registrarEventoSeguro(evento)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('con un rol que solo configura (403) no lanza, devuelve false y avisa', async () => {
    role = 'configurar';
    const listener = vi.fn();
    const off = onAuditFailure(listener);
    await expect(registrarEventoSeguro(evento)).resolves.toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(String((listener.mock.calls[0][0] as Error).message)).toContain('Tu rol no tiene permiso');
    off();
  });
});
