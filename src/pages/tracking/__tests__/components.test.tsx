// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResumenBar from '../components/ResumenBar';
import SimulacionControles from '../components/SimulacionControles';
import ViajeDetallePanel from '../components/ViajeDetallePanel';
import ViajesSidebar from '../components/ViajesSidebar';
import { getSimulation, resetSimulation } from '../mock/sim';
import type { Stop, Viaje, ViajeDetalle } from '../types';

afterEach(cleanup);

const NOW = Date.parse('2026-10-16T15:00:00Z');

const viaje = (over: Partial<Viaje> = {}): Viaje => ({
  id: 'v1', route_number: 'VJ-20261016-AAAA', state: 'active', phase: 'en_ruta', signal: 'online', color: 'green',
  driver_name: 'Ana Mora', plate: 'ABC123', zone_name: null, country: 'CR', timezone: 'America/Costa_Rica',
  started_at: null, ended_at: null, planned_end_at: null, route_date: null, delay_min: null, alerts: [],
  position: { lat: 9.9, lng: -84, speed_mps: 10, recorded_at: '2026-10-16T14:59:30Z' },
  progress: { total: 4, done: 2, delivered: 1, failed: 1, percent: 50 }, ...over,
});

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 's1', guide_number: 'G-1', sequence: 1, state: 'delivered', order_number: 'PED-1', invoice_number: 'F-9',
  customer_name: 'Tienda Uno', address: 'Calle 1', city: 'San José', lat: 9.9, lng: -84,
  arrived_at: null, recipient_name: 'Luis', evidences: [], planned_arrival_at: null, distance_m: null, eta_at: null, delay_min: null, ...over,
});

const detail = (stops: Stop[], over: Partial<ViajeDetalle> = {}): ViajeDetalle => ({
  ...viaje(), origin: null, next_stop_id: null, departed_at: null, stops, ...over,
});

const sidebarProps = (over = {}) => ({
  viajes: [viaje()], loading: false, error: false, mode: 'active' as const, search: '', selectedId: null, now: NOW,
  canLoadMore: false, filtered: false, onMode: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
  onLoadMore: vi.fn(), onRetry: vi.fn(), ...over,
});

