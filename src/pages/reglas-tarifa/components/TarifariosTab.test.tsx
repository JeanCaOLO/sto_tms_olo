// @vitest-environment jsdom
//
// Caracterización de la pestaña de tarifarios: lista, selección, filas y permisos. Se apoya en el
// tarifario ZONAS del seed de Venezuela (6 filas). Los snapshots se generaron ANTES de partir los
// archivos y no deben editarse a mano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TarifariosTab from './TarifariosTab';

const perms = vi.hoisted(() => ({ canCreate: true, canEdit: true, canDelete: true }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canView: true }),
}));

// El modal de importación registra en la bitácora con el usuario real.
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { full_name: 'Auditor de prueba', email: 'auditor@example.com' } }),
}));

const ZONES =[{ id: 'z1', code: 'CCS', name: 'Caracas' }, { id: 'z2', code: 'MCBO', name: 'Maracaibo' }];

function open() {
  return render(
    <MemoryRouter>
      <TarifariosTab countryId="VE" currency="VES" zones={ZONES} />
    </MemoryRouter>,
  );
}

const html = (container: HTMLElement) => container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_');
const rowsTable = () => screen.getAllByRole('table')[1] as HTMLElement;
const rowCount = () => rowsTable().querySelectorAll('tbody tr').length;

async function selectZonas() {
  await screen.findByText('ZONAS');
  fireEvent.click(screen.getByText('ZONAS'));
  await screen.findByText(/Filas de/);
  await waitFor(() => expect(rowCount()).toBeGreaterThan(1));
}

beforeEach(() => { localStorage.clear(); perms.canCreate = true; perms.canEdit = true; perms.canDelete = true; vi.restoreAllMocks(); });
afterEach(cleanup);

describe('TarifariosTab (caracterización)', () => {
  it('lista los tarifarios del país y avisa que se puede tocar uno', async () => {
    const { container } = open();
    await screen.findByText('ZONAS');
    expect(screen.getByText(/Tocá un tarifario para ver y cargar sus filas/)).toBeTruthy();
    expect(screen.getByText('Todo el país')).toBeTruthy();
    expect(html(container)).toMatchSnapshot();
  });

  it('al elegir un tarifario muestra sus filas y el formulario; se puede cerrar', async () => {
    const { container } = open();
    await selectZonas();
    expect(rowCount()).toBe(6);
    expect(screen.getByText('Nueva fila')).toBeTruthy();
    expect(html(container)).toMatchSnapshot();

    fireEvent.click(within(screen.getByText(/Filas de/).closest('div') as HTMLElement).getByTitle('Cerrar'));
    expect(screen.queryByText(/Filas de/)).toBeNull();
  });

  it('sin permisos los botones se bloquean y lo explican', async () => {
    perms.canCreate = false; perms.canEdit = false; perms.canDelete = false;
    open();
    await screen.findByText('ZONAS');
    expect((screen.getByRole('button', { name: /Nuevo tarifario/ }) as HTMLButtonElement).title).toBe('Tu rol no puede crear tarifarios');
    expect((screen.getByTitle('Tu rol no puede eliminar tarifarios') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByTitle('Tu rol no puede editar tarifarios').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);

    fireEvent.click(screen.getByText('ZONAS'));
    await screen.findByText(/Filas de/);
    await waitFor(() => expect(rowCount()).toBeGreaterThan(1));
    expect(within(rowsTable()).getAllByTitle('Tu rol no puede eliminar filas').length).toBe(rowCount());
    expect(within(rowsTable()).getAllByTitle('Tu rol no puede editar tarifarios').length).toBe(rowCount());
    expect((screen.getByRole('button', { name: /Agregar/ }) as HTMLButtonElement).title).toBe('Tu rol no puede editar tarifarios');
  });

  it('desactiva y reactiva un tarifario', async () => {
    open();
    await screen.findByText('ZONAS');
    fireEvent.click(screen.getByTitle('Desactivar'));
    await screen.findByText('Inactivo');
    fireEvent.click(screen.getByTitle('Reactivar'));
    await screen.findByText('Activo');
  });

  it('elimina un tarifario solo si se confirma', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    open();
    await screen.findByText('ZONAS');

    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle('Eliminar'));
    expect(screen.getByText('ZONAS')).toBeTruthy();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByTitle('Eliminar'));
    await screen.findByText(/^No hay tarifarios en este país\. Un tarifario reemplaza a un montón de reglas casi iguales/);
    expect(confirm).toHaveBeenLastCalledWith(
      '¿Eliminar "ZONAS" y todas sus filas? Las reglas que lo nombren van a usar su importe de respaldo.',
    );
  });

  it('agrega una fila: el importe es obligatorio y la fila nueva aparece', async () => {
    const { container } = open();
    await selectZonas();

    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    await waitFor(() => expect(container.querySelector('.text-red-600')).not.toBeNull());
    expect(rowCount()).toBe(6);

    const [origin, dest] = screen.getAllByPlaceholderText('cualquiera') as HTMLInputElement[];
    fireEvent.change(origin, { target: { value: 'CCS' } });
    fireEvent.change(dest, { target: { value: 'MCBO' } });
    fireEvent.change(screen.getByLabelText('Importe *'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    await waitFor(() => expect(rowCount()).toBe(7));
  });

  it('edita una fila y puede cancelar', async () => {
    const { container } = open();
    await selectZonas();
    fireEvent.click(within(rowsTable()).getAllByTitle('Editar')[0]);
    await screen.findByText('Editar fila');
    expect(html(container)).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Nueva fila')).toBeTruthy();
  });

  it('un tarifario sin filas explica qué pasa con las reglas que lo usan', async () => {
    open();
    await selectZonas();
    for (let n = rowCount(); n > 0; n -= 1) {
      fireEvent.click(within(rowsTable()).getAllByTitle('Eliminar')[0]);
      await waitFor(() => expect(rowsTable().querySelectorAll('tbody tr').length).toBeLessThanOrEqual(n - 1 || 1));
    }
    await screen.findByText('Este tarifario no tiene filas. Mientras esté vacío, una regla que lo use cobra siempre su importe de respaldo.');
  });

  it('elimina una fila', async () => {
    open();
    await selectZonas();
    fireEvent.click(within(rowsTable()).getAllByTitle('Eliminar')[0]);
    await waitFor(() => expect(rowCount()).toBe(5));
  });
});
