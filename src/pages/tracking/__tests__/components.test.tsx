// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSimulation } from '../api';
import ResumenBar from '../components/ResumenBar';
import SimulacionControles from '../components/SimulacionControles';
import ViajeDetallePanel from '../components/ViajeDetallePanel';
import ViajesSidebar from '../components/ViajesSidebar';
import { resetLocalData } from '../local-store';
import type { Stop, Viaje, ViajeDetalle } from '../types';

afterEach(cleanup);

const NOW = Date.parse('2026-10-16T15:00:00Z');

const viaje = (over: Partial<Viaje> = {}): Viaje => ({
  id: 'v1', route_number: 'VJ-20261016-AAAA', state: 'active', status_raw: 'En tránsito', phase: 'en_ruta', signal: 'online',
  color: 'green', driver_name: 'Ana Mora', plate: 'ABC123', carrier_name: null, zone_name: null,
  started_at: null, ended_at: null, planned_end_at: null, total_distance_km: null, capacity_percentage: null,
  route_date: null, delay_min: null, incidents: 0, alerts: [], review: null,
  position: { lat: 9.9, lng: -84, speed_mps: 10, heading_deg: 0, battery_pct: 80, recorded_at: '2026-10-16T14:59:30Z' },
  progress: { total: 4, done: 2, delivered: 1, failed: 1, percent: 50 }, ...over,
});

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 's1', guide_number: 'G-1', sequence: 1, state: 'delivered', order_number: 'PED-1', invoice_number: 'F-9',
  customer_name: 'Tienda Uno', address: 'Calle 1', city: 'San José', items: 3, weight: 10, lat: 9.9, lng: -84,
  arrived_at: null, recipient_name: 'Luis', evidences: [], incidents: [], returns: [],
  planned_arrival_at: null, distance_m: null, eta_at: null, delay_min: null, ...over,
});

const detail = (stops: Stop[]): ViajeDetalle => ({ ...viaje(), next_stop_id: null, departed_at: null, stops, events: [], trail: [] });

