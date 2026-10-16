// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ViajeDetallePanel from '../components/ViajeDetallePanel';
import ViajesSidebar from '../components/ViajesSidebar';
import type { Stop, Viaje, ViajeDetalle } from '../types';

afterEach(cleanup);

const NOW = Date.parse('2026-10-16T15:00:00Z');

const viaje = (over: Partial<Viaje> = {}): Viaje => ({
  id: 'v1', route_number: 'VJ-20261016-AAAA', state: 'active', status_raw: 'En tránsito', signal: 'online',
  color: 'green', driver_name: 'Ana Mora', plate: 'ABC123', carrier_name: null, zone_name: null,
  started_at: null, ended_at: null, route_date: null,
  position: { lat: 9.9, lng: -84, speed_mps: 10, heading_deg: 0, battery_pct: 80, recorded_at: '2026-10-16T14:59:30Z' },
  progress: { total: 4, done: 2, delivered: 1, failed: 1, percent: 50 }, ...over,
});

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 's1', guide_number: 'G-1', sequence: 1, state: 'delivered', order_number: 'PED-1', invoice_number: 'F-9',
  customer_name: 'Tienda Uno', address: 'Calle 1', city: 'San José', items: 3, weight: 10, lat: 9.9, lng: -84,
  arrived_at: null, recipient_name: 'Luis', evidences: [], incidents: [], returns: [], ...over,
});

const detail = (stops: Stop[]): ViajeDetalle => ({ ...viaje(), stops, events: [], trail: [] });

const sidebarProps = (over = {}) => ({
  viajes: [viaje()], loading: false, error: null, activos: true, search: '', selectedId: null, expanded: false,
  now: NOW, canLoadMore: false, onActivos: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(), onToggleMore: vi.fn(),
  onLoadMore: vi.fn(), onRetry: vi.fn(), ...over,
});

describe('ViajesSidebar', () => {
  it('muestra el viaje con conductor, placa y avance', () => {
    render(<ViajesSidebar {...sidebarProps()} />);
    expect(screen.getByText('VJ-20261016-AAAA')).toBeTruthy();
    expect(screen.getByText(/Ana Mora · ABC123/)).toBeTruthy();
    expect(screen.getByText('2 de 4 paradas')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });

  it('cambia entre Activos y Todos y selecciona un viaje', () => {
    const props = sidebarProps();
    render(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(props.onActivos).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByText('VJ-20261016-AAAA'));
    expect(props.onSelect).toHaveBeenCalledWith('v1');
  });

  it('"Ver más" solo aparece en el viaje seleccionado', () => {
    const { rerender } = render(<ViajesSidebar {...sidebarProps()} />);
    expect(screen.queryByText('Ver más')).toBeNull();
    const props = sidebarProps({ selectedId: 'v1' });
    rerender(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByText('Ver más'));
    expect(props.onToggleMore).toHaveBeenCalled();
  });

  it('muestra vacío y error con reintento', () => {
    const { rerender } = render(<ViajesSidebar {...sidebarProps({ viajes: [] })} />);
    expect(screen.getByText('No hay viajes para mostrar')).toBeTruthy();
    const props = sidebarProps({ viajes: [], error: new Error('x') });
    rerender(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByText('Reintentar'));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('ofrece cargar más cuando hay otra página', () => {
    const props = sidebarProps({ canLoadMore: true });
    render(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByText('Cargar más'));
    expect(props.onLoadMore).toHaveBeenCalled();
  });
});

describe('ViajeDetallePanel', () => {
  const base = { viaje: viaje(), loading: false, canEdit: true, now: NOW, onComplete: vi.fn(), onClose: vi.fn() };

  it('lista los pedidos y revela las evidencias al abrir uno', () => {
    const withEvidence = stop({
      evidences: [
        { id: 'e1', kind: 'photo_invoice', mime_type: 'image/jpeg', captured_at: null, url: 'https://signed/factura' },
        { id: 'e2', kind: 'signature', mime_type: 'image/png', captured_at: null, url: 'https://signed/firma' },
      ],
      incidents: [{ at: '2026-10-16T14:00:00Z', text: 'Puerta cerrada, se esperó 10 min' }],
      returns: [{ id: 'r1', return_number: 'DEV-1', return_type: 'parcial', reason: 'Dañado', product_name: 'Taladro', quantity: 2, status: 'pending', notes: null }],
    });
    render(<ViajeDetallePanel {...base} detail={detail([withEvidence])} />);
    expect(screen.queryByAltText('Factura firmada')).toBeNull();
    fireEvent.click(screen.getByText('Tienda Uno'));
    expect(screen.getByAltText('Factura firmada').getAttribute('src')).toBe('https://signed/factura');
    expect(screen.getByAltText('Firma digital')).toBeTruthy();
    expect(screen.getByText('Puerta cerrada, se esperó 10 min')).toBeTruthy();
    expect(screen.getByText('2 x Taladro — Dañado')).toBeTruthy();
    expect(screen.getByText('Recibió: Luis')).toBeTruthy();
  });

  it('avisa cuando una entrega aún no tiene evidencias', () => {
    render(<ViajeDetallePanel {...base} detail={detail([stop({ state: 'pending' })])} />);
    fireEvent.click(screen.getByText('Tienda Uno'));
    expect(screen.getByText('Aún no hay evidencias de esta entrega')).toBeTruthy();
  });

  it('el detalle avanzado (eventos) está plegado hasta que se pide', () => {
    const withEvents = { ...detail([stop()]), events: [{ id: 'ev', type: 'route_started', status: 'info', at: '2026-10-16T13:00:00Z', notes: null, stop_id: null }] };
    render(<ViajeDetallePanel {...base} detail={withEvents} />);
    expect(screen.queryByText(/route_started/)).toBeNull();
    fireEvent.click(screen.getByText('Detalle avanzado'));
    expect(screen.getByText(/route_started/)).toBeTruthy();
  });

  it('completar solo se ofrece con permiso de edición y viaje en tránsito', () => {
    const { rerender } = render(<ViajeDetallePanel {...base} detail={detail([])} />);
    fireEvent.click(screen.getByText('Completar viaje'));
    expect(base.onComplete).toHaveBeenCalled();
    rerender(<ViajeDetallePanel {...base} canEdit={false} detail={detail([])} />);
    expect(screen.queryByText('Completar viaje')).toBeNull();
    rerender(<ViajeDetallePanel {...base} viaje={viaje({ state: 'completed' })} detail={detail([])} />);
    expect(screen.queryByText('Completar viaje')).toBeNull();
  });

  it('cierra con la X', () => {
    render(<ViajeDetallePanel {...base} detail={detail([])} />);
    fireEvent.click(screen.getByLabelText('Cerrar'));
    expect(base.onClose).toHaveBeenCalled();
  });
});
