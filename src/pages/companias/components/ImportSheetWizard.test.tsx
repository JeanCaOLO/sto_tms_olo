// @vitest-environment jsdom
//
// Prueba de caracterización del asistente de importación de planillas de costos: recorre sus cuatro
// pasos (archivo → hoja → columnas → vista previa) con un CSV real y fija el HTML y las llamadas a
// `onImport`. Los snapshots se generaron ANTES de la partición y no deben editarse a mano.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportSheetWizard from './ImportSheetWizard';

afterEach(cleanup);

const CSV = 'Concepto,Importe\nSueldo conductor,1000.50\nSeguro,200\nGasto sin importe,\n';

function csvFile(): File {
  const file = new File([CSV], 'costos.csv', { type: 'text/csv' });
  // jsdom no implementa Blob.arrayBuffer en todas las versiones.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(CSV).buffer });
  return file;
}

function open(onImport = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) {
  const view = render(<ImportSheetWizard isOpen structureName="Flota propia VE" onClose={onClose} onImport={onImport} />);
  return { ...view, onImport, onClose };
}

async function upload(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [csvFile()] } });
  await screen.findByText(/hoja\(s\)/);
}

async function toMapStep(container: HTMLElement) {
  await upload(container);
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByText('Columna en la planilla');
}

async function toPreviewStep(container: HTMLElement) {
  await toMapStep(container);
  fireEvent.click(screen.getByRole('button', { name: 'Ver qué se va a importar' }));
  await screen.findByText(/filas se importan/);
}

vi.setConfig({ testTimeout: 20_000 }); // renderizan modales grandes: con la máquina cargada superan los 5 s por defecto

describe('ImportSheetWizard (caracterización)', () => {
  it('cerrado no renderiza nada', () => {
    const { container } = render(<ImportSheetWizard isOpen={false} structureName="x" onClose={() => {}} onImport={async () => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('paso 1: pide el archivo', () => {
    const { container } = open();
    expect(screen.getByText('Elegí un Excel o un CSV')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('paso 2: lee las hojas del archivo y permite volver atrás', async () => {
    const { container } = open();
    await upload(container);
    expect(container.innerHTML).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByText('Elegí un Excel o un CSV')).toBeTruthy();
  });

  it('paso 3: propone el mapeo de columnas', async () => {
    const { container } = open();
    await toMapStep(container);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('paso 3: sin columna de Importe no se puede continuar', async () => {
    const { container } = open();
    await toMapStep(container);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const fieldSelects = selects.slice(-2);
    fieldSelects.forEach((s) => fireEvent.change(s, { target: { value: 'ignore' } }));
    const next = screen.getByRole('button', { name: 'Ver qué se va a importar' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(next.title).toBe('Marcá al menos una columna como Concepto y otra como Importe');
  });

  it('paso 4: muestra qué se importa, qué se descarta y la suma', async () => {
    const { container } = open();
    await toPreviewStep(container);
    expect(screen.getByText(/Suma de importes/)).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('importa con el modo elegido, avisa y cierra', async () => {
    const { container, onImport, onClose } = open();
    await toPreviewStep(container);
    fireEvent.click(screen.getByRole('button', { name: /^Importar \d+ filas$/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]).toMatchSnapshot();
  });

  it('con "Conservarlas y agregar" importa en modo append', async () => {
    const { container, onImport } = open();
    await toPreviewStep(container);
    const modeSelect = (screen.getAllByRole('combobox') as HTMLSelectElement[]).at(-1)!;
    fireEvent.change(modeSelect, { target: { value: 'append' } });
    fireEvent.click(screen.getByRole('button', { name: /^Importar \d+ filas$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][1]).toBe('append');
  });

  it('si la importación falla muestra el error y no cierra', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('No se pudo guardar'));
    const { container, onClose } = open(failing);
    await toPreviewStep(container);
    fireEvent.click(screen.getByRole('button', { name: /^Importar \d+ filas$/ }));
    await screen.findByText('No se pudo guardar');
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /^Importar \d+ filas$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('cerrar reinicia el asistente al primer paso', async () => {
    const { container, onClose } = open();
    await upload(container);
    fireEvent.click(screen.getByLabelText('Cerrar'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Elegí un Excel o un CSV')).toBeTruthy();
  });

  it('un archivo que no se puede leer muestra el error', async () => {
    const { container } = open();
    const bad = new File(['x'], 'malo.csv');
    Object.defineProperty(bad, 'arrayBuffer', { value: async () => { throw new Error('archivo ilegible'); } });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [bad] } });
    await screen.findByText('archivo ilegible');
  });
});