const sidebarProps = (over = {}) => ({
  viajes: [viaje()], loading: false, error: null, mode: 'active' as const, reviewCount: null, search: '', selectedId: null,
  canLoadMore: false, onMode: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
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
    expect(props.onMode).toHaveBeenCalledWith('all');
    fireEvent.click(screen.getByRole('button', { name: 'Por revisar' }));
    expect(props.onMode).toHaveBeenCalledWith('review');
    fireEvent.click(screen.getByText('VJ-20261016-AAAA'));
    expect(props.onSelect).toHaveBeenCalledWith('v1');
  });

  it('la tarjeta es simple: sin "Ver más" ni hora de señal', () => {
    render(<ViajesSidebar {...sidebarProps({ selectedId: 'v1' })} />);
    expect(screen.queryByText('Ver más')).toBeNull();
    expect(screen.queryByText(/Última señal/)).toBeNull();
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
  const base = { viaje: viaje(), loading: false, canEdit: true, now: NOW, onComplete: vi.fn(), onReview: vi.fn(), onClose: vi.fn() };

  it('lista los pedidos y revela las evidencias al abrir uno', () => {
    const withEvidence = stop({
      evidences: [
        { id: 'e1', kind: 'photo_invoice', mime_type: 'image/jpeg', captured_at: null, url: 'https://signed/factura' },
        { id: 'e2', kind: 'signature', mime_type: 'image/png', captured_at: null, url: 'https://signed/firma' },
      ],
      incidents: [{ at: '2026-10-16T14:00:00Z', text: 'Puerta cerrada, se esperó 10 min', kind: 'incident' }],
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


describe('monitor: alertas, semáforo y paradas cercanas', () => {
  const base = { viaje: viaje(), loading: false, canEdit: true, now: NOW, onComplete: vi.fn(), onReview: vi.fn(), onClose: vi.fn() };

  it('la tarjeta muestra las alertas del viaje y "Por salir" antes de la salida', () => {
    const alerts = [{ code: 'incident' as const, count: 2 }, { code: 'late' as const, count: 25 }];
    render(<ViajesSidebar {...sidebarProps({ viajes: [viaje({ alerts, phase: 'por_salir' })] })} />);
    expect(screen.getByTitle('2 novedad(es)')).toBeTruthy();
    expect(screen.getByTitle('Retraso de 25 min')).toBeTruthy();
    expect(screen.getByText('Por salir')).toBeTruthy();
  });

  it('la tarjeta de un viaje completado muestra su semáforo', () => {
    const review = { color: 'red' as const, reasons: [], reviewed_at: null, reviewed_by: null, note: null };
    render(<ViajesSidebar {...sidebarProps({ viajes: [viaje({ state: 'completed', color: 'blue', review })] })} />);
    expect(screen.getByText('Requiere atención')).toBeTruthy();
  });

  it('el chip Por revisar muestra cuántos viajes faltan', () => {
    render(<ViajesSidebar {...sidebarProps({ reviewCount: 3 })} />);
    expect(screen.getByRole('button', { name: 'Por revisar (3)' })).toBeTruthy();
  });

  it('dice a qué parada va el camión ahora (la más cercana) y la marca como siguiente', () => {
    const near = stop({ id: 'a', sequence: 2, state: 'pending', customer_name: 'Cerca', distance_m: 800, delay_min: 4 });
    const far = stop({ id: 'b', sequence: 1, state: 'pending', customer_name: 'Lejos', distance_m: 12400, delay_min: 30 });
    render(<ViajeDetallePanel {...base} viaje={viaje({ delay_min: 30 })} detail={detail([far, near])} />);
    expect(screen.getByText(/Rumbo a 2\. Cerca/).textContent).toContain('800 m');
    expect(screen.getAllByText('Siguiente')).toHaveLength(1);
    expect(screen.getAllByText('+30 min').length).toBeGreaterThan(0);
  });

  it('un viaje completado sin revisar ofrece marcarlo revisado y explica el semáforo', () => {
    const review = { color: 'amber' as const, reasons: [{ code: 'incidents' as const, count: 2 }], reviewed_at: null, reviewed_by: null, note: null };
    render(<ViajeDetallePanel {...base} viaje={viaje({ state: 'completed', review })} detail={detail([])} />);
    expect(screen.getByText('2 novedad(es)')).toBeTruthy();
    fireEvent.click(screen.getByText('Marcar revisado'));
    expect(base.onReview).toHaveBeenCalled();
  });

  it('un viaje ya revisado muestra quién lo revisó y no ofrece el botón', () => {
    const review = { color: 'green' as const, reasons: [], reviewed_at: '2026-10-16T16:00:00Z', reviewed_by: 'Luis', note: null };
    render(<ViajeDetallePanel {...base} viaje={viaje({ state: 'completed', review })} detail={detail([])} />);
    expect(screen.getByText(/Revisado por Luis/)).toBeTruthy();
    expect(screen.queryByText('Marcar revisado')).toBeNull();
  });

  it('cada parada ofrece abrir la navegación externa (Maps y Waze)', () => {
    render(<ViajeDetallePanel {...base} detail={detail([stop({ lat: 9.93, lng: -84.08 })])} />);
    fireEvent.click(screen.getByText('Tienda Uno'));
    expect(screen.getByText('Abrir en Google Maps').getAttribute('href')).toContain('destination=9.93,-84.08');
    expect(screen.getByText('Abrir en Waze').getAttribute('href')).toContain('ll=9.93,-84.08');
  });
});

describe('indicadores y simulación', () => {
  const resumen = { active: 5, departing: 2, late: 1, on_time: 4, no_signal: 3, stops_done: 4, stops_total: 10, incidents: 2, to_review: 6 };

  it('muestra 4 indicadores y el resto solo bajo demanda', () => {
    render(<ResumenBar resumen={resumen} />);
    expect(screen.getByText('Entregas')).toBeTruthy();
    expect(screen.queryByText('Sin señal')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Más indicadores' }));
    expect(screen.getByText('Sin señal')).toBeTruthy();
    expect(screen.getByText('Novedades')).toBeTruthy();
  });

  it('los controles pausan y cambian la velocidad', () => {
    resetLocalData();
    const onChange = vi.fn();
    render(<SimulacionControles onChange={onChange} />);
    expect(screen.getByText('5×')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Más rápido' }));
    expect(screen.getByText('10×')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Más lento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Más lento' }));
    expect(screen.getByText('2×')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar simulación' }));
    expect(getSimulation().paused).toBe(true);
    expect(screen.getByRole('button', { name: 'Reanudar simulación' })).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});
