// @vitest-environment jsdom
//
// Alerta Margen: si la lectura de la política falla no se puede guardar, porque el formulario
// parecería "sin política" y el guardado insertaría una fila duplicada para el país.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MargenPolicyTab from './MargenPolicyTab';
import { listMarginPolicies, saveMarginPolicy } from '../../../lib/tarifas/localRulesDataSource';

vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canView: true, canCreate: true, canEdit: true, canDelete: true }),
}));
vi.mock('../../../lib/tarifas/localRulesDataSource', () => ({
  listMarginPolicies: vi.fn(),
  saveMarginPolicy: vi.fn(),
}));

const list = vi.mocked(listMarginPolicies);
const save = vi.mocked(saveMarginPolicy);

const POLICY = {
  id: 'P1', country_id: 'CR', warn_below: '0.20', critical_below: '0.05',
  require_reason_below: '0.20', block_on_loss: false,
};

const open = () => render(<MargenPolicyTab organizationId="ORG" countryId="CR" />);
const guardar = () => screen.getByRole('button', { name: /Guardar umbrales/ }) as HTMLButtonElement;

beforeEach(() => {
  list.mockReset();
  save.mockReset();
  save.mockResolvedValue({ error: null } as Awaited<ReturnType<typeof saveMarginPolicy>>);
});
afterEach(cleanup);

describe('MargenPolicyTab', () => {
  it('si falla la carga no deja guardar, avisa y no ofrece el texto de "sin configurar"', async () => {
    list.mockRejectedValue(new Error('sin conexión'));
    open();

    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('sin conexión');
    expect(guardar().disabled).toBe(true);
    expect(screen.queryByText(/Sin esto configurado/)).toBeNull();

    fireEvent.click(guardar());
    expect(save).not.toHaveBeenCalled();
  });

  it('"Reintentar" vuelve a leer y, si ahora carga, habilita el guardado sobre la política existente', async () => {
    list.mockRejectedValueOnce(new Error('sin conexión'));
    // Tras guardar el componente vuelve a leer: también esa lectura devuelve la política.
    list.mockResolvedValue([POLICY] as unknown as Awaited<ReturnType<typeof listMarginPolicies>>);
    open();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await waitFor(() => expect(guardar().disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(guardar());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    // Con política existente se actualiza su id (no se inserta otra fila).
    expect(save.mock.calls[0][2]).toBe('P1');
  });

  it('sin política cargada correctamente avisa que usa los umbrales por defecto y guarda como nueva', async () => {
    list.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof listMarginPolicies>>);
    open();
    await screen.findByText(/Sin esto configurado/);
    expect(guardar().disabled).toBe(false);

    fireEvent.click(guardar());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][2]).toBeUndefined();
  });
});
