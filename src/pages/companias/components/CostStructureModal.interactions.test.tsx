// @vitest-environment jsdom
//
// Prueba de caracterización de las INTERACCIONES de CostStructureModal (copiar la estructura del país,
// alta/edición/baja/borrado de filas, parámetros, plantilla e importación). Complementa a
// CostStructureModal.test.tsx. Los snapshots se generaron ANTES de la partición y no deben editarse a mano.
//
// Se parte de una compañía de flota propia SIN estructura propia: ve la del país (heredada) y el
// seed trae la del país con sus conceptos.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CostStructureModal from './CostStructureModal';
import { activeStructure } from '../../../lib/tarifas/costStructureDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

const perms = vi.hoisted(() => ({ canCreate: true, canEdit: true, canDelete: true }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canView: true }),
}));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { full_name: 'Auditor de prueba', email: 'auditor@example.com' } }),
}));

const ensure = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../../lib/tarifas/partiesDataSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tarifas/partiesDataSource')>();
  ensure.fn.mockImplementation(actual.ensurePartyProfile);
  return { ...actual, ensurePartyProfile: ensure.fn };
});

const profile = (partyId: string | null = 'CARRIER_VE_1'): CarrierProfile => ({
  carrierId: 'CARRIER_VE_1', code: 'C1', name: 'Transportes Uno', taxId: null, countryId: 'VE',
  classification: 'OWN', carrierStatus: 'active', partyId, profileStatus: partyId ? 'active' : null,
} as CarrierProfile);

const INHERITED = /usa la estructura de costos del país/;
const COPY = 'Crear una propia a partir de la del país';
const BLOCKED = /Esta compañía usa la estructura del país\. Antes de agregar conceptos/;
const CSV = 'Concepto,Importe\nPeaje extra,50\n';

