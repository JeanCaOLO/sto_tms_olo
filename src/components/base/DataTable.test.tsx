// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import DataTable, { type DataTableColumn } from './DataTable';

afterEach(cleanup);

// DataTable usa useLocation (para auditar el export por ruta), así que necesita un Router.
const renderWithRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

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
  return renderWithRouter(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} />);
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

// Caso Puntos de Entrega: accessor anidado (cliente vía final_customer.customer.name),
// render distinto del accessor y paginación activada — reproduce el filtro por Cliente real.
interface Point { id: string; name: string; final_customer: { customer: { name: string } | null } | null; }

const points: Point[] = [
  { id: '1', name: 'P1', final_customer: { customer: { name: 'Cofersa' } } },
  { id: '2', name: 'P2', final_customer: { customer: { name: 'EPA' } } },
  { id: '3', name: 'P3', final_customer: { customer: { name: 'Cofersa' } } },
];

const pointCols: DataTableColumn<Point>[] = [
  { key: 'name', header: 'Punto', accessor: (p) => p.name },
  {
    key: 'customer', header: 'Cliente', filterable: true,
    accessor: (p) => p.final_customer?.customer?.name ?? '',
    render: (p) => <span>{p.final_customer?.customer?.name} · extra</span>,
  },
];

describe('DataTable filtro Cliente con accessor anidado + paginación', () => {
  it('marcar EPA deja solo la fila del punto EPA', () => {
    renderWithRouter(<DataTable data={points} columns={pointCols} getRowId={(p) => p.id} pageSize={25} />);
    // Ícono de filtro de la columna Cliente (única filterable).
    const filterIcon = document.querySelector('.ri-filter-3-fill')!.closest('button') as HTMLElement;
    fireEvent.click(filterIcon);
    const menu = document.querySelector('.absolute.z-20') as HTMLElement;
    expect(menu).not.toBeNull();
    const epaLabel = within(menu).getByText('EPA').closest('label')!;
    fireEvent.click(within(epaLabel).getByRole('checkbox'));
    const body = document.querySelector('tbody')!;
    expect(within(body).getByText('P2')).toBeTruthy();
    expect(within(body).queryByText('P1')).toBeNull();
    expect(within(body).queryByText('P3')).toBeNull();
  });
});
