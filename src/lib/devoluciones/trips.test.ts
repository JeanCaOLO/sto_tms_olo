import { describe, expect, it } from 'vitest';
import { escapeHtml, formDocumentHtml } from './formDocument';
import {
  defaultReceiveQuantity, draftFromDetail, formatRouteDate, groupBySection, isOpen, isReadyToSettle, isSelectable, newFormView,
  parseQuantity, pruneSelection, reasonsOf, receivedQuantity, returnTypeLabel, statusLabel, statusVariant, toFormPayload, toggleGroup,
  toggleSelection, tripProgress,
} from './trips';
import type { FormSection, FormView, ReturnLine, ReturnTrip, TripDetail } from './types';

const line = (over: Partial<ReturnLine> = {}): ReturnLine => ({
  id: 'r1', return_number: 'DV-1', return_type: 'devolucion', return_date: null, reason: 'Producto dañado', product_code: '9054404',
  product_name: 'Lámina', quantity: 2, photo_url: null, notes: null, status: 'pending', received_at: null, received_by: null,
  received_quantity: null, received_condition: null, dispatch_guide_id: 'g1', sequence_number: 1, order_number: 'P-1',
  invoice_number: '897062', form_id: null, form_number: null, ...over,
});
const section = (over: Partial<FormSection> = {}): FormSection => ({
  dispatch_guide_id: 'g1', sequence_number: 1, invoice_number: '897062', customer_code: '2041', customer_name: 'Inversiones S.A.',
  phone: '2441', address: 'Alajuela', route_label: 'R-1', sellers: null, ...over,
});
const trip = (over: Partial<ReturnTrip> = {}): ReturnTrip => ({
  route_id: 'route-1', route_number: 'R-1', route_date: '2026-10-29', plan_trip_id: null, route_status: 'completed', driver_name: 'Luis',
  carrier_name: 'Transportes', country_id: 'cr', total_returns: 2, received_returns: 1, pending_returns: 1, last_return_at: null,
  forms_count: 0, ...over,
});
// Lo que muestra un formulario (con `form` null = nuevo, sin guardar).
const detail = (over: Partial<FormView> = {}): FormView => ({
  trip: trip(), form: null, returns: [line()], sections: [section()], defaults: { transport: 'Transportes - Luis' }, ...over,
});
const tripDetail = (over: Partial<TripDetail> = {}): TripDetail => ({
  trip: trip(), returns: [line()], sections: [section()], forms: [], defaults: { transport: 'Transportes - Luis' }, ...over,
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

describe('formatRouteDate', () => {
  it.each([
    ['2026-11-02T00:00:00.000Z', '2026-11-02'],
    ['2026-11-02', '2026-11-02'],
    ['', ''],
    [null, ''],
    ['no es fecha', ''],
  ])('formatRouteDate(%j)', (value, expected) => {
    expect(formatRouteDate(value)).toBe(expected);
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
  it('acepta el máximo integer de PostgreSQL y rechaza cantidades que no se pueden guardar', () => {
    expect(parseQuantity('2147483647')).toBe(2147483647);
    expect(parseQuantity('2147483648')).toBeNull();
    expect(parseQuantity('9007199254740991')).toBeNull();
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

describe('selección de devoluciones para un formulario', () => {
  const a = line({ id: 'a' });
  const b = line({ id: 'b', dispatch_guide_id: 'g2', sequence_number: 2 });
  const inForm = line({ id: 'c', form_id: 'f1', form_number: 'DEV-2026-11-0001' });

  it('solo se pueden marcar las que no van en ningún formulario', () => {
    expect(isSelectable(a)).toBe(true);
    expect(isSelectable(inForm)).toBe(false);
  });

  it('marcar y desmarcar de una en una, sin mutar el conjunto original', () => {
    const original = new Set<string>();
    const marked = toggleSelection(original, 'a');
    expect([...marked]).toEqual(['a']);
    expect(original.size).toBe(0);
    expect(toggleSelection(marked, 'a').size).toBe(0);
  });

  it('marcar un grupo toma solo las seleccionables y, con todas marcadas, las desmarca', () => {
    const marked = toggleGroup(new Set(), [a, inForm]);
    expect([...marked]).toEqual(['a']);
    expect(toggleGroup(marked, [a, inForm]).size).toBe(0);
  });

  it('un grupo sin devoluciones seleccionables no cambia la selección', () => {
    expect(toggleGroup(new Set(['x']), [inForm])).toEqual(new Set(['x']));
  });

  it('descarta lo marcado que ya no es seleccionable o ya no existe', () => {
    const pruned = pruneSelection(new Set(['a', 'c', 'zzz']), [a, inForm]);
    expect([...pruned]).toEqual(['a']);
  });

  it('el formulario nuevo lleva SOLO las devoluciones marcadas y las paradas que las tienen', () => {
    const view = newFormView(
      tripDetail({ returns: [a, b, inForm], sections: [section(), section({ dispatch_guide_id: 'g2', sequence_number: 2 })] }),
      new Set(['b', 'c']),
    );
    expect(view.form).toBeNull();
    expect(view.returns.map((l) => l.id)).toEqual(['b']);
    expect(view.sections.map((s) => s.dispatch_guide_id)).toEqual(['g2']);
    expect(view.defaults.transport).toBe('Transportes - Luis');
  });
});

describe('returnTypeLabel', () => {
  it('nombra el origen de la devolución y conserva lo desconocido', () => {
    expect(returnTypeLabel('contracamion')).toBe('Contracamión');
    expect(returnTypeLabel('recolecta')).toBe('Recolecta');
    expect(returnTypeLabel('rara')).toBe('rara');
    expect(returnTypeLabel(null)).toBe('-');
  });
});