function open(party = profile(), onProfileCreated?: () => void) {
  return render(
    <MemoryRouter>
      <CostStructureModal isOpen party={party} currency="VES" onClose={() => {}} onProfileCreated={onProfileCreated} />
    </MemoryRouter>,
  );
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement;

async function copyFromCountry() {
  await screen.findByText(INHERITED);
  click(new RegExp(COPY));
  await waitFor(() => expect(screen.queryByText(INHERITED)).toBeNull());
  await screen.findAllByTitle('Editar');
}

async function addRow(label: string, amount: string) {
  type('Concepto', label);
  type('Importe (VES)', amount);
  click('Agregar');
  await screen.findByText(label);
}

beforeEach(() => {
  localStorage.clear();
  perms.canCreate = true; perms.canEdit = true; perms.canDelete = true;
  ensure.fn.mockClear();
  vi.restoreAllMocks();
});
afterEach(cleanup);

vi.setConfig({ testTimeout: 20_000 }); // renderizan modales grandes: con la máquina cargada superan los 5 s por defecto

describe('CostStructureModal: estructura heredada', () => {
  it('muestra la del país y bloquea agregar conceptos hasta crear una propia', async () => {
    const { container } = open();
    await screen.findByText(INHERITED);
    expect(container.innerHTML).toMatchSnapshot();

    type('Concepto', 'Seguro del vehículo');
    type('Importe (VES)', '10');
    click('Agregar');
    await screen.findByText(BLOCKED);
  });

  it('copiarla crea una estructura propia con los mismos conceptos', async () => {
    const { container } = open();
    await copyFromCountry();
    expect((field('Nombre') as HTMLInputElement).value).toMatch(/\(propia\)$/);
    expect((await activeStructure('CARRIER_VE_1'))?.name).toMatch(/\(propia\)$/);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('sin permiso de editar no se puede copiar ni subir plantilla', async () => {
    perms.canEdit = false;
    open();
    await screen.findByText(INHERITED);
    const copy = screen.getByRole('button', { name: new RegExp(COPY) }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(copy.title).toBe('Tu rol no puede editar costos');
    expect((screen.getByRole('button', { name: /Subir plantilla/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sin permiso de crear el botón Agregar está deshabilitado y lo explica', async () => {
    perms.canCreate = false;
    open();
    await screen.findByText(INHERITED);
    const add = screen.getByRole('button', { name: 'Agregar' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.title).toBe('Tu rol no puede modificar costos');
  });
});

describe('CostStructureModal: filas de la estructura propia', () => {
  it('valida el concepto y el importe antes de agregar', async () => {
    open();
    await copyFromCountry();

    click('Agregar');
    await screen.findByText('La fila necesita un concepto.');

    type('Concepto', 'Seguro');
    type('Importe (VES)', 'abc');
    click('Agregar');
    await screen.findByText('El importe debe ser un número de cero o más.');

    type('Importe (VES)', '-5');
    click('Agregar');
    await screen.findByText('El importe debe ser un número de cero o más.');
  });

  it('agrega una fila y limpia el formulario', async () => {
    open();
    await copyFromCountry();
    await addRow('Seguro del vehículo', '10');
    expect(field('Concepto').value).toBe('');
  });

  it('edita una fila: cambia el concepto y puede cancelar', async () => {
    const { container } = open();
    await copyFromCountry();
    await addRow('Seguro del vehículo', '10');

    fireEvent.click(within(rowOf('Seguro del vehículo')).getByTitle('Editar'));
    expect(screen.getByLabelText('Concepto (editando)')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();

    fireEvent.change(screen.getByLabelText('Concepto (editando)'), { target: { value: 'Seguro total' } });
    click('Guardar cambios');
    await screen.findByText('Seguro total');
    expect(screen.queryByText('Seguro del vehículo')).toBeNull();

    fireEvent.click(within(rowOf('Seguro total')).getByTitle('Editar'));
    click('Cancelar');
    expect(screen.getByLabelText('Concepto')).toBeTruthy();
  });

  it('da de baja y reactiva una fila', async () => {
    open();
    await copyFromCountry();
    await addRow('Seguro del vehículo', '10');

    fireEvent.click(within(rowOf('Seguro del vehículo')).getByTitle('Dar de baja'));
    await waitFor(() => expect(within(rowOf('Seguro del vehículo')).getByTitle('Reactivar')).toBeTruthy());
    fireEvent.click(within(rowOf('Seguro del vehículo')).getByTitle('Reactivar'));
    await waitFor(() => expect(within(rowOf('Seguro del vehículo')).getByTitle('Dar de baja')).toBeTruthy());
  });

  it('elimina una fila solo si se confirma', async () => {
    open();
    await copyFromCountry();
    await addRow('Seguro del vehículo', '10');
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValueOnce(false);
    fireEvent.click(within(rowOf('Seguro del vehículo')).getByTitle('Eliminar'));
    expect(screen.getByText('Seguro del vehículo')).toBeTruthy();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(within(rowOf('Seguro del vehículo')).getByTitle('Eliminar'));
    await waitFor(() => expect(screen.queryByText('Seguro del vehículo')).toBeNull());
    expect(confirm).toHaveBeenCalledWith('¿Eliminar "Seguro del vehículo"?');
  });

  it('sin permiso de eliminar el botón está deshabilitado', async () => {
    open();
    await copyFromCountry();
    await addRow('Seguro del vehículo', '10');
    perms.canDelete = false;
    cleanup();
    open();
    await screen.findAllByTitle('Tu rol no puede eliminar costos');
  });
});

describe('CostStructureModal: parámetros, plantilla e importación', () => {
  it('guardar parámetros sin estructura propia crea una con el nombre indicado', async () => {
    open();
    await screen.findByText(INHERITED);
    type('Nombre', 'Estructura VE 2026');
    click(/Guardar parámetros/);
    await waitFor(() => expect(screen.queryByText(INHERITED)).toBeNull());
    expect((await activeStructure('CARRIER_VE_1'))?.name).toBe('Estructura VE 2026');
    expect(field('Nombre').value).toBe('Estructura VE 2026');
  });

  it('abrir la plantilla solo asegura el perfil: no crea estructura y avisa solo si se creó', async () => {
    const created = vi.fn();
    ensure.fn.mockResolvedValueOnce({ status: 'saved', partyId: 'CARRIER_VE_1', created: false });
    const first = open(profile(null), created);
    await screen.findByText(INHERITED);
    click(/Subir plantilla/);
    await waitFor(() => expect(ensure.fn).toHaveBeenCalledTimes(1));
    expect(created).not.toHaveBeenCalled();
    expect(await activeStructure('CARRIER_VE_1')).toBeNull();
    first.unmount();

    ensure.fn.mockResolvedValueOnce({ status: 'saved', partyId: 'CARRIER_VE_1', created: true });
    open(profile(null), created);
    await screen.findByText(INHERITED);
    click(/Subir plantilla/);
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(await activeStructure('CARRIER_VE_1')).toBeNull();
  });

  it('si no se puede crear el perfil al abrir la plantilla muestra el error', async () => {
    ensure.fn.mockResolvedValueOnce({ status: 'failed', error: { message: 'No se pudo crear el perfil' } });
    open(profile(null));
    await screen.findByText(INHERITED);
    click(/Subir plantilla/);
    await screen.findByText('No se pudo crear el perfil');
  });

  async function importCsv() {
    click(/Importar una hoja suelta/);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([CSV], 'costos.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(CSV).buffer });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/hoja\(s\)/);
    click('Continuar');
    await screen.findByText('Columna en la planilla');
    click('Ver qué se va a importar');
    await screen.findByText(/filas se importan/);
    click(/^Importar \d+ filas$/);
  }

  it('importar una hoja con la estructura heredada se rechaza con el aviso', async () => {
    open();
    await screen.findByText(INHERITED);
    await importCsv();
    await screen.findByText(BLOCKED);
  });

  it('importar una hoja en la estructura propia reemplaza las filas y registra la bitácora', async () => {
    const { container } = open();
    await copyFromCountry();
    await importCsv();
    await screen.findByText('Peaje extra');
    await waitFor(() => expect(screen.queryByText('Importar planilla de costos')).toBeNull());
    expect(container.innerHTML).toMatchSnapshot();
  });
});
