// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DataTable, { type DataTableColumn } from './DataTable';

interface Row { id: string; customer: string; }

const rows: Row[] = [
  { id: '1', customer: 'Cofersa' },
  { id: '2', customer: 'Cofersa' },
  { id: '3', customer: 'EPA' },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'customer', header: 'Cliente', accessor: (r) => r.customer, filterable: true },
];

function renderTable() {
  return render(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} />);
}

describe('DataTable filtro por columna', () => {
  it('sin filtro muestra todas las filas', () => {
    renderTable();
    expect(screen.getAllByText('Cofersa')).toHaveLength(2);
    expect(screen.getByText('EPA')).toBeTruthy();
  });

  it('un clic en EPA muestra solo las filas EPA (no las desmarca)', () => {
    renderTable();
    // Abrir el menú de filtro de la columna Cliente (el botón del ícono de filtro).
    const filterIcon = document.querySelector('.ri-filter-3-fill')!.closest('button')!;
    fireEvent.click(filterIcon);
    // En el menú, marcar EPA.
    const menu = document.querySelector('.absolute.z-20')!;
    const epaCheckbox = within(menu as HTMLElement).getByLabelText('EPA');
    fireEvent.click(epaCheckbox);
    // La tabla ahora muestra solo EPA, ninguna fila Cofersa en el cuerpo.
    const body = document.querySelector('tbody')!;
    expect(within(body).queryByText('Cofersa')).toBeNull();
    expect(within(body).getByText('EPA')).toBeTruthy();
  });
});
