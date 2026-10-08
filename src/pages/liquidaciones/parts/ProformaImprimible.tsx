// Proforma de una liquidación para imprimir o guardar como PDF: encabezado, datos del viaje, total,
// reparto por casa comercial, pedidos, devoluciones y el desglose COMPLETO (auditoría). Se arma del
// snapshot guardado, así que sale igual hoy que dentro de un año aunque las reglas cambien.

import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import { formatMoney } from '../../../lib/tarifas/format';
import { pctToDisplay } from '../../../lib/tarifas/money';
import { describeReturn } from '../../../lib/tarifas/returnsNote';
import { describeTrip } from '../../../lib/tarifas/tripContext';
import type { SettlementRecord } from '../../../lib/tarifas/types';
import { settlementToResult } from './settlementResult';

const H = 'text-sm font-semibold text-slate-800 border-b border-slate-300 pb-1 mb-2';
const TH = 'text-left font-semibold text-slate-600 py-1 pr-3';
const TD = 'py-1 pr-3 text-slate-700';

export function ProformaImprimible({ settlement }: { settlement: SettlementRecord }) {
  const { currency, allocation, orders, returns } = settlement;

  return (
    <article className="proforma bg-white text-slate-800 p-8 space-y-5 text-xs">
      <header className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold">Liquidación {settlement.number}</h1>
          <p className="text-slate-500 mt-0.5">
            Viaje {settlement.tripNumber} · Emitida el {settlement.settlementDate} · Estado: {settlement.status}
          </p>
        </div>
        <div className="text-right">
          <div className="text-slate-500">Total a pagar</div>
          <div className="text-2xl font-bold">{formatMoney(settlement.totalAmount, currency)}</div>
        </div>
      </header>

      <section>
        <h2 className={H}>El viaje</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
          {describeTrip(settlement.tripInfo).map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="text-slate-500 w-32 shrink-0">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className={H}>Reparto por casa comercial</h2>
        {!allocation ? (
          <p className="text-slate-500">El viaje no tiene pedidos cargados: no hay reparto por casa comercial.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>Casa comercial</th>
                <th className={`${TH} text-right`}>%</th>
                <th className={`${TH} text-right`}>Monto a pagar</th>
                <th className={`${TH} text-right`}>Valor de la mercancía</th>
              </tr>
            </thead>
            <tbody>
              {allocation.shares.map((s) => (
                <tr key={s.customerId ?? s.code ?? s.name} className="border-t border-slate-100">
                  <td className={TD}>{s.name}{s.code ? ` (${s.code})` : ''}</td>
                  <td className={`${TD} text-right`}>{pctToDisplay(s.share)} %</td>
                  <td className={`${TD} text-right font-medium`}>{formatMoney(s.amount, currency)}</td>
                  <td className={`${TD} text-right`}>{formatMoney(s.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {orders && orders.length > 0 && (
        <section>
          <h2 className={H}>Pedidos del viaje</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>Pedido</th>
                <th className={TH}>Guía</th>
                <th className={TH}>Cliente</th>
                <th className={`${TH} text-right`}>Valor</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={o.orderId ?? i} className="border-t border-slate-100">
                  <td className={TD}>{o.orderNumber ?? '—'}</td>
                  <td className={TD}>{o.guideNumber ?? '—'}</td>
                  <td className={TD}>{o.customerName ?? '—'}</td>
                  <td className={`${TD} text-right`}>{formatMoney(o.value, currency)}</td>
                  <td className={TD}>{o.status}{o.reason ? ` · ${o.reason}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {returns.length > 0 && (
        <section>
          <h2 className={H}>Devoluciones informadas</h2>
          <ul className="space-y-0.5">{returns.map((d, i) => <li key={i}>• {describeReturn(d)}</li>)}</ul>
          <p className="text-slate-400 mt-1">Informativo: no afectaron el pago.</p>
        </section>
      )}

      <section>
        <h2 className={H}>Desglose del cálculo</h2>
        <CalcBreakdownPanel
          result={settlementToResult(settlement)}
          ctx={{ rules: [...settlement.rulesUsed, ...settlement.adhocRules] }}
          excludedSeqs={settlement.excludedSeqs}
          total={settlement.totalAmount}
          fixedLevel="auditoria"
        />
      </section>

      {settlement.notes && (
        <section>
          <h2 className={H}>Notas</h2>
          <p className="whitespace-pre-line">{settlement.notes}</p>
        </section>
      )}
    </article>
  );
}
