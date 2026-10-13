// @vitest-environment jsdom
//
// Prueba de caracterización del modal de variables de una compañía: fija las interacciones y el HTML
// que hoy produce, para poder partir el archivo sin cambiar nada visible. Los snapshots se generaron
// ANTES de la partición y no deben editarse a mano.
//
// Se parte de una compañía SIN perfil (partyId null): la lista está vacía y al guardar se resuelve el
// perfil existente del seed, que ya trae sus propias variables (por eso la clave nueva es otra).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VariablesModal from './VariablesModal';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

const perms = vi.hoisted(() => ({ canCreate: true, canEdit: true }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canDelete: true, canView: true }),
}));

const ensure = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../../lib/tarifas/partiesDataSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tarifas/partiesDataSource')>();
  ensure.fn.mockImplementation(actual.ensurePartyProfile);
  return { ...actual, ensurePartyProfile: ensure.fn };
});

const profile = (partyId: string | null): CarrierProfile => ({
  carrierId: 'CARRIER_VE_1', code: 'C1', name: 'Transportes Uno', taxId: null, countryId: 'VE',
  classification: 'OWN', carrierStatus: 'active', partyId, profileStatus: partyId ? 'active' : null,
} as CarrierProfile);

const EMPTY = 'Esta compañía no tiene variables propias';
const NEW_LABEL = 'Horas de carga';

function open(party: CarrierProfile = profile(null), onProfileCreated?: () => void) {
  return render(<VariablesModal isOpen party={party} onClose={() => {}} onProfileCreated={onProfileCreated} />);
}

function fill(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
}

function fillNewVariable() {
  fill('horas_espera', 'horas_carga');
  fill('Horas de espera', NEW_LABEL);
  fill('15', '15');
  fill('horas', 'horas');
}

const rowOf = (label: string) => screen.getByText(label, { selector: 'td' }).closest('tr') as HTMLElement;

async function addNewVariable() {
  fillNewVariable();
  fireEvent.click(screen.getByRole('button', { name: /Agregar variable/ }));
  await screen.findByText(NEW_LABEL, { selector: 'td' });
}

beforeEach(() => { localStorage.clear(); perms.canCreate = true; perms.canEdit = true; ensure.fn.mockClear(); });
afterEach(cleanup);

vi.setConfig({ testTimeout: 20_000 }); // renderizan modales grandes: con la máquina cargada superan los 5 s por defecto

