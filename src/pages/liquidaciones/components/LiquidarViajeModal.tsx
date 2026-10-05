// Liquidar un viaje de guía de despacho.
//
// Reemplaza al alta manual: el viaje ya existe y sus datos (km, paradas, vehículo, conductor,
// transportista, zona) son de SOLO LECTURA. Lo único que aporta quien liquida son las variables
// PER_TRIP del perfil del transportista (peajes, recolectas…) y las devoluciones.
//
// El cálculo sale siempre de `calculateTrip` —el mismo camino que usa el Probador— y se emite con
// `emitSettlement` o, si el viaje ya tenía una liquidación vigente, con `reliquidateSettlement`. La
// bitácora la escribe `settlementsDataSource`: acá no se registra nada.

import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import { calculateTrip, type TripCalculation } from '../../../lib/tarifas/tripSettlement';
import { listTripReturns } from '../../../lib/tarifas/tripsDataSource';
import { describeTrip, emptyTripEdits } from '../../../lib/tarifas/tripContext';
import {
  constantVars, initialCustomVarValues, parseCustomVarValues,
} from '../../../lib/tarifas/customVarFields';
import { computeSettlementTotals, resultWithTotal } from '../../../lib/tarifas/settlementTotals';
import { emptyReturn, validateReturn } from '../../../lib/tarifas/returnsNote';
import {
  emitSettlement, reliquidateSettlement, type EmitSettlementResult,
} from '../../../lib/tarifas/settlementsDataSource';
import { formatMoney } from '../../../lib/tarifas/format';
import type {
  SettlementRecord, SettlementReturn, SettlementStatus, TripEdits, TripRecord,
} from '../../../lib/tarifas/types';

