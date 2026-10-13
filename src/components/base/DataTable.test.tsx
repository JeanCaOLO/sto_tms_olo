// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
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

describe('DataTable buscador sin mayúsculas ni acentos', () => {
  const people = [
    { id: '1', customer: 'José Álvarez' },
    { id: '2', customer: 'Ana Pérez' },
  ];

  it.each(['jose', 'JOSÉ', 'alvarez', 'JOSE ALVAREZ'])('"%s" encuentra a José Álvarez', (term) => {
    renderWithRouter(
      <DataTable data={people} columns={columns} getRowId={(r) => r.id} searchPlaceholder="buscar" />,
    );
    fireEvent.change(screen.getByPlaceholderText('buscar'), { target: { value: term } });
    const body = document.querySelector('tbody')!;
    expect(within(body).getByText('José Álvarez')).toBeTruthy();
    expect(within(body).queryByText('Ana Pérez')).toBeNull();
  });
});

describe('DataTable columnas ocultas y ordenadas (columnsKey)', () => {
  interface Trip { id: string; code: string; carrier: string; km: number; }
  const trips: Trip[] = [{ id: '1', code: 'RT-1', carrier: 'Acme', km: 120 }];
  const cols: DataTableColumn<Trip>[] = [
    { key: 'code', header: 'Viaje', accessor: (r) => r.code },
    { key: 'carrier', header: 'Transportista', accessor: (r) => r.carrier },
    { key: 'km', header: 'Km', accessor: (r) => r.km },
  ];
  const headers = () => [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim());

  beforeEach(() => localStorage.clear());

  it('sin columnsKey no hay botón de columnas', () => {
    renderWithRouter(<DataTable data={trips} columns={cols} getRowId={(r) => r.id} />);
    expect(screen.queryByText('Columnas')).toBeNull();
  });

  it('oculta una columna y lo recuerda', () => {
    const { unmount } = renderWithRouter(
      <DataTable data={trips} columns={cols} getRowId={(r) => r.id} columnsKey="t.ocultar" />,
    );
    fireEvent.click(screen.getByText('Columnas'));
    fireEvent.click(screen.getByLabelText('Mostrar Transportista'));
    expect(headers()).toEqual(['Viaje', 'Km']);
    unmount();

    renderWithRouter(<DataTable data={trips} columns={cols} getRowId={(r) => r.id} columnsKey="t.ocultar" />);
    expect(headers()).toEqual(['Viaje', 'Km']);
  });

  it('mueve una columna con las flechas', () => {
    renderWithRouter(<DataTable data={trips} columns={cols} getRowId={(r) => r.id} columnsKey="t.mover" />);
    fireEvent.click(screen.getByText('Columnas'));
    fireEvent.click(screen.getByLabelText('Subir Km'));
    expect(headers()).toEqual(['Viaje', 'Km', 'Transportista']);
  });

  it('no deja ocultar todas las columnas', () => {
    renderWithRouter(<DataTable data={trips} columns={cols.slice(0, 2)} getRowId={(r) => r.id} columnsKey="t.todas" />);
    fireEvent.click(screen.getByText('Columnas'));
    fireEvent.click(screen.getByLabelText('Mostrar Viaje'));
    fireEvent.click(screen.getByLabelText('Mostrar Transportista'));
    expect(headers()).toEqual(['Transportista']);
  });

  it('arranca con las columnas ocultas por defecto y se pueden restablecer', () => {
    renderWithRouter(
      <DataTable data={trips} columns={cols} getRowId={(r) => r.id} columnsKey="t.defecto" defaultHidden={['km']} />,
    );
    expect(headers()).toEqual(['Viaje', 'Transportista']);
    fireEvent.click(screen.getByText('Columnas'));
    fireEvent.click(screen.getByLabelText('Mostrar Km'));
    expect(headers()).toEqual(['Viaje', 'Transportista', 'Km']);
    fireEvent.click(screen.getByText('Restablecer'));
    expect(headers()).toEqual(['Viaje', 'Transportista']);
  });
});

describe('DataTable filas extensibles (renderExpanded)', () => {
  const data = [{ id: '1', customer: 'A' }, { id: '2', customer: 'B' }];

  it('extiende y contrae el detalle de una fila', () => {
    renderWithRouter(
      <DataTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        renderExpanded={(r) => <div>detalle de {r.customer}</div>}
      />,
    );
    expect(screen.queryByText('detalle de A')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Extender')[1]); // la 0 es el encabezado
    expect(screen.getByText('detalle de A')).toBeTruthy();
    expect(screen.queryByText('detalle de B')).toBeNull();
    fireEvent.click(screen.getByLabelText('Contraer'));
    expect(screen.queryByText('detalle de A')).toBeNull();
  });

  it('canExpand deja sin botón a las filas sin detalle', () => {
    renderWithRouter(
      <DataTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        renderExpanded={() => <div>x</div>}
        canExpand={(r) => r.id === '2'}
      />,
    );
    // encabezado + una sola fila con botón
    expect(screen.getAllByLabelText('Extender')).toHaveLength(2);
  });
});

describe('DataTable maxVisibleRows (scroll interno)', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), customer: `Cliente ${i}` }));

  it('con la prop, el contenedor limita su alto, se desplaza y el encabezado queda fijo', () => {
    renderWithRouter(<DataTable data={many} columns={columns} getRowId={(r) => r.id} maxVisibleRows={5} />);
    const scroller = document.querySelector('table')!.parentElement as HTMLElement;
    expect(scroller.className).toContain('overflow-auto');
    expect(scroller.style.maxHeight).toBe('19rem'); // 2.75 + 5 × 3.25
    expect(document.querySelector('thead th')!.className).toContain('sticky');
    expect(document.querySelectorAll('tbody tr')).toHaveLength(12); // todas las filas, con scroll
  });

  it('sin la prop la tabla no cambia: sin alto máximo ni encabezado fijo', () => {
    renderWithRouter(<DataTable data={many} columns={columns} getRowId={(r) => r.id} />);
    const scroller = document.querySelector('table')!.parentElement as HTMLElement;
    expect(scroller.className).toBe('overflow-x-auto');
    expect(scroller.style.maxHeight).toBe('');
    expect(document.querySelector('thead th')!.className).not.toContain('sticky');
  });

  it('el filtro de columna flota fuera del contenedor con scroll para que no se recorte', () => {
    renderWithRouter(<DataTable data={points} columns={pointCols} getRowId={(p) => p.id} maxVisibleRows={5} />);
    fireEvent.click(document.querySelector('.ri-filter-3-fill')!.closest('button') as HTMLElement);
    const menu = document.querySelector('.fixed.z-50') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(document.querySelector('table')!.contains(menu)).toBe(false);
  });
});