describe('ViajesSidebar', () => {
  it('muestra el viaje con conductor, placa, avance y última señal', () => {
    render(<ViajesSidebar {...sidebarProps()} />);
    expect(screen.getByText('VJ-20261016-AAAA')).toBeTruthy();
    expect(screen.getByText(/Ana Mora · ABC123/)).toBeTruthy();
    expect(screen.getByText('2 de 4 paradas')).toBeTruthy();
    expect(screen.getByText('Última señal hace 30 s')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });

  it('solo ofrece Activos y Todos, y selecciona un viaje', () => {
    const props = sidebarProps();
    render(<ViajesSidebar {...props} />);
    expect(screen.queryByRole('button', { name: /Por revisar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(props.onMode).toHaveBeenCalledWith('all');
    fireEvent.click(screen.getByText('VJ-20261016-AAAA'));
    expect(props.onSelect).toHaveBeenCalledWith('v1');
  });

  it('muestra vacío (normal o por indicador) y error con reintento', () => {
    const { rerender } = render(<ViajesSidebar {...sidebarProps({ viajes: [] })} />);
    expect(screen.getByText('No hay viajes para mostrar')).toBeTruthy();
    rerender(<ViajesSidebar {...sidebarProps({ viajes: [], filtered: true })} />);
    expect(screen.getByText('Ningún viaje coincide con el indicador elegido')).toBeTruthy();
    const props = sidebarProps({ viajes: [], error: true });
    rerender(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByText('Reintentar'));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('muestra alertas y "Por salir" en la tarjeta', () => {
    render(<ViajesSidebar {...sidebarProps({ viajes: [viaje({ phase: 'por_salir', alerts: [{ code: 'late', count: 25 }] })] })} />);
    expect(screen.getByText('Por salir')).toBeTruthy();
    expect(screen.getByLabelText('Alertas del viaje').textContent).toContain('Retraso de 25 min');
  });

  it('ofrece cargar más cuando hay otra página', () => {
    const props = sidebarProps({ canLoadMore: true });
    render(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByText('Cargar más'));
    expect(props.onLoadMore).toHaveBeenCalled();
  });
});

describe('ViajeDetallePanel (solo lectura)', () => {
  const base = { viaje: viaje(), error: false, now: NOW, onReplay: vi.fn(), onClose: vi.fn() };

  it('lista los pedidos y al abrir uno muestra solo factura firmada y firma', () => {
    const evidences = [{ id: 'e1', kind: 'photo_invoice' as const, mime_type: 'image/jpeg', captured_at: null, url: 'https://s3/f.jpg' }];
    render(<ViajeDetallePanel {...base} detail={detail([stop({ evidences })])} />);
    fireEvent.click(screen.getByText('Tienda Uno'));
    expect(screen.getByAltText('Factura firmada')).toBeTruthy();
    expect(screen.getByText('Firma digital')).toBeTruthy();
    expect(screen.getByText('Pendiente')).toBeTruthy(); // la firma aún no llegó
    expect(screen.getByText('Recibió: Luis')).toBeTruthy();
    expect(screen.queryByText(/Novedades|Devoluciones/)).toBeNull();
  });

  it('no ofrece acciones sobre el viaje (completar, revisar, mapas externos)', () => {
    render(<ViajeDetallePanel {...base} detail={detail([stop()])} />);
    fireEvent.click(screen.getByText('Tienda Uno'));
    expect(screen.queryByText('Completar viaje')).toBeNull();
    expect(screen.queryByText('Marcar revisado')).toBeNull();
    expect(screen.queryByText(/Google Maps|Waze/)).toBeNull();
    expect(screen.queryByText('Detalle avanzado')).toBeNull();
  });

  it('dice a qué parada va (la siguiente por secuencia) con su ETA en la hora del país', () => {
    const stops = [stop(), stop({ id: 's2', sequence: 2, state: 'pending', customer_name: 'Bodega Dos', eta_at: '2026-10-16T15:30:00Z', distance_m: 2500 })];
    render(<ViajeDetallePanel {...base} detail={detail(stops, { next_stop_id: 's2' })} />);
    expect(screen.getByText(/Rumbo a 2\. Bodega Dos/).textContent).toContain('09:30');
    expect(screen.getByText('Siguiente')).toBeTruthy();
  });

  it('muestra carga o error del detalle, y reproduce o cierra', () => {
    const { rerender } = render(<ViajeDetallePanel {...base} detail={null} />);
    expect(screen.getByText('Cargando...')).toBeTruthy();
    rerender(<ViajeDetallePanel {...base} detail={null} error />);
    expect(screen.getByText('No se pudo cargar el detalle del viaje')).toBeTruthy();
    fireEvent.click(screen.getByText('Reproducir recorrido'));
    expect(base.onReplay).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Cerrar'));
    expect(base.onClose).toHaveBeenCalled();
  });
});

describe('ResumenBar', () => {
  const resumen = { active: 7, on_time: 5, late: 2, no_signal: 1, completed_today: 4 };

  it('muestra 5 indicadores por viaje, sin pedidos ni novedades', () => {
    render(<ResumenBar resumen={resumen} selected={null} onSelect={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Resumen de viajes' });
    expect(group.querySelectorAll('button')).toHaveLength(5);
    expect(group.textContent).toContain('Completados hoy4');
    expect(group.textContent).not.toMatch(/Entregas|Novedades|Por revisar/);
  });

  it('un clic filtra por el indicador y otro clic lo quita', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ResumenBar resumen={resumen} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Retrasados/ }));
    expect(onSelect).toHaveBeenLastCalledWith('late');
    rerender(<ResumenBar resumen={resumen} selected="late" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Retrasados/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('SimulacionControles (solo modo mock)', () => {
  it('pausa y cambia la velocidad', () => {
    resetSimulation();
    const onChange = vi.fn();
    render(<SimulacionControles onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Pausar simulación'));
    expect(getSimulation().paused).toBe(true);
    fireEvent.click(screen.getByLabelText('Más rápido'));
    expect(getSimulation().speed).toBe(10);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
