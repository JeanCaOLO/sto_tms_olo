// Section for settlement returns (devoluciones) in settlement emission.

import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { emptyReturn } from '../../../lib/tarifas/returnsNote';
import type { SettlementReturn } from '../../../lib/tarifas/types';

interface Props {
  returns: SettlementReturn[];
  onSetReturns: (returns: SettlementReturn[]) => void;
  simple: boolean;
}

export function ReturnsSection({ returns, onSetReturns, simple }: Props) {
  const updateReturn = (i: number, patch: Partial<SettlementReturn>) => {
    onSetReturns(returns.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  if (simple) {
    return (
      <div className="border-t border-slate-200 pt-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">
          Devoluciones{returns.length > 0 ? ` · ${returns.length}` : ''}
        </h3>
        <p className="text-xs text-slate-500">
          <strong>Solo informativas:</strong> vienen de guía de despacho y no cambian lo que se paga.
        </p>
        {returns.length === 0 ? (
          <p className="text-xs text-slate-400 mt-1">Sin devoluciones en este viaje.</p>
        ) : (
          <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
            {returns.map((d, i) => (
              <li key={i}>
                • {d.invoiceNumber || 'sin número'} · {d.kind === 'TOTAL' ? 'total' : `parcial ${d.productCode}`}
                {d.notes ? ` · ${d.notes}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <details className="border-t border-slate-200 pt-4 group" open>
      <summary className="text-sm font-semibold text-slate-700 cursor-pointer hidden">
        Devoluciones (opcional){returns.length > 0 ? ` · ${returns.length}` : ''}
      </summary>
      <div className="flex items-center justify-between mb-2 mt-2">
        <h3 className="text-sm font-semibold text-slate-700">4 · Devoluciones</h3>
        <Button variant="secondary" size="sm" onClick={() => onSetReturns([...returns, emptyReturn()])}>
          <i className="ri-add-line mr-1" />
          Agregar
        </Button>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Vienen de guía de despacho; revisalas y ajustalas. <strong>Informativo:</strong> no
        afecta el pago — el viaje se le paga igual al transportista.
      </p>
      {returns.map((d, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
          <div className="col-span-4">
            <Input
              label={i === 0 ? 'Nro de factura / devolución' : undefined}
              value={d.invoiceNumber}
              onChange={(e) => updateReturn(i, { invoiceNumber: e.target.value })}
              placeholder="F-1029"
            />
          </div>
          <div className="col-span-3">
            <Select
              label={i === 0 ? 'Tipo' : undefined}
              value={d.kind}
              onChange={(e) => updateReturn(i, { kind: e.target.value as SettlementReturn['kind'] })}
              options={[
                { value: 'PARCIAL', label: 'Parcial' },
                { value: 'TOTAL', label: 'Total' },
              ]}
            />
          </div>
          <div className="col-span-4">
            <Input
              label={i === 0 ? 'Código de producto' : undefined}
              value={d.productCode}
              onChange={(e) => updateReturn(i, { productCode: e.target.value })}
              placeholder="SKU-44"
              disabled={d.kind === 'TOTAL'}
            />
          </div>
          <div className="col-span-1">
            <Button variant="ghost" size="sm" onClick={() => onSetReturns(returns.filter((_, j) => j !== i))}>
              <i className="ri-delete-bin-line" />
            </Button>
          </div>
        </div>
      ))}
      {returns.length === 0 && <p className="text-xs text-slate-400">Sin devoluciones en este viaje.</p>}
    </details>
  );
}
