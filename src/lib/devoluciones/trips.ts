// Lógica pura del módulo Devoluciones (sin React): estados, progreso del viaje y borrador del formulario.

import type {
  FormDraft, FormSection, ReturnCondition, ReturnKind, ReturnLine, ReturnStatus, ReturnTrip, SectionDraft, TripDetail,
} from './types';

export const CONDITIONS: ReturnCondition[] = ['Bueno', 'Dañado', 'Incompleto'];
export const KIND_LABELS: Record<ReturnKind, string> = { devolucion: 'Devolución', reparacion: 'Reparación', cambio: 'Cambio' };

export const STATUS_LABELS: Record<ReturnStatus, string> = {
  pending: 'Pendiente de recibir',
  approved: 'Aprobada, pendiente de recibir',
  received: 'Recibida',
  completed: 'Completada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

type Variant = 'warning' | 'success' | 'danger' | 'default';
const STATUS_VARIANTS: Record<ReturnStatus, Variant> = {
  pending: 'warning', approved: 'warning', received: 'success', completed: 'success', rejected: 'danger', cancelled: 'default',
};

export const statusLabel = (status: string): string => STATUS_LABELS[status as ReturnStatus] ?? status;
export const statusVariant = (status: string): Variant => STATUS_VARIANTS[status as ReturnStatus] ?? 'default';

/** Una devolución abierta es la que falta recibir; solo ésas impiden liquidar el viaje (igual que el backend). */
export const isOpen = (status: string): boolean => status === 'pending' || status === 'approved';

/** El viaje puede pasar a liquidación: tiene devoluciones y ya no queda ninguna por recibir. */
export const isReadyToSettle = (trip: Pick<ReturnTrip, 'total_returns' | 'pending_returns'>): boolean =>
  trip.total_returns > 0 && trip.pending_returns === 0;

export function tripProgress(trip: Pick<ReturnTrip, 'total_returns' | 'received_returns'>): { label: string; percent: number } {
  const total = Math.max(0, trip.total_returns);
  const done = Math.min(Math.max(0, trip.received_returns), total);
  return { label: `${done}/${total}`, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export interface SectionGroup {
  section: FormSection;
  lines: ReturnLine[];
}

/** Devoluciones agrupadas por parada (cliente/factura), en el orden del recorrido. Una línea sin sección se muestra igual. */
export function groupBySection(lines: ReturnLine[], sections: FormSection[]): SectionGroup[] {
  const groups = new Map<string, SectionGroup>();
  for (const section of sections) groups.set(section.dispatch_guide_id, { section, lines: [] });
  for (const line of lines) {
    const group = groups.get(line.dispatch_guide_id) ?? {
      section: {
        dispatch_guide_id: line.dispatch_guide_id, sequence_number: line.sequence_number, invoice_number: line.invoice_number,
        customer_code: null, customer_name: null, phone: null, address: null, route_label: null, sellers: null,
      },
      lines: [],
    };
    group.lines.push(line);
    groups.set(line.dispatch_guide_id, group);
  }
  return [...groups.values()]
    .filter((group) => group.lines.length > 0)
    .sort((a, b) => (a.section.sequence_number ?? 0) - (b.section.sequence_number ?? 0));
}

const text = (value: string | null | undefined): string => value ?? '';

function sectionDraft(section: FormSection): SectionDraft {
  return {
    dispatch_guide_id: section.dispatch_guide_id,
    invoice_number: text(section.invoice_number),
    customer_code: text(section.customer_code),
    customer_name: text(section.customer_name),
    phone: text(section.phone),
    address: text(section.address),
    route_label: text(section.route_label),
    sellers: text(section.sellers),
  };
}

/** Borrador del formulario: lo guardado manda; lo que falte se prellena con lo que ya sabe el tracking. */
export function draftFromDetail(detail: TripDetail): FormDraft {
  const form = detail.form;
  return {
    physical_receipt_number: text(form?.physical_receipt_number),
    branch: text(form?.branch),
    return_kind: form?.return_kind ?? 'devolucion',
    merchandise_for: text(form?.merchandise_for),
    observations: text(form?.observations),
    transport: text(form?.transport ?? detail.defaults.transport),
    guide_number: text(form?.guide_number),
    comments: text(form?.comments),
    received_by_name: text(form?.received_by_name),
    received_date: text(form?.received_date).slice(0, 10),
    sections: groupBySection(detail.returns, detail.sections).map((group) => sectionDraft(group.section)),
  };
}

/** Cuerpo del PUT: los textos vacíos se mandan vacíos (el backend los guarda como null). */
export function toFormPayload(draft: FormDraft): FormDraft {
  const trim = (value: string) => value.trim();
  return {
    ...draft,
    physical_receipt_number: trim(draft.physical_receipt_number),
    branch: trim(draft.branch),
    merchandise_for: trim(draft.merchandise_for),
    transport: trim(draft.transport),
    guide_number: trim(draft.guide_number),
    received_by_name: trim(draft.received_by_name),
    sections: draft.sections.map((s) => ({ ...s, invoice_number: trim(s.invoice_number), customer_code: trim(s.customer_code),
      customer_name: trim(s.customer_name), phone: trim(s.phone), route_label: trim(s.route_label) })),
  };
}

/** Motivos distintos de las devoluciones de una parada, para la línea "Tipo" del formulario. */
export const reasonsOf = (lines: ReturnLine[]): string => [...new Set(lines.map((l) => l.reason).filter(Boolean))].join('; ');

export const receivedQuantity = (line: ReturnLine): number | null =>
  line.status === 'received' || line.status === 'completed' ? (line.received_quantity ?? line.quantity) : null;

/** Cantidad inicial del diálogo de recepción: lo registrado por el conductor. */
export const defaultReceiveQuantity = (line: ReturnLine): number => line.received_quantity ?? line.quantity ?? 0;

/** Validación del diálogo de recepción: la cantidad es un entero >= 0. */
export function parseQuantity(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) ? quantity : null;
}
