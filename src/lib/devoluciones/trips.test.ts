import { describe, expect, it } from 'vitest';
import { escapeHtml, formDocumentHtml } from './formDocument';
import {
  defaultReceiveQuantity, draftFromDetail, groupBySection, isOpen, isReadyToSettle, parseQuantity, reasonsOf, receivedQuantity,
  statusLabel, statusVariant, toFormPayload, tripProgress,
} from './trips';
import type { FormSection, ReturnLine, ReturnTrip, TripDetail } from './types';

const line = (over: Partial<ReturnLine> = {}): ReturnLine => ({
  id: 'r1', return_number: 'DV-1', return_type: 'devolucion', return_date: null, reason: 'Producto dañado', product_code: '9054404',
  product_name: 'Lámina', quantity: 2, photo_url: null, notes: null, status: 'pending', received_at: null, received_by: null,
  received_quantity: null, received_condition: null, dispatch_guide_id: 'g1', sequence_number: 1, order_number: 'P-1',
  invoice_number: '897062', ...over,
});
const section = (over: Partial<FormSection> = {}): FormSection => ({
  dispatch_guide_id: 'g1', sequence_number: 1, invoice_number: '897062', customer_code: '2041', customer_name: 'Inversiones S.A.',
  phone: '2441', address: 'Alajuela', route_label: 'R-1', sellers: null, ...over,
});
const trip = (over: Partial<ReturnTrip> = {}): ReturnTrip => ({
  route_id: 'route-1', route_number: 'R-1', route_date: '2026-10-29', plan_trip_id: null, route_status: 'completed', driver_name: 'Luis',
  carrier_name: 'Transportes', country_id: 'cr', total_returns: 2, received_returns: 1, pending_returns: 1, last_return_at: null,
  form_id: null, form_number: null, ...over,
});
const detail = (over: Partial<TripDetail> = {}): TripDetail => ({
  trip: trip(), returns: [line()], sections: [section()], form: null, defaults: { transport: 'Transportes - Luis' }, ...over,
});

describe('estados', () => {
  it('solo pending y approved están abiertas (igual que el bloqueo del backend)', () => {
    expect(['pending', 'approved'].every(isOpen)).toBe(true);
    expect(['received', 'completed', 'rejected', 'cancelled'].some(isOpen)).toBe(false);
  });
  it('etiqueta y color; un estado desconocido se muestra tal cual', () => {
    expect(statusLabel('received')).toBe('Recibida');
    expect(statusVariant('received')).toBe('success');
    expect(statusLabel('rara')).toBe('rara');
    expect(statusVariant('rara')).toBe('default');
  });
});

describe('viaje', () => {
  it('queda listo para liquidar solo con devoluciones y ninguna pendiente', () => {
    expect(isReadyToSettle(trip({ total_returns: 3, pending_returns: 0 }))).toBe(true);
    expect(isReadyToSettle(trip({ total_returns: 3, pending_returns: 1 }))).toBe(false);
    expect(isReadyToSettle(trip({ total_returns: 0, pending_returns: 0 }))).toBe(false);
  });
  it('progreso con tope y sin dividir por cero', () => {
    expect(tripProgress({ total_returns: 4, received_returns: 1 })).toEqual({ label: '1/4', percent: 25 });
    expect(tripProgress({ total_returns: 0, received_returns: 0 })).toEqual({ label: '0/0', percent: 0 });
    expect(tripProgress({ total_returns: 2, received_returns: 5 })).toEqual({ label: '2/2', percent: 100 });
  });
});

