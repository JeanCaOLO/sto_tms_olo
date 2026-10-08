// @vitest-environment jsdom
//
// Rol con permiso solo de lectura sobre la configuración (Liquidador): puede ABRIR una regla y leerla,
// pero no cambiarla ni guardarla.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RuleModal from './RuleModal';
import { listRules } from '../../../lib/tarifas/localRulesDataSource';

const perms = vi.hoisted(() => ({ canCreate: false, canEdit: false }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canDelete: false, canView: true }),
}));

beforeEach(() => { perms.canCreate = false; perms.canEdit = false; });
afterEach(cleanup);

async function open() {
  const [rule] = await listRules('ORG');
  render(
    <MemoryRouter>
      <RuleModal
        isOpen onClose={() => {}} onSuccess={() => {}} rule={rule}
        organizationId="ORG" country={{ id: 'VE', name: 'Venezuela', local_currency: 'VES' }} usuarioActivo="Lectura"
      />
    </MemoryRouter>,
  );
}

describe('RuleModal en solo lectura', () => {
  it('se titula «Ver regla», no ofrece guardar y deshabilita los campos', async () => {
    await open();
    await screen.findByText('Ver regla');
    expect(screen.queryByText('Guardar cambios')).toBeNull();
    expect(screen.getByText('Cerrar')).toBeTruthy();
    const fieldset = document.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
  });

  it('con permiso de edición sigue siendo «Editar regla» con su botón de guardar', async () => {
    perms.canEdit = true;
    await open();
    await screen.findByText('Editar regla');
    await waitFor(() => expect(screen.getByText('Guardar cambios')).toBeTruthy());
    expect(document.querySelector('fieldset')).toBeNull();
  });
});
