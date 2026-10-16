// @vitest-environment jsdom
//
// Caracterización del alta y edición de un tarifario. Los snapshots se generaron ANTES de la
// partición y no deben editarse a mano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RateTableModal from './RateTableModal';
import { listRateTables } from '../../../lib/tarifas/rateTablesDataSource';
import { listCarrierProfiles } from '../../../lib/tarifas/partiesDataSource';
import type { RateTable } from '../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

const perms = vi.hoisted(() => ({ canCreate: true, canEdit: true }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canDelete: true, canView: true }),
}));

let parties: CarrierProfile[] = [];
let zonas: RateTable;

async function open(table: RateTable | null = null, partiesProp: CarrierProfile[] = parties) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <RateTableModal isOpen countryId="VE" table={table} parties={partiesProp} currency="VES" onClose={onClose} onSaved={onSaved} />,
  );
  return { ...view, onClose, onSaved };
}

const keyItems = (container: HTMLElement) => Array.from(container.querySelectorAll('ol li'));
const keyNames = (container: HTMLElement) => keyItems(container).map((li) => li.querySelector('span.flex-1')?.textContent);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submitButton = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(async () => {
  localStorage.clear();
  perms.canCreate = true; perms.canEdit = true;
  parties = await listCarrierProfiles({ countryId: 'VE', includeInactive: true });
  zonas = (await listRateTables('VE', { includeInactive: true }))[0] as RateTable;
});
afterEach(cleanup);

describe('RateTableModal (caracterización)', () => {
  it('cerrado no renderiza nada', () => {
    const { container } = render(
      <RateTableModal isOpen={false} countryId="VE" table={null} parties={[]} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('alta: formulario vacío con la clave por defecto', async () => {
    const { container } = await open();
    expect(screen.getByText('Nuevo tarifario')).toBeTruthy();
    expect(keyItems(container).length).toBe(2);
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();
  });

  it('el código se escribe en mayúsculas', async () => {
    await open();
    type('Código *', 'tarifa_nueva');
    expect((screen.getByLabelText('Código *') as HTMLInputElement).value).toBe('TARIFA_NUEVA');
  });

  it('con el formulario vacío no guarda y marca los errores', async () => {
    const { container, onSaved, onClose } = await open();
    fireEvent.click(submitButton(/^Crear tarifario$/));
    await waitFor(() => expect(container.querySelectorAll('.text-red-600').length).toBeGreaterThan(0));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();
  });

  it('crea el tarifario, avisa y cierra', async () => {
    const { onSaved, onClose } = await open();
    type('Código *', 'tarifa_nueva');
    type('Nombre *', 'Tarifa nueva de prueba');
    type('Nombres de las columnas', 'flete, peaje');
    fireEvent.click(submitButton(/^Crear tarifario$/));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
    const creada = (await listRateTables('VE', { includeInactive: true })).find((t) => t.code === 'TARIFA_NUEVA');
    expect(creada?.name).toBe('Tarifa nueva de prueba');
    expect(creada?.valueColumns).toEqual(['flete', 'peaje']);
  });

  it('un código repetido en el país no se guarda', async () => {
    const { container, onClose } = await open();
    type('Código *', 'ZONAS');
    type('Nombre *', 'Otra');
    fireEvent.click(submitButton(/^Crear tarifario$/));
    await waitFor(() => expect(container.querySelectorAll('.text-red-600').length).toBeGreaterThan(0));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('la clave se puede quitar, agregar y reordenar', async () => {
    const { container } = await open();
    const [first, second] = keyNames(container);

    fireEvent.click(within(keyItems(container)[1] as HTMLElement).getAllByRole('button')[0]);
    expect(keyNames(container)).toEqual([second, first]);

    fireEvent.click(within(keyItems(container)[0] as HTMLElement).getAllByRole('button')[2]);
    expect(keyNames(container)).toEqual([first]);

    const add = screen.getByLabelText('Agregar variable a la clave') as HTMLSelectElement;
    fireEvent.change(add, { target: { value: add.options[1].value } });
    expect(keyItems(container).length).toBe(2);
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();
  });

  it('los extremos de la clave no se pueden mover hacia afuera', async () => {
    const { container } = await open();
    const items = keyItems(container);
    expect((within(items[0] as HTMLElement).getAllByRole('button')[0] as HTMLButtonElement).disabled).toBe(true);
    expect((within(items[1] as HTMLElement).getAllByRole('button')[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('edición: cargar el tarifario y avisar si se cambia la clave', async () => {
    const { container } = await open(zonas);
    expect(screen.getByText(`Editar ${zonas.code}`)).toBeTruthy();
    expect((screen.getByLabelText('Código *') as HTMLInputElement).value).toBe(zonas.code);
    expect(screen.queryByText(/Cambiaste la clave de un tarifario que ya tiene filas/)).toBeNull();
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();

    fireEvent.click(within(keyItems(container)[1] as HTMLElement).getAllByRole('button')[2]);
    expect(screen.getByText(/Cambiaste la clave de un tarifario que ya tiene filas/)).toBeTruthy();
  });

  it('edición: guardar conserva el código y actualiza el nombre', async () => {
    const { onSaved, onClose } = await open(zonas);
    type('Nombre *', 'Zonas renombrado');
    fireEvent.click(submitButton(/^Guardar cambios$/));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
    const guardada = (await listRateTables('VE', { includeInactive: true })).find((t) => t.id === zonas.id);
    expect(guardada?.name).toBe('Zonas renombrado');
  });

  it('el alcance por compañía ofrece las compañías del país y guarda su perfil', async () => {
    await open();
    const scope = screen.getByLabelText('Alcance') as HTMLSelectElement;
    expect(scope.options.length).toBe(parties.length + 1);
    expect(scope.options[0].textContent).toBe('Todo el país');
    const withProfile = parties.find((p) => p.partyId) as CarrierProfile;
    fireEvent.change(scope, { target: { value: withProfile.carrierId } });
    type('Código *', 'POR_COMPANIA');
    type('Nombre *', 'Por compañía');
    fireEvent.click(submitButton(/^Crear tarifario$/));
    await waitFor(async () => {
      const t = (await listRateTables('VE', { includeInactive: true })).find((x) => x.code === 'POR_COMPANIA');
      expect(t?.partyId).toBe(withProfile.partyId);
    });
  });

  it('sin permiso el botón principal se deshabilita (alta y edición)', async () => {
    perms.canCreate = false;
    await open();
    expect(submitButton(/^Crear tarifario$/).disabled).toBe(true);
    cleanup();
    perms.canEdit = false;
    await open(zonas);
    expect(submitButton(/^Guardar cambios$/).disabled).toBe(true);
  });

  it('con una compañía asignada y la lista de compañías sin cargar no permite guardar', async () => {
    await open({ ...zonas, partyId: 'CARRIER_VE_1' }, []);
    expect(submitButton(/^Guardar cambios$/).disabled).toBe(true);
  });

  it('cancelar cierra sin guardar', async () => {
    const { onClose, onSaved } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