describe('groupBySection', () => {
  it('agrupa por parada en el orden del recorrido y omite paradas sin devoluciones', () => {
    const groups = groupBySection(
      [line({ id: 'a', dispatch_guide_id: 'g2', sequence_number: 2 }), line({ id: 'b' }), line({ id: 'c' })],
      [section({ dispatch_guide_id: 'g2', sequence_number: 2 }), section(), section({ dispatch_guide_id: 'g3', sequence_number: 3 })],
    );
    expect(groups.map((g) => [g.section.dispatch_guide_id, g.lines.map((l) => l.id)])).toEqual([['g1', ['b', 'c']], ['g2', ['a']]]);
  });
  it('una devolución sin sección igual se muestra', () => {
    const groups = groupBySection([line({ dispatch_guide_id: 'gx' })], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].section.invoice_number).toBe('897062');
  });
});

describe('borrador del formulario', () => {
  it('prellena con tracking: transporte por defecto y una sección por parada', () => {
    const draft = draftFromDetail(detail());
    expect(draft.transport).toBe('Transportes - Luis');
    expect(draft.return_kind).toBe('devolucion');
    expect(draft.sections).toEqual([expect.objectContaining({ dispatch_guide_id: 'g1', customer_name: 'Inversiones S.A.', sellers: '' })]);
  });
  it('lo guardado manda sobre el valor por defecto', () => {
    const form = { id: 'f', form_number: 'DEV-2026-10-0001', physical_receipt_number: '150970', branch: 'COFERSA', return_kind: 'cambio' as const,
      merchandise_for: null, observations: null, transport: 'Otro', guide_number: null, comments: 'ok', received_by_name: null,
      received_date: '2026-10-30T00:00:00Z', created_at: '', updated_at: '' };
    const draft = draftFromDetail(detail({ form }));
    expect(draft).toMatchObject({ transport: 'Otro', physical_receipt_number: '150970', return_kind: 'cambio', received_date: '2026-10-30' });
  });
  it('el payload recorta espacios', () => {
    const draft = { ...draftFromDetail(detail()), branch: '  COFERSA ', sections: [{ ...draftFromDetail(detail()).sections[0], phone: ' 24 ' }] };
    const payload = toFormPayload(draft);
    expect(payload.branch).toBe('COFERSA');
    expect(payload.sections[0].phone).toBe('24');
  });
});

describe('recepción', () => {
  it('cantidad recibida: solo si ya se recibió; si no hubo valor, la registrada', () => {
    expect(receivedQuantity(line())).toBeNull();
    expect(receivedQuantity(line({ status: 'received', received_quantity: 1 }))).toBe(1);
    expect(receivedQuantity(line({ status: 'received', received_quantity: null }))).toBe(2);
  });
  it('cantidad inicial del diálogo', () => {
    expect(defaultReceiveQuantity(line())).toBe(2);
    expect(defaultReceiveQuantity(line({ quantity: null }))).toBe(0);
  });
  it.each([['3', 3], [' 0 ', 0], ['', null], ['-1', null], ['1.5', null], ['abc', null]])('parseQuantity(%j)', (raw, expected) => {
    expect(parseQuantity(raw)).toBe(expected);
  });
  it('motivos distintos', () => {
    expect(reasonsOf([line(), line({ id: 'x' }), line({ id: 'y', reason: 'Error de despacho' })])).toBe('Producto dañado; Error de despacho');
  });
});

describe('documento imprimible', () => {
  it('escapa el HTML de lo capturado', () => {
    expect(escapeHtml('<b>"&"</b>')).toBe('&lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;');
  });
  it('trae número, cliente, artículos y la nota de garantía; sin firmar deja las líneas en blanco', () => {
    const d = detail();
    const html = formDocumentHtml(d, draftFromDetail(d), 'DEV-2026-10-0001');
    expect(html).toContain('DEV-2026-10-0001');
    expect(html).toContain('Inversiones S.A.');
    expect(html).toContain('9054404');
    expect(html).toContain('garantías');
    expect(html).toContain('__________________');
  });
  it('un valor con HTML no se inyecta', () => {
    const d = detail();
    const draft = { ...draftFromDetail(d), comments: '<script>alert(1)</script>' };
    expect(formDocumentHtml(d, draft, null)).not.toContain('<script>alert(1)</script>');
  });
});
