// PDF de la proforma en el navegador: se dibuja el documento fuera de pantalla, se fotografía con
// html2canvas y se reparte en páginas A4 con jsPDF. Las dos librerías se cargan solo al pedir un PDF.

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ProformaDetail } from '../../../lib/tarifas/proformas';
import ProformaDocumento from '../components/ProformaDocumento';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const RENDER_SCALE = 2;

/** Cuántos mm de alto ocupa una imagen de `width`×`height` px ajustada al ancho de la hoja. */
export function imageHeightMm(width: number, height: number): number {
  return (height * A4_WIDTH_MM) / width;
}

/** Posiciones verticales (mm, negativas) en que se repite la imagen para cubrir todas las páginas. */
export function pageOffsets(imageHeight: number): number[] {
  const pages = Math.max(1, Math.ceil(imageHeight / A4_HEIGHT_MM - 1e-6));
  return Array.from({ length: pages }, (_, i) => 0 - i * A4_HEIGHT_MM);
}

export async function renderProformaPdf(detail: ProformaDetail): Promise<Blob> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(ProformaDocumento, { detail })));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const canvas = await html2canvas(host, { scale: RENDER_SCALE, backgroundColor: '#ffffff' });
    const image = canvas.toDataURL('image/png');
    const height = imageHeightMm(canvas.width, canvas.height);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    pageOffsets(height).forEach((offset, index) => {
      if (index > 0) pdf.addPage();
      pdf.addImage(image, 'PNG', 0, offset, A4_WIDTH_MM, height);
    });
    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
