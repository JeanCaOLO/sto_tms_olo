// @vitest-environment jsdom
//
// Caracterización de la importación de filas de un tarifario (CSV real sobre el tarifario ZONAS de
// Venezuela). Los snapshots se generaron ANTES de la partición y no deben editarse a mano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportRateTableModal from './ImportRateTableModal';
import { listRateTables } from '../../../lib/tarifas/rateTablesDataSource';
import type { RateTable } from '../../../lib/tarifas/types';

const perms = vi.hoisted(() => ({ canEdit: true }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canCreate: true, canDelete: true, canView: true }),
}));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { full_name: 'Auditor de prueba', email: 'auditor@example.com' } }),
}));

const api = vi.hoisted(() => ({ failNext: false }));
vi.mock('../api/tarifariosApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/tarifariosApi')>();
  return {
    ...actual,
    bulkImportRows: (...args: Parameters<typeof actual.bulkImportRows>) => {
      if (api.failNext) { api.failNext = false; return Promise.resolve({ error: 'No se pudo importar el archivo', inserted: 0, replaced: 0 }); }
      return actual.bulkImportRows(...args);
    },
  };
});

const GOOD = 'Origen,Destino,Importe\nCCS,MCBO,10\nCCS,CCS,5\n';
const WITH_ISSUES = 'Origen,Destino,Importe\nCCS,MCBO,10\nCCS,MCBO,11\nCCS,CCS,abc\n';

function csvFile(text: string): File {
  const file = new File([text], 'tarifas.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => text });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
  return file;
}

async function open() {
  const table = (await listRateTables('VE', { includeInactive: true }))[0] as RateTable;
  const onClose = vi.fn();
  const onImported = vi.fn();
  const view = render(<ImportRateTableModal isOpen table={table} onClose={onClose} onImported={onImported} />);
  return { ...view, onClose, onImported };
}

async function upload(container: HTMLElement, text = GOOD) {
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [csvFile(text)] } });
  await screen.findByText('Vista previa');
}

const importButton = () => screen.getByRole('button', { name: /^Importar \d+ filas?$/ }) as HTMLButtonElement;

beforeEach(() => { localStorage.clear(); perms.canEdit = true; api.failNext = false; });
afterEach(cleanup);

describe('ImportRateTableModal (caracterización)', () => {
  it('cerrado no renderiza nada', async () => {
    const table = (await listRateTables('VE'))[0] as RateTable;
    const { container } = render(<ImportRateTableModal isOpen={false} table={table} onClose={() => {}} onImported={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('sin archivo: pide el archivo y no se puede importar', async () => {
    const { container } = await open();
    expect(screen.getByText(/Importar filas de/)).toBeTruthy();
    expect(importButton().disabled).toBe(true);
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();
  });

  it('con un CSV propone el mapeo y muestra la vista previa', async () => {
    const { container } = await open();
    await upload(container);
    expect(screen.getByText('2 filas')).toBeTruthy();
    expect(importButton().textContent).toContain('Importar 2 filas');
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();
  });

  it('en modo actualizar importa, avisa y muestra el resultado', async () => {
    const { container, onImported } = await open();
    await upload(container);
    fireEvent.click(importButton());
    await screen.findByText('Importación terminada');
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();
  });

  it('reemplazar todo exige confirmar antes de importar', async () => {
    const { container } = await open();
    await upload(container);
    fireEvent.click(screen.getByLabelText(/Reemplazar todo/));
    expect(importButton().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Confirmo que quiero borrar TODAS las filas actuales/));
    expect(importButton().disabled).toBe(false);

    fireEvent.click(screen.getByLabelText(/Actualizar/));
    fireEvent.click(screen.getByLabelText(/Reemplazar todo/));
    expect((screen.getByLabelText(/Confirmo que quiero borrar TODAS las filas actuales/) as HTMLInputElement).checked).toBe(false);
  });

  it('con filas con problemas o claves repetidas exige reconocerlo', async () => {
    const { container } = await open();
    await upload(container, WITH_ISSUES);
    expect(screen.getAllByText(/con problemas/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/repetida/).length).toBeGreaterThan(0);
    expect(importButton().disabled).toBe(true);
    expect(container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')).toMatchSnapshot();

    fireEvent.click(screen.getByLabelText(/Entendido/));
    await waitFor(() => expect(importButton().disabled).toBe(false));
  });

  it('si la importación falla muestra el error y no termina', async () => {
    const { container } = await open();
    await upload(container);
    api.failNext = true;
    fireEvent.click(importButton());
    await screen.findByText('No se pudo importar el archivo');
    expect(screen.queryByText('Importación terminada')).toBeNull();
  });

  it('cancelar cierra y reinicia el asistente', async () => {
    const { container, onClose } = await open();
    await upload(container);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Vista previa')).toBeNull();
  });

  it('sin permiso de editar no se puede importar y lo explica', async () => {
    perms.canEdit = false;
    const { container } = await open();
    await upload(container);
    expect(importButton().disabled).toBe(true);
    expect(importButton().title).toBe('Tu rol no puede importar');
  });
});
