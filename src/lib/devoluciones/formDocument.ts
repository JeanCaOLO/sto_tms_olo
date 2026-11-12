// Documento imprimible del formulario de devolución (formato de .test/devoluciones/DEV-2026-10-1395.pdf), por viaje:
// cabecera con el número DEV-AAAA-MM-####, una sección por parada (cliente + factura) con su tabla de artículos,
// comentarios y las líneas de fecha/recibido. Es una cadena HTML con estilos en línea para imprimir en otra ventana.

import { KIND_LABELS, groupBySection, reasonsOf, receivedQuantity, returnTypeLabel } from './trips';
import type { FormDraft, FormView, ReturnLine, SectionDraft } from './types';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const WARRANTY_NOTE = 'Para efectos de garantías en máquinas y duchas sírvase adjuntar la factura de venta';

const STYLE = `
  body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 18px 0 6px; }
  .meta { color: #475569; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 8px; }
  .grid div span { color: #475569; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; } td.num { text-align: right; width: 70px; }
  .sign { display: flex; gap: 40px; margin-top: 28px; } .sign div { flex: 1; border-top: 1px solid #0f172a; padding-top: 4px; }
  .note { margin-top: 18px; font-size: 11px; color: #475569; }
  @media print { body { margin: 8mm; } }
`;

const field = (label: string, value: unknown) => `<div><span>${escapeHtml(label)}:</span> <strong>${escapeHtml(value)}</strong></div>`;

function linesTable(lines: ReturnLine[]): string {
  const rows = lines.map((line) => `<tr>
      <td>${escapeHtml(line.product_code)}</td><td>${escapeHtml(line.product_name)}</td>
      <td>${escapeHtml(line.received_condition ?? '')}</td><td class="num">${escapeHtml(line.quantity)}</td>
      <td class="num">${escapeHtml(receivedQuantity(line) ?? '')}</td></tr>`).join('');
  return `<table><thead><tr><th>Artículo</th><th>Descripción</th><th>Estado</th><th>Cantidad</th><th>Recibido</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function sectionBlock(section: SectionDraft, lines: ReturnLine[], draft: FormDraft): string {
  const origins = [...new Set(lines.map((l) => returnTypeLabel(l.return_type)))].join('; ');
  return `<h2>Parada: ${escapeHtml(section.customer_name || section.invoice_number || section.dispatch_guide_id)}</h2>
    <div class="grid">
      ${field('Código Cliente', section.customer_code)}${field('Nombre del Cliente', section.customer_name)}
      ${field('Teléfono', section.phone)}${field('Ruta', section.route_label)}
      ${field('Dirección', section.address)}${field('Sucursal', draft.branch)}
      ${field('Origen', origins)}${field('Motivo', reasonsOf(lines))}
      ${field('Devolución', lines.map((l) => l.return_number).join(', '))}${field('Factura', section.invoice_number)}
      ${field('Vendedor', section.sellers)}
    </div>${linesTable(lines)}`;
}

export function formDocumentHtml(detail: FormView, draft: FormDraft, formNumber: string | null): string {
  const groups = groupBySection(detail.returns, detail.sections);
  const byGuide = new Map(draft.sections.map((s) => [s.dispatch_guide_id, s]));
  const blocks = groups.map(({ section, lines }) => sectionBlock(byGuide.get(section.dispatch_guide_id) ?? {
    dispatch_guide_id: section.dispatch_guide_id, invoice_number: section.invoice_number ?? '', customer_code: section.customer_code ?? '',
    customer_name: section.customer_name ?? '', phone: section.phone ?? '', address: section.address ?? '',
    route_label: section.route_label ?? '', sellers: section.sellers ?? '',
  }, lines, draft)).join('');
  const title = formNumber ?? 'Borrador (sin guardar)';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${STYLE}</style></head><body>
    <h1>Comprobante de devolución ${escapeHtml(formNumber ?? '')}</h1>
    <div class="meta">Viaje ${escapeHtml(detail.trip.route_number)} · ${escapeHtml(detail.trip.route_date)}
      ${draft.physical_receipt_number ? ` · Recibo físico N° ${escapeHtml(draft.physical_receipt_number)}` : ''}</div>
    <div class="grid">
      ${field('Tipo de operación', KIND_LABELS[draft.return_kind])}${field('Mercadería para', draft.merchandise_for)}
      ${field('Transporte', draft.transport)}${field('Guía', draft.guide_number)}
    </div>
    ${blocks}
    ${draft.observations ? `<p><strong>Observaciones:</strong> ${escapeHtml(draft.observations)}</p>` : ''}
    <p><strong>Comentarios:</strong> ${escapeHtml(draft.comments)}</p>
    <p>Fecha: ${draft.received_date ? escapeHtml(draft.received_date) : '__________________'}</p>
    <p>Recibido: ${draft.received_by_name ? escapeHtml(draft.received_by_name) : '__________________'}</p>
    <div class="sign"><div>Recibió Bodega</div><div>V°B° Ventas</div><div>Retiro del Cliente</div></div>
    <p class="note">${escapeHtml(WARRANTY_NOTE)}</p></body></html>`;
}

/** Abre el documento en otra ventana y lo manda a imprimir. false si el navegador bloqueó la ventana. */
export function printFormDocument(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
