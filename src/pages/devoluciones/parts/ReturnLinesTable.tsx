// Devoluciones de un viaje agrupadas por parada (cliente / factura), con el botón "Recibido" por línea.
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import { isOpen, receivedQuantity, returnTypeLabel, statusLabel, statusVariant, type SectionGroup } from '../../../lib/devoluciones/trips';
import type { ReturnLine } from '../../../lib/devoluciones/types';

interface Props {
  groups: SectionGroup[];
  canReceive: boolean;
  onReceive: (line: ReturnLine) => void;
}

export default function ReturnLinesTable({ groups, canReceive, onReceive }: Props) {
  if (groups.length === 0) return <p className="text-sm text-slate-500">Este viaje no tiene devoluciones.</p>;
  return (
    <div className="space-y-4">
      {groups.map(({ section, lines }) => (
        <div key={section.dispatch_guide_id} className="rounded-lg border border-slate-200">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm">
            <span className="font-medium text-slate-800">{section.customer_name ?? 'Cliente sin nombre'}</span>
            {section.invoice_number && <span className="text-slate-600">Factura {section.invoice_number}</span>}
            {section.address && <span className="text-slate-500">{section.address}</span>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Devolución</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2 text-right">Cant.</th>
                <th className="px-2 py-2 text-right">Recibido</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{line.return_number}</td>
                  <td className="px-2 py-2">
                    <Badge size="sm" variant={line.return_type === 'recolecta' ? 'warning' : 'blue'}>{returnTypeLabel(line.return_type)}</Badge>
                  </td>
                  <td className="px-2 py-2 text-slate-800">
                    {line.product_name ?? '-'}
                    {line.product_code && <span className="ml-1 text-xs text-slate-500">({line.product_code})</span>}
                    {line.photo_url && (
                      <a href={line.photo_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-teal-700 hover:underline">
                        <i className="ri-image-line" aria-hidden="true" /> Ver foto
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{line.reason}</td>
                  <td className="px-2 py-2 text-right">{line.quantity ?? '-'}</td>
                  <td className="px-2 py-2 text-right">{receivedQuantity(line) ?? '-'}</td>
                  <td className="px-2 py-2"><Badge size="sm" variant={statusVariant(line.status)}>{statusLabel(line.status)}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    {canReceive && isOpen(line.status) && (
                      <Button size="sm" variant="success" onClick={() => onReceive(line)}>
                        <i className="ri-check-line" aria-hidden="true" />Recibido
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
