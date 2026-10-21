// Documento de la proforma que se convierte en PDF. Estilos en línea y colores simples: html2canvas no
// entiende todo el CSS moderno, y el PDF no debe depender del tema de la app.

import { formatMoney } from '../../../lib/tarifas/format';
import type { ProformaDetail } from '../../../lib/tarifas/proformas';

const CELL = { padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: 12 } as const;

export default function ProformaDocumento({ detail }: { detail: ProformaDetail }) {
  const { proforma, items, settlements } = detail;
  const included = items.filter((i) => i.included);
  return (
    <div style={{ width: 794, padding: 40, background: '#ffffff', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Proforma {proforma.number}</h1>
      <p style={{ fontSize: 13, margin: '6px 0 20px', color: '#475569' }}>
        Transportista: <strong>{proforma.carrierName}</strong> · Fecha: {proforma.createdAt.slice(0, 10)}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
            <th style={CELL}>Liquidación</th>
            <th style={CELL}>Viaje</th>
            <th style={CELL}>Fecha</th>
            <th style={{ ...CELL, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {included.map((i) => {
            const s = settlements.get(i.settlementId);
            return (
              <tr key={i.id}>
                <td style={CELL}>{s?.number ?? i.settlementId}</td>
                <td style={CELL}>{s?.tripNumber ?? ''}</td>
                <td style={CELL}>{s?.settlementDate ?? ''}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{formatMoney(String(i.amount), proforma.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ textAlign: 'right', fontSize: 16, fontWeight: 700, marginTop: 16 }}>
        Total: {formatMoney(String(proforma.totalAmount), proforma.currency)}
      </p>
    </div>
  );
}
