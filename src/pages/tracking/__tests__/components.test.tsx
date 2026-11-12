// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChoferesEnLinea from '../components/ChoferesEnLinea';
import ResumenBar from '../components/ResumenBar';
import SimulacionControles from '../components/SimulacionControles';
import ViajeDetallePanel from '../components/ViajeDetallePanel';
import ViajesSidebar from '../components/ViajesSidebar';
import { getSimulation, resetSimulation } from '../mock/sim';
import type { ChoferEnLinea, Stop, Viaje, ViajeDetalle } from '../types';

afterEach(cleanup);

const NOW = Date.parse('2026-10-16T15:00:00Z');

const viaje = (over: Partial<Viaje> = {}): Viaje => ({
  id: 'v1', route_number: 'VJ-20261016-AAAA', state: 'active', phase: 'en_ruta', signal: 'online', color: 'green',
  driver_name: 'Ana Mora', plate: 'ABC123', zone_name: null, country: 'CR', timezone: 'America/Costa_Rica',
  started_at: null, ended_at: null, planned_end_at: null, route_date: null, due_date: null, assigned_at: null, days_late: 0, delay_min: null, alerts: [],
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

  // Un <button> solo admite contenido de frase: con <div>, <p> o <ul> dentro el HTML es inválido y los lectores de
  // pantalla / navegadores pueden recolocar o ignorar partes de la tarjeta.
  it('la tarjeta del viaje no anida bloques dentro del botón y conserva sus roles', () => {
    render(<ViajesSidebar {...sidebarProps({ viajes: [viaje({ alerts: [{ code: 'late' }, { code: 'no_signal' }] })] })} />);
    const card = screen.getByText('VJ-20261016-AAAA').closest('button') as HTMLButtonElement;
    expect(card.querySelector('div, p, ul, ol, li, table')).toBeNull();
    expect(card.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(card.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(card.querySelector('[role="list"]')).not.toBeNull();
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

  it('la tarjeta muestra asignación y fecha de entrega', () => {
    render(<ViajesSidebar {...sidebarProps({ viajes: [viaje({ due_date: '2026-10-02', assigned_at: '2026-10-01T15:00:00Z', timezone: 'America/Costa_Rica' })] })} />);
    expect(screen.getByText(/Asignado .* · Entrega /).textContent).toMatch(/Asignado.*1.*Entrega.*2/);
  });

  it('muestra alertas y "Por salir" en la tarjeta', () => {
    render(<ViajesSidebar {...sidebarProps({ viajes: [viaje({ phase: 'por_salir', alerts: [{ code: 'late', count: 25 }] })] })} />);
    expect(screen.getByText('Por salir')).toBeTruthy();
    expect(screen.getByLabelText('Alertas del viaje').textContent).toContain('Atrasado 25 d');
  });

  it('ofrece cargar más cuando hay otra página', () => {
    const props = sidebarProps({ canLoadMore: true });
    render(<ViajesSidebar {...props} />);
    fireEvent.click(screen.getByText('Cargar más'));
    expect(props.onLoadMore).toHaveBeenCalled();
  });

  it('con la app abierta cuenta el latido como última señal aunque el GPS vaya lento', () => {
    const slowGps = viaje({ position: { lat: 9.9, lng: -84, speed_mps: 0, recorded_at: '2026-10-16T14:48:00Z' },
      presence: { status: 'online', last_seen_at: '2026-10-16T14:59:40Z' } });
    render(<ViajesSidebar {...sidebarProps({ viajes: [slowGps] })} />);
    expect(screen.getByText('Última señal hace 20 s')).toBeTruthy();
  });

  it('tras un logout explícito dice que el chofer cerró sesión, en vez de una antigüedad', () => {
    const loggedOut = viaje({ signal: 'offline', color: 'gray', presence: { status: 'offline', last_seen_at: '2026-10-16T14:59:55Z' } });
    render(<ViajesSidebar {...sidebarProps({ viajes: [loggedOut] })} />);
    expect(screen.getByText('El chofer cerró sesión')).toBeTruthy();
    expect(screen.queryByText(/Última señal/)).toBeNull();
  });

  it('lista los choferes en línea sin viaje y omite a los que ya tienen viaje o cerraron sesión', () => {
    const driver = (over = {}) => ({ driver_id: 'd1', driver_name: 'Beto Rojas', country: 'CR', signal: 'online' as const,
      last_seen_at: '2026-10-16T14:59:30Z', battery_pct: 71, route_id: null, ...over });
    const choferes = [driver(), driver({ driver_id: 'd2', driver_name: 'Con Viaje', route_id: 'v1' }),
      driver({ driver_id: 'd3', driver_name: 'Ya Salió', signal: 'offline' }), driver({ driver_id: 'd4', driver_name: 'Cata Vega', signal: 'stale', battery_pct: null })];
    render(<ViajesSidebar {...sidebarProps({ choferes })} />);
    expect(screen.getByLabelText('Choferes en línea sin viaje').textContent).toContain('(2)');
    expect(screen.getByText('Beto Rojas')).toBeTruthy();
    expect(screen.getByText('Cata Vega')).toBeTruthy();
    expect(screen.getByText(/Sin viaje · 30 s · 71%/)).toBeTruthy();
    expect(screen.queryByText('Con Viaje')).toBeNull();
    expect(screen.queryByText('Ya Salió')).toBeNull();
  });

  it('sin choferes en línea sin viaje no muestra la sección', () => {
    render(<ViajesSidebar {...sidebarProps({ choferes: [] })} />);
    expect(screen.queryByLabelText('Choferes en línea sin viaje')).toBeNull();
  });
});

describe('ViajeDetallePanel (solo lectura)', () => {
  const base = { viaje: viaje(), error: false, now: NOW, onClose: vi.fn() };

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

  it('una recolecta muestra foto del producto y firma (no la factura)', () => {
    const evidences = [{ id: 'e2', kind: 'photo_product' as const, mime_type: 'image/jpeg', captured_at: null, url: 'https://s3/p.jpg' }];
    render(<ViajeDetallePanel {...base} detail={detail([stop({ type: 'collection', evidences })])} />);
    fireEvent.click(screen.getByText('Tienda Uno'));
    expect(screen.getByAltText('Foto del producto')).toBeTruthy();
    expect(screen.getByText('Firma digital')).toBeTruthy();
    expect(screen.queryByText('Factura firmada')).toBeNull();
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

  it('muestra carga o error del detalle, y cierra', () => {
    const { rerender } = render(<ViajeDetallePanel {...base} detail={null} />);
    expect(screen.getByText('Cargando...')).toBeTruthy();
    rerender(<ViajeDetallePanel {...base} detail={null} error />);
    expect(screen.getByText('No se pudo cargar el detalle del viaje')).toBeTruthy();
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

describe('ChoferesEnLinea', () => {
  const chofer = (over: Partial<ChoferEnLinea> = {}): ChoferEnLinea => ({
    driver_id: 'd1', driver_name: 'Ana Mora', country: 'CR', signal: 'online', last_seen_at: '2026-10-16T14:59:30Z',
    battery_pct: 80, route_id: null, ...over,
  });
  const fila = () => screen.getByRole('listitem').textContent ?? '';

  it('con última vez y batería separa cada dato con un punto medio', () => {
    render(<ChoferesEnLinea choferes={[chofer()]} now={NOW} />);
    expect(fila()).toBe('Ana MoraCRSin viaje · 30 s · 80%');
  });

  it('sin última vez no deja un separador colgando', () => {
    render(<ChoferesEnLinea choferes={[chofer({ last_seen_at: null, battery_pct: null })]} now={NOW} />);
    expect(fila()).toBe('Ana MoraCRSin viaje');
    expect(fila()).not.toMatch(/·\s*$/);
  });
});


// Contraste: texto secundario en slate-400 sobre fondo slate-50 no llega a 4,5:1 (WCAG AA).
describe('ChoferesEnLinea: contraste', () => {
  it('el país y el resto del texto usan slate-600 o más oscuro, y el punto de estado tiene nombre', () => {
    const sinViaje: ChoferEnLinea = {
      driver_id: 'd1', driver_name: 'Ana Mora', country: 'CR', signal: 'online', last_seen_at: '2026-10-16T14:59:30Z',
      battery_pct: 80, route_id: null,
    };
    const { container } = render(<ChoferesEnLinea choferes={[sinViaje]} now={NOW} />);
    expect(container.innerHTML).not.toMatch(/text-slate-[345]00/);
    expect(container.querySelector('li span[title]')).not.toBeNull();
  });
});

describe('ResumenBar: entregas y fallidas', () => {
  const base = { active: 7, on_time: 5, late: 2, no_signal: 1, completed_today: 4, deliveries_total: 10, deliveries_done: 8, deliveries_remaining: 2 };

  it('con las fallidas conocidas las separa de las entregadas', () => {
    render(<ResumenBar resumen={base} failedStops={2} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('deliveries-progress').textContent).toBe('Entregas: 6 de 10 · 2 fallidas · faltan 2');
  });

  it('sin fallidas dice 0 fallidas, no las oculta', () => {
    render(<ResumenBar resumen={base} failedStops={0} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('deliveries-progress').textContent).toBe('Entregas: 8 de 10 · 0 fallidas · faltan 2');
  });

  it('si no se conocen (lista incompleta) no dice "entregas": habla de paradas gestionadas, sin inventar el desglose', () => {
    render(<ResumenBar resumen={base} failedStops={null} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('deliveries-progress').textContent).toBe('Paradas gestionadas: 8 de 10 · faltan 2');
  });
});

describe('ParadaItem: nombre del punto de entrega y empresa como nota', () => {
  it('muestra el punto como nombre y la empresa dueña del pedido en la nota', async () => {
    const { default: ParadaItem } = await import('../components/ParadaItem');
    render(<ul><ParadaItem stop={stop({ state: 'pending', customer_name: 'EPA Heredia', company_name: 'Cofersa' })} isNext={false} timezone={null} /></ul>);
    expect(screen.getByText('EPA Heredia')).toBeTruthy();
    expect(screen.getByText(/Pedido PED-1 de Cofersa/)).toBeTruthy();
    expect(screen.queryByText('Cofersa')).toBeNull();   // la empresa NO es el nombre de la parada
  });

  it('el encabezado "Rumbo a" usa el punto, o la dirección si no hay punto', () => {
    const next = stop({ state: 'pending', customer_name: null, company_name: 'Cofersa', address: 'Calle 7' });
    render(<ViajeDetallePanel viaje={viaje()} detail={detail([next], { next_stop_id: 's1' })} error={false} now={NOW} onClose={vi.fn()} />);
    expect(screen.getByText(/Rumbo a 1\. Calle 7/)).toBeTruthy();
  });
});
