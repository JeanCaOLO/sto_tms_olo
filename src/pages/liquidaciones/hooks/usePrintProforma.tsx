// Imprimir / guardar como PDF la proforma de una liquidación, sin librerías de PDF.
//
// Se monta la proforma en un contenedor aparte del <body> y se llama a `window.print()`; las reglas
// `@media print` de `index.css` ocultan todo lo demás (menú, modales, botones). El navegador ofrece
// «Guardar como PDF» en su diálogo de impresión.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SettlementRecord } from '../../../lib/tarifas/types';
import { ProformaImprimible } from '../parts/ProformaImprimible';

export const PRINT_ROOT_ID = 'proforma-print-root';

export function usePrintProforma() {
  const [toPrint, setToPrint] = useState<SettlementRecord | null>(null);

  useEffect(() => {
    if (!toPrint) return undefined;
    const done = () => setToPrint(null);
    window.addEventListener('afterprint', done);
    // Un tick para que el portal ya esté en el DOM cuando el navegador arma la vista de impresión.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [toPrint]);

  const printPortal = toPrint
    ? createPortal(
      <div id={PRINT_ROOT_ID}><ProformaImprimible settlement={toPrint} /></div>,
      document.body,
    )
    : null;

  return { print: setToPrint, printPortal };
}
