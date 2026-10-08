// @vitest-environment jsdom
//
// «Estructura del país»: la estructura de costos por defecto de la flota propia (partyId = null),
// que antes se editaba en Reglas de Tarifa → Costos.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CountryCostStructure from './CountryCostStructure';
import { db } from '../../../lib/tarifas/data';

let canEdit = true;
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canEdit, canCreate: canEdit, canDelete: canEdit, canExport: true, canView: true }),
}));

const view = () => render(<MemoryRouter><CountryCostStructure country={country} /></MemoryRouter>);
const country = { id: 'VE', name: 'Venezuela', local_currency: 'USD' };

beforeEach(() => { canEdit = true; });
afterEach(cleanup);

describe('CountryCostStructure', () => {
  it('muestra la estructura por defecto del país con sus conceptos y parámetros', async () => {
    view();
    await waitFor(() => expect(screen.getByText('Estructura del país')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Días operativos por mes')).toBeTruthy());
    expect(screen.getByText('Km por año')).toBeTruthy();
    expect(screen.getByText('Subir plantilla')).toBeTruthy();
  });

  it('sin estructura avisa que no se puede liquidar la flota propia', async () => {
    const structures = await db().find('costStructure', { where: [{ column: 'country_id', op: 'eq', value: 'VE' }] });
    for (const s of structures) {
      const rows = await db().find('costStructureRow', { where: [{ column: 'structure_id', op: 'eq', value: s.id as string }] });
      for (const r of rows) await db().delete('costStructureRow', r.id as string);
      await db().delete('costStructure', s.id as string);
    }
    view();
    await waitFor(() => expect(screen.getByText(/Sin estructura cargada/)).toBeTruthy());
  });

  it('sin permiso de edición «Subir plantilla» está deshabilitado', async () => {
    canEdit = false;
    view();
    const boton = await screen.findByText('Subir plantilla');
    expect((boton.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('subir plantilla abre el asistente de carga del país', async () => {
    view();
    fireEvent.click(await screen.findByText('Subir plantilla'));
    await waitFor(() => expect(document.body.textContent).toContain('la estructura de la flota propia de Venezuela'));
  });
});
