// @vitest-environment jsdom
//
// Caracterización del modal de subir la plantilla de costos, grabada ANTES de partir el archivo:
// cerrado, abierto vacío, y con la plantilla vacía de ejemplo subida (errores de validación).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import CostTemplateModal from './CostTemplateModal';
import { costTemplateSheets } from '../../lib/tarifas/costTemplate';

const onClose = vi.fn();
const onApplied = vi.fn();

const open = (isOpen = true) => render(
  <MemoryRouter><CostTemplateModal
    isOpen={isOpen} partyId={null} countryId="VE" structureName="Flota propia"
    scopeLabel="la estructura de la flota propia de Venezuela" currency="VES"
    onClose={onClose} onApplied={onApplied}
  /></MemoryRouter>,
);
const html = (c: HTMLElement) => c.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_');

function templateFile(name = 'plantilla.xlsx'): File {
  const wb = XLSX.utils.book_new();
  for (const [sheet, matrix] of Object.entries(costTemplateSheets())) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), sheet);
  }
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File([bytes], name);
  // jsdom no implementa File.arrayBuffer.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes });
  return file;
}

beforeEach(() => { localStorage.clear(); onClose.mockClear(); onApplied.mockClear(); });
afterEach(cleanup);

describe('CostTemplateModal (caracterización)', () => {
  it('cerrado no pinta nada', () => {
    const { container } = open(false);
    expect(container.innerHTML).toBe('');
  });

  it('abierto sin archivo: explica el reemplazo y no deja guardar', () => {
    const { container } = open();
    expect(screen.getByText('Subir plantilla de estructura de costos')).toBeTruthy();
    expect(screen.getByText(/Al guardar se reemplaza la estructura de la flota propia de Venezuela/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Guardar y reemplazar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(html(container)).toMatchSnapshot();
  });

  it('un archivo que no es Excel se rechaza con un mensaje', async () => {
    const { container } = open();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'datos.csv')] } });
    await screen.findByText('El archivo debe ser un libro de Excel (.xlsx) con las hojas de la plantilla.');
    expect(screen.getByText('datos.csv')).toBeTruthy();
  });

  it('la plantilla vacía sube, se lee y muestra la vista previa con errores sin dejar guardar', async () => {
    const { container } = open();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [templateFile()] } });
    await screen.findByText(/filas de costo/);
    await waitFor(() => expect(screen.getByText('plantilla.xlsx')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Guardar y reemplazar' }) as HTMLButtonElement).disabled).toBe(
      container.textContent?.includes('Corregí esto en el archivo') ?? false,
    );
    expect(html(container)).toMatchSnapshot();
  });

  it('cancelar cierra sin aplicar', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApplied).not.toHaveBeenCalled();
  });
});