describe('VariablesModal (caracterización)', () => {
  it('sin variables: muestra el estado vacío y el formulario de alta', async () => {
    const { container } = open();
    await screen.findByText(EMPTY);
    expect(screen.getByText('Nueva variable')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('con un perfil existente lista sus variables del seed', async () => {
    const { container } = open(profile('CARRIER_VE_1'));
    await screen.findByText('Horas de espera', { selector: 'td' });
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('agrega una variable, la lista y limpia el formulario', async () => {
    const { container } = open();
    await screen.findByText(EMPTY);
    await addNewVariable();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(within(rowOf(NEW_LABEL)).getByText('Activa')).toBeTruthy();
    expect((screen.getByPlaceholderText('horas_espera') as HTMLInputElement).value).toBe('');
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('con el formulario vacío no agrega nada y marca errores en los campos', async () => {
    const { container } = open();
    await screen.findByText(EMPTY);
    fireEvent.click(screen.getByRole('button', { name: /Agregar variable/ }));
    await waitFor(() => expect(container.querySelectorAll('.text-red-600, .text-red-500').length).toBeGreaterThan(0));
    expect(screen.getByText('Nueva variable')).toBeTruthy();
    // Comportamiento actual: el perfil se resuelve ANTES de validar, así que la lista pasa a mostrar
    // las variables que ya tenía la compañía; la variable inválida no se agrega.
    await screen.findByText('Horas de espera', { selector: 'td' });
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('edita: la clave queda bloqueada, se puede cambiar el nombre y cancelar', async () => {
    const { container } = open();
    await screen.findByText(EMPTY);
    await addNewVariable();

    fireEvent.click(within(rowOf(NEW_LABEL)).getByTitle('Editar'));
    expect(screen.getByText('Editar variable')).toBeTruthy();
    expect((screen.getByPlaceholderText('horas_espera') as HTMLInputElement).disabled).toBe(true);
    expect(container.innerHTML).toMatchSnapshot();

    fill('Horas de espera', 'Espera en andén');
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await screen.findByText('Espera en andén', { selector: 'td' });
    expect(screen.getByText('Nueva variable')).toBeTruthy();

    fireEvent.click(within(rowOf('Espera en andén')).getByTitle('Editar'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Nueva variable')).toBeTruthy();
    expect((screen.getByPlaceholderText('Horas de espera') as HTMLInputElement).value).toBe('');
  });

  it('da de baja y reactiva', async () => {
    const { container } = open();
    await screen.findByText(EMPTY);
    await addNewVariable();

    fireEvent.click(within(rowOf(NEW_LABEL)).getByTitle('Dar de baja'));
    await waitFor(() => expect(within(rowOf(NEW_LABEL)).getByText('De baja')).toBeTruthy());
    expect(container.innerHTML).toMatchSnapshot();

    fireEvent.click(within(rowOf(NEW_LABEL)).getByTitle('Reactivar'));
    await waitFor(() => expect(within(rowOf(NEW_LABEL)).getByText('Activa')).toBeTruthy());
  });

  it('sin permiso de crear el botón de alta está deshabilitado y lo explica', async () => {
    perms.canCreate = false;
    open();
    await screen.findByText(EMPTY);
    const add = screen.getByRole('button', { name: /Agregar variable/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.title).toBe('Tu rol no puede modificar variables');
  });

  it('sin permiso de editar las acciones de la fila están deshabilitadas', async () => {
    perms.canEdit = false;
    open(profile('CARRIER_VE_1'));
    const row = await screen.findByText('Horas de espera', { selector: 'td' });
    const buttons = within(row.closest('tr') as HTMLElement).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('un perfil que ya existe no avisa que se creó; uno nuevo sí, una sola vez', async () => {
    const created = vi.fn();
    ensure.fn.mockResolvedValueOnce({ status: 'saved', partyId: 'CARRIER_VE_1', created: false });
    const first = open(profile(null), created);
    await screen.findByText(EMPTY);
    await addNewVariable();
    expect(ensure.fn).toHaveBeenCalledTimes(1);
    expect(created).not.toHaveBeenCalled();
    first.unmount();

    localStorage.clear();
    ensure.fn.mockResolvedValueOnce({ status: 'saved', partyId: 'CARRIER_VE_1', created: true });
    open(profile(null), created);
    await screen.findByText(EMPTY);
    await addNewVariable();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('si no se puede crear el perfil muestra el error y no guarda', async () => {
    ensure.fn.mockResolvedValueOnce({ status: 'failed', error: { message: 'No se pudo crear el perfil' } });
    const { container } = open();
    await screen.findByText(EMPTY);
    fillNewVariable();
    fireEvent.click(screen.getByRole('button', { name: /Agregar variable/ }));
    await screen.findByText('No se pudo crear el perfil');
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
  });
  it('al volver a abrir el modal el formulario queda en blanco (no arrastra lo tecleado)', async () => {
    const { rerender } = open();
    await screen.findByText(EMPTY);
    fillNewVariable();
    expect((screen.getByPlaceholderText('horas_espera') as HTMLInputElement).value).toBe('horas_carga');

    rerender(<VariablesModal isOpen={false} party={profile(null)} onClose={() => {}} />);
    rerender(<VariablesModal isOpen party={profile(null)} onClose={() => {}} />);
    await screen.findByText(EMPTY);
    expect((screen.getByPlaceholderText('horas_espera') as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText('Horas de espera') as HTMLInputElement).value).toBe('');
  });});