interface Props {
  /** Viaje a liquidar. Null con `settlement` presente: se re-liquida el viaje de esa liquidación. */
  trip: TripRecord | null;
  /** Liquidación vigente que se reemplaza. Presente = modo re-liquidar. */
  settlement?: SettlementRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const ESTADOS: SettlementStatus[] = ['Borrador', 'En Revisión', 'Aprobado', 'Pagado'];

/** Variables ya guardadas → texto para los campos. */
const toRaw = (edits: TripEdits): Record<string, string> =>
  Object.fromEntries(Object.entries(edits.customVars ?? {}).map(([k, v]) => [k, String(v)]));

export default function LiquidarViajeModal({ trip, settlement, isOpen, onClose, onSaved }: Props) {
  const tripId = trip?.id ?? settlement?.tripId ?? '';
  const reliquidando = !!settlement;

  const [calculation, setCalculation] = useState<TripCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  // Hay un cambio tecleado que todavía no se recalculó: no se puede emitir con un total viejo.
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [customRaw, setCustomRaw] = useState<Record<string, string>>({});
  const [returns, setReturns] = useState<SettlementReturn[]>([]);
  const [excludedSeqs, setExcludedSeqs] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SettlementStatus>('Borrador');
  const [marginReason, setMarginReason] = useState('');
  const [reason, setReason] = useState('');

  // Lo que se calculó: es lo que se guarda, aunque después se siga tecleando.
  const editsUsed = useRef<TripEdits>(emptyTripEdits());
  const calcSeq = useRef(0);

  const runCalc = async (edits: TripEdits) => {
    const seq = ++calcSeq.current;
    try {
      const res = await calculateTrip(tripId, edits, { allowSettled: reliquidando });
      if (seq !== calcSeq.current) return null;
      if (res.status !== 'ok') {
        setCalculation(null);
        setLoadError(res.message);
        return null;
      }
      editsUsed.current = edits;
      setLoadError('');
      setCalculation(res.calculation);
      return res.calculation;
    } catch (e) {
      if (seq !== calcSeq.current) return null;
      console.error('Error calculando la liquidación:', e);
      setCalculation(null);
      setLoadError(e instanceof Error ? e.message : 'No se pudo calcular este viaje.');
      return null;
    }
  };

  // Al abrir: devoluciones precargadas, primer cálculo y campos con sus valores iniciales.
  useEffect(() => {
    if (!isOpen || !tripId) return;
    let cancelled = false;
    setCalculation(null);
    setLoadError('');
    setError('');
    setPending(false);
    setExcludedSeqs(new Set());
    setNotes(settlement?.notes ?? '');
    setStatus('Borrador');
    setMarginReason('');
    setReason('');
    setCustomRaw({});
    setReturns(settlement?.returns ?? []);
    setLoading(true);

    void (async () => {
      const initial = settlement?.tripEdits ?? emptyTripEdits();
      const calc = await runCalc(initial);
      if (cancelled) return;
      if (calc) {
        setCustomRaw({ ...initialCustomVarValues(calc.customVarFields), ...toRaw(initial) });
      }
      if (!settlement) {
        try {
          const precargadas = await listTripReturns(tripId);
          if (!cancelled) setReturns(precargadas);
        } catch (e) {
          console.error('No se pudieron leer las devoluciones del viaje:', e);
          if (!cancelled) setError('No se pudieron precargar las devoluciones del viaje; podés cargarlas a mano.');
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; calcSeq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tripId, settlement?.id]);

  // Recalcula (con una pausa) cuando se editan las variables del viaje.
  useEffect(() => {
    if (!pending || !calculation) return;
    const { values, errors } = parseCustomVarValues(calculation.customVarFields, customRaw);
    if (Object.keys(errors).length > 0) { setError(Object.values(errors).join(' ')); return; }
    setError('');
    const timer = setTimeout(() => {
      void runCalc({ customVars: values as TripEdits['customVars'] }).finally(() => setPending(false));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRaw]);

  const totals = useMemo(
    () => (calculation
      ? computeSettlementTotals(calculation.result.trace, excludedSeqs, calculation.input.country)
      : null),
    [calculation, excludedSeqs],
  );

  // Si se destildaron líneas, lo que se paga cambia y el margen tiene que medirse contra ESE total,
  // no contra el que calculó el motor.
  const effectiveResult = useMemo(
    () => (calculation && totals
      ? resultWithTotal(calculation.result, totals, calculation.input.marginPolicy, calculation.input.country)
      : null),
    [calculation, totals],
  );

  const constantes = useMemo(
    () => constantVars(calculation?.input.partyVariables ?? []),
    [calculation],
  );

  if (!isOpen) return null;

  const currency = calculation?.result.currency ?? '';
  const margin = effectiveResult?.margin;
  const blocking = calculation?.blockingIssues ?? [];
  const puedeEmitir = !!calculation && !!totals && !calculation.notLiquidableReason
    && blocking.length === 0 && !loading && !pending && !saving;

  const setRaw = (key: string, value: string) => {
    setPending(true);
    setCustomRaw((prev) => ({ ...prev, [key]: value }));
  };

  const handleEmitir = async () => {
    if (!calculation || !totals || !effectiveResult) return;
    setError('');

    for (const d of returns) {
      const errs = validateReturn(d);
      if (Object.keys(errs).length > 0) { setError(Object.values(errs).join(' ')); return; }
    }
    if (reliquidando && !reason.trim()) {
      setError('Indicá por qué se re-liquida el viaje.');
      return;
    }

    setSaving(true);
    try {
      const input = {
        trip: calculation.trip,
        partyId: calculation.partyId,
        edits: editsUsed.current,
        status,
        notes: notes.trim() || null,
        marginReason: marginReason.trim() || null,
        context: calculation.context,
        calc: effectiveResult,
        excludedSeqs: [...excludedSeqs],
        returns,
        totalAmount: totals.total,
      };
      const result: EmitSettlementResult = settlement
        ? await reliquidateSettlement(settlement.id, input, reason.trim())
        : await emitSettlement(input);

      if (result.status === 'blocked') { setError(result.issues.map((i) => i.message).join(' ')); return; }
      if (result.status === 'invalid') { setError(Object.values(result.errors).join(' ')); return; }
      if (result.status === 'failed') { setError(result.error.message); return; }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo emitir la liquidación.');
    } finally {
      setSaving(false);
    }
  };

  const updateReturn = (i: number, patch: Partial<SettlementReturn>) =>
    setReturns(returns.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {reliquidando ? 'Re-liquidar viaje' : 'Liquidar viaje'}
              {(trip ?? settlement) && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {trip?.routeNumber ?? settlement?.tripNumber}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {reliquidando
                ? `Reemplaza a ${settlement?.number}: queda anulada y enlazada a la nueva.`
                : 'Los datos del viaje vienen de guía de despacho. Acá se cargan solo las variables y las devoluciones.'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {loading && !calculation ? (
          <div className="text-center py-20 text-slate-400"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 px-6 py-5">
            {/* ══ Formulario ══════════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-3 space-y-5">
              {(error || loadError) && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error || loadError}
                </div>
              )}
              {calculation?.notLiquidableReason && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
                  <i className="ri-information-line mr-1"></i>{calculation.notLiquidableReason}
                </div>
              )}

              {calculation && (
                <>
                  {/* ── 1 · El viaje (solo lectura) ─────────────────────────────────────── */}
                  <section>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">1 · El viaje</h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-xs">
                        {describeTrip(calculation.trip).map((d) => (
                          <Dato key={d.label} label={d.label} valor={d.value} />
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Son de guía de despacho: no se editan desde el liquidador. La fecha del viaje decide
                        qué reglas estaban vigentes.
                      </p>
                    </div>
                    {!calculation.partyId && (
                      <p className="text-xs text-amber-700 mt-2">
                        El transportista no tiene perfil de cálculo: se liquida solo con las reglas del país.
                      </p>
                    )}
                  </section>

                  {/* ── 2 · Variables del transportista ─────────────────────────────────── */}
                  {(calculation.customVarFields.length > 0 || constantes.length > 0) && (
                    <section className="border-t border-slate-200 pt-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">
                        2 · Variables de este viaje
                      </h3>

                      {calculation.customVarFields.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {calculation.customVarFields.map((f) => (
                            <Input
                              key={f.key}
                              label={f.unit ? `${f.label} (${f.unit})` : f.label}
                              type={f.kind === 'NUMBER' ? 'number' : 'text'}
                              value={customRaw[f.key] ?? ''}
                              onChange={(e) => setRaw(f.key, e.target.value)}
                            />
                          ))}
                        </div>
                      )}

                      {constantes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {constantes.map((c) => (
                            <span key={c.key} className="px-2 py-1 text-xs bg-slate-100 rounded-full text-slate-600">
                              {c.label}: <strong>{c.defaultValue}</strong>
                              <span className="text-slate-400 ml-1">fija del transportista</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {calculation.undeclaredVars.length > 0 && (
                        <p className="text-xs text-amber-700 mt-2">
                          Hay reglas que usan variables que el transportista no declaró (valen 0):{' '}
                          {calculation.undeclaredVars.join(', ')}.
                        </p>
                      )}
                    </section>
                  )}

                  {/* ── 3 · Devoluciones ────────────────────────────────────────────────── */}
                  <section className="border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-slate-700">3 · Devoluciones</h3>
                      <Button variant="secondary" size="sm" onClick={() => setReturns([...returns, emptyReturn()])}>
                        <i className="ri-add-line mr-1"></i>Agregar
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
                            options={[{ value: 'PARCIAL', label: 'Parcial' }, { value: 'TOTAL', label: 'Total' }]}
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
                          <Button variant="ghost" size="sm" onClick={() => setReturns(returns.filter((_, j) => j !== i))}>
                            <i className="ri-delete-bin-line"></i>
                          </Button>
                        </div>
                      </div>
                    ))}
                    {returns.length === 0 && (
                      <p className="text-xs text-slate-400">Sin devoluciones en este viaje.</p>
                    )}
                  </section>

                  {/* ── 4 · Cierre ──────────────────────────────────────────────────────── */}
                  <section className="border-t border-slate-200 pt-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">4 · Notas y estado</h3>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Observaciones del viaje"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        label="Estado"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as SettlementStatus)}
                        options={ESTADOS.map((s) => ({ value: s, label: s }))}
                      />
                      {margin && margin.action !== 'NONE' && (
                        <Input
                          label={margin.action === 'REQUIRE_REASON' ? 'Motivo del margen *' : 'Motivo del margen'}
                          value={marginReason}
                          onChange={(e) => setMarginReason(e.target.value)}
                          placeholder="Por qué se liquida con este margen"
                        />
                      )}
                    </div>
                    {reliquidando && (
                      <Input
                        label="Motivo de la re-liquidación *"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Por qué se vuelve a liquidar este viaje"
                      />
                    )}
                  </section>
                </>
              )}
            </div>

            {/* ══ Panel de cálculo ════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-20 space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  ¿Por qué este total?
                  {pending && <i className="ri-loader-4-line animate-spin ml-2 text-slate-400"></i>}
                </h3>

                {blocking.length > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-3">
                    <p className="font-medium mb-1">No se puede emitir:</p>
                    <ul className="space-y-0.5">
                      {blocking.map((p, i) => <li key={i}>• {p.message}</li>)}
                    </ul>
                  </div>
                )}

                {calculation && totals && (
                  <>
                    <CalcBreakdownPanel
                      result={effectiveResult ?? calculation.result}
                      ctx={{
                        rules: calculation.input.rules,
                        customLabels: Object.fromEntries(
                          (calculation.input.partyVariables ?? []).map((v) => [v.key, v.label]),
                        ),
                      }}
                      excludedSeqs={excludedSeqs}
                      total={totals.total}
                      onToggleLine={(seq) => setExcludedSeqs((prev) => {
                        const next = new Set(prev);
                        if (next.has(seq)) next.delete(seq); else next.add(seq);
                        return next;
                      })}
                    />
                    {totals.excludedCount > 0 && (
                      <p className="text-xs text-amber-700">
                        {totals.excludedCount} línea{totals.excludedCount === 1 ? '' : 's'} excluida
                        {totals.excludedCount === 1 ? '' : 's'}: {formatMoney(totals.excludedAmount, currency)} menos.
                      </p>
                    )}
                    {calculation.warnings.length > 0 && (
                      <ul className="text-xs text-amber-700 space-y-0.5">
                        {calculation.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 bg-white flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <div className="text-sm">
            {totals && (
              <span className="text-slate-600">
                Total: <strong className="text-teal-700">{formatMoney(totals.total, currency)}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void handleEmitir()} disabled={!puedeEmitir}>
              <i className="ri-save-line mr-1"></i>
              {saving ? 'Guardando…' : reliquidando ? 'Re-liquidar' : 'Emitir liquidación'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-slate-800 font-medium">{valor}</div>
    </div>
  );
}
