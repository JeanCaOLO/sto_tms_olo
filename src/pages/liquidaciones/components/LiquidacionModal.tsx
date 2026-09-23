// Alta de liquidación.
//
// Lo que trae la guía física es lo que se teclea: **nro de viaje, ruta, conductor y cédula**. Todo
// lo demás se deriva, y el formulario lo muestra diciendo de dónde salió.
//
// Reemplaza a un modal de 1.459 líneas que leía rutas, conductores y vehículos del TMS, pedía
// siete números a mano, ofrecía dos desplegables de zona que casi nadie completaba —con lo cual
// ninguna regla por zona aplicaba— y perdía el desglose al guardar.
//
// Casi toda la lógica vive fuera, en módulos puros y probados: la máquina de dependencias
// (`settlementForm`), los campos de variables (`customVarFields`), el total con líneas destildadas
// (`settlementTotals`), el armado de la entrada (`catalogLoader` + `settlementInput`) y la
// explicación del resultado (`explain`). Acá queda la composición.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import DriverCarrierPicker from '../../../components/tarifas/DriverCarrierPicker';
import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import { calculate } from '../../../lib/tarifas';
import { CatalogError, loadParties, loadTarifasCatalog } from '../../../lib/tarifas/catalogLoader';
import { buildCalculateInput } from '../../../lib/tarifas/settlementInput';
import { listRoutesByCountry } from '../../../lib/tarifas/routesDataSource';
import { listDriversByCountry, toDriverOptions } from '../../../lib/tarifas/driversDataSource';
import { listVehicleTypes } from '../../../lib/tarifas/partyVehicleTypesDataSource';
import { emitSettlement } from '../../../lib/tarifas/settlementsDataSource';
import {
  applyDriverSelection, applyPartySelection, applyRouteSelection, applyVehicleSelection,
  availableDrivers, availableRoutes, draftProblems, emptyDraft,
  type FormCatalogs, type SettlementDraft, type VehicleOption,
} from '../../../lib/tarifas/settlementForm';
import {
  buildCustomVarFields, constantVars, initialCustomVarValues, parseCustomVarValues,
} from '../../../lib/tarifas/customVarFields';
import { computeSettlementTotals } from '../../../lib/tarifas/settlementTotals';
import { toTripContext, camposAjustados } from '../../../lib/tarifas/routeTrip';
import { emptyReturn, mergeIntoNotes, validateReturn } from '../../../lib/tarifas/returnsNote';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { obtenerRolActivo } from '../../../lib/liquidador/rbac';
import { formatMoney } from '../../../lib/tarifas/format';
import type {
  CalcResult, DriverDef, RouteDef, SettlementReturn, SettlementStatus, ServiceType, TripContext,
} from '../../../lib/tarifas/types';

interface Props {
  isOpen: boolean;
  countryId: string;
  onClose: () => void;
  onSaved: () => void;
}

const ESTADOS: SettlementStatus[] = ['Borrador', 'En Revisión', 'Aprobado', 'Pagado'];

/** Datos del día: no salen de la ruta, son de este viaje concreto. */
interface DatosDelDia {
  pickupCount: string;
  lateMinutes: string;
  incidentCount: string;
  serviceType: ServiceType;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export default function LiquidacionModal({ isOpen, countryId, onClose, onSaved }: Props) {
  // ── Datos de la guía física ───────────────────────────────────────────────────────────────
  const [tripNumber, setTripNumber] = useState('');
  const [settlementDate, setSettlementDate] = useState(hoy());

  // ── El borrador y sus catálogos ───────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<SettlementDraft>(emptyDraft());
  const [routes, setRoutes] = useState<RouteDef[]>([]);
  const [drivers, setDrivers] = useState<DriverDef[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleOption[]>([]);
  const [descartado, setDescartado] = useState<string | null>(null);

  // ── Del día, variables propias, devoluciones ──────────────────────────────────────────────
  const [dia, setDia] = useState<DatosDelDia>({
    pickupCount: '0', lateMinutes: '0', incidentCount: '0', serviceType: 'STANDARD',
  });
  const [customRaw, setCustomRaw] = useState<Record<string, string>>({});
  const [returns, setReturns] = useState<SettlementReturn[]>([]);
  // Correcciones sobre lo que dice la ruta. Un viaje excepcional puede haber hecho más kilómetros o
  // paradas que la lane típica; obligar a editar la ruta cambiaría el cálculo de todos los demás.
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [ajustando, setAjustando] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SettlementStatus>('Borrador');
  const [marginReason, setMarginReason] = useState('');

  // ── Resultado ─────────────────────────────────────────────────────────────────────────────
  const [calc, setCalc] = useState<CalcResult | null>(null);
  // El viaje con el que se calculó. Hace falta para guardarlo y para saber qué se ajustó a mano.
  const [tripCalculado, setTripCalculado] = useState<TripContext | null>(null);
  const [excludedSeqs, setExcludedSeqs] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const parties = useMemo(
    () => loadParties().filter((p) => p.countryId === countryId),
    [countryId],
  );

  // ── Carga de catálogos ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !countryId) return;
    void (async () => {
      setRoutes(await listRoutesByCountry(countryId));
      setDrivers(await listDriversByCountry(countryId));
    })();
  }, [isOpen, countryId]);

  // El catálogo de vehículos es POR COMPAÑÍA: se recarga al cambiar de transportista.
  useEffect(() => {
    if (!draft.partyId) { setVehicleTypes([]); return; }
    void listVehicleTypes(draft.partyId)
      .then((v) => setVehicleTypes(v.map((t) => ({
        code: t.code, name: t.name, volumeM3: t.volumeM3, weightTons: t.weightTons,
      }))))
      .catch(() => setVehicleTypes([]));
  }, [draft.partyId]);

  useEffect(() => {
    if (!isOpen) return;
    setTripNumber('');
    setSettlementDate(hoy());
    setDraft(emptyDraft());
    setDia({ pickupCount: '0', lateMinutes: '0', incidentCount: '0', serviceType: 'STANDARD' });
    setCustomRaw({});
    setReturns([]);
    setAjustes({});
    setAjusteMotivo('');
    setAjustando(false);
    setNotes('');
    setStatus('Borrador');
    setMarginReason('');
    setCalc(null);
    setTripCalculado(null);
    setExcludedSeqs(new Set());
    setError('');
    setDescartado(null);
  }, [isOpen]);

  const catalogs: FormCatalogs = useMemo(() => ({
    parties: parties.map((p) => ({
      id: p.id, name: p.name, classification: p.classification, status: p.status,
    })),
    routes,
    drivers,
    vehicleTypes,
  }), [parties, routes, drivers, vehicleTypes]);

  // ── El catálogo del motor y las variables de la compañía ──────────────────────────────────

  const catalog = useMemo(() => {
    if (!draft.partyId || !countryId) return null;
    try {
      return loadTarifasCatalog(countryId, draft.partyId);
    } catch (e) {
      return e instanceof CatalogError ? e : null;
    }
  }, [countryId, draft.partyId]);

  const catalogoValido = catalog && !(catalog instanceof CatalogError) ? catalog : null;

  const customFields = useMemo(
    () => buildCustomVarFields(catalogoValido?.partyVariables ?? []),
    [catalogoValido],
  );
  const constantes = useMemo(
    () => constantVars(catalogoValido?.partyVariables ?? []),
    [catalogoValido],
  );

  // Al cambiar de compañía cambian sus variables: se reinician con su valor por defecto.
  useEffect(() => {
    setCustomRaw(initialCustomVarValues(customFields));
  }, [customFields]);

  const ruta = useMemo(
    () => routes.find((r) => r.id === draft.routeId) ?? null,
    [routes, draft.routeId],
  );

  const problemas = draftProblems(draft, catalogs);
  const bloqueantes = problemas.filter((p) => p.blocking);

  // ── El cálculo ────────────────────────────────────────────────────────────────────────────

  /** Sólo los campos realmente corregidos: un vacío significa "dejar lo de la ruta". */
  const overridesDeRuta = useMemo(() => {
    const out: Record<string, number | string> = {};
    for (const [campo, valor] of Object.entries(ajustes)) {
      const texto = valor.trim();
      if (texto === '') continue;
      out[campo] = campo === 'tollsAmount' ? texto : Number(texto);
    }
    return out;
  }, [ajustes]);

  const vehiculo = useMemo(
    () => vehicleTypes.find((v) => v.code === draft.truckTypeCode) ?? null,
    [vehicleTypes, draft.truckTypeCode],
  );

  const recalcular = useCallback(() => {
    setError('');
    if (!ruta || !draft.partyId || !catalogoValido) { setCalc(null); setTripCalculado(null); return; }

    const party = parties.find((p) => p.id === draft.partyId);
    if (!party) { setCalc(null); setTripCalculado(null); return; }

    const { values, errors } = parseCustomVarValues(customFields, customRaw);
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors).join(' '));
      setCalc(null);
      setTripCalculado(null);
      return;
    }

    const trip = toTripContext(ruta, {
      quotedAt: new Date(settlementDate).toISOString(),
      partyId: draft.partyId,
      driverId: draft.driverId,
      truckTypeId: draft.truckTypeCode ?? '',
      serviceType: dia.serviceType,
      // Sin esto, elegir el vehículo no servía de nada: las reglas por volumen o tonelaje valían
      // cero en silencio aunque el catálogo de la compañía declarara la capacidad.
      truckVolumeM3: vehiculo?.volumeM3 ?? 0,
      truckWeightTons: vehiculo?.weightTons ?? 0,
      pickupCount: Number(dia.pickupCount) || 0,
      lateMinutes: Number(dia.lateMinutes) || 0,
      incidentCount: Number(dia.incidentCount) || 0,
      customVars: values,
      overrides: overridesDeRuta as never,
    }, party.classification);

    try {
      const { input, issues, warnings } = buildCalculateInput(catalogoValido, trip);
      const result = calculate(input);
      result.warnings = [...warnings, ...result.warnings];
      result.blockingIssues = [...issues, ...result.blockingIssues];
      setCalc(result);
      setTripCalculado(input.trip);
    } catch (e) {
      // Que el motor falle es un problema; que se lleve puesta la pantalla entera es otro. Sin este
      // borde, cualquier excepción del cálculo desmontaba el modal y la liquidación se perdía.
      console.error('Error calculando la liquidación:', e);
      setCalc(null);
      setTripCalculado(null);
      setError((e as Error)?.message
        || 'No se pudo calcular este viaje. Revisá las reglas activas de la compañía.');
    }
  }, [ruta, draft, catalogoValido, parties, customFields, customRaw, settlementDate, dia, overridesDeRuta, vehiculo]);

  // Recalcula ante CUALQUIER cambio del borrador — incluido el transportista, que era justo lo que
  // el formulario anterior no hacía.
  useEffect(() => { recalcular(); }, [recalcular]);

  const totals = useMemo(
    () => (calc && catalogoValido
      ? computeSettlementTotals(calc.trace, excludedSeqs, catalogoValido.country)
      : null),
    [calc, excludedSeqs, catalogoValido],
  );

  if (!isOpen) return null;

  // ── Las tres puertas de entrada ───────────────────────────────────────────────────────────

  const nombreDe = (id: string | null) => parties.find((p) => p.id === id)?.name ?? '';

  const aplicar = (cambio: { draft: SettlementDraft; cleared: string[] }) => {
    setDraft(cambio.draft);
    setDescartado(cambio.cleared.length === 0 ? null : {
      routeId: 'Se quitó la ruta: era de otra compañía.',
      driverId: 'Se quitó el conductor: era de otra compañía.',
      truckTypeCode: 'Se quitó el vehículo: no está en el catálogo de esta compañía.',
    }[cambio.cleared[0]!] ?? null);
  };

  const handleGuardar = async () => {
    setError('');
    if (!calc || !totals || !ruta || !draft.partyId || !catalogoValido) return;

    if (ajustados.length > 0 && !ajusteMotivo.trim()) {
      setError('Ajustaste datos de la ruta: escribí el motivo antes de emitir.');
      return;
    }

    for (const d of returns) {
      const errs = validateReturn(d);
      if (Object.keys(errs).length > 0) { setError(Object.values(errs).join(' ')); return; }
    }

    setSaving(true);
    try {
      const notasFinales = mergeIntoNotes(notes.trim() || null, returns);
      const { values } = parseCustomVarValues(customFields, customRaw);
      const party = parties.find((p) => p.id === draft.partyId)!;

      if (!tripCalculado) { setError('Todavía no hay un cálculo para emitir.'); return; }

      const result = await emitSettlement({
        countryId,
        partyId: draft.partyId,
        routeId: draft.routeId,
        driverId: draft.driverId,
        tripNumber: tripNumber.trim() || null,
        settlementDate,
        truckTypeId: draft.truckTypeCode,
        status,
        notes: notasFinales,
        marginReason: marginReason.trim() || null,
        trip: tripCalculado,
        calc,
        excludedSeqs: [...excludedSeqs],
        returns,
        totalAmount: totals.total,
      });

      if (result.status === 'blocked') {
        setError(result.issues.map((i) => i.message).join(' '));
        return;
      }
      if (result.status === 'invalid') {
        setError(Object.values(result.errors).join(' '));
        return;
      }
      if (result.status === 'failed') { setError(result.error.message); return; }

      // La liquidación era la ÚNICA pantalla del módulo que no dejaba rastro en la bitácora.
      await registrarEvento({
        entidad: 'settlement',
        entidadId: result.settlement.id,
        accion: 'CREATE',
        usuario: 'Usuario simulado',
        rol: obtenerRolActivo(),
        despues: {
          numero: result.settlement.number,
          viaje: result.settlement.tripNumber,
          ruta: ruta.code,
          compania: nombreDe(draft.partyId),
          total: result.settlement.totalAmount,
          lineasExcluidas: [...excludedSeqs],
          devoluciones: returns.length,
          ...(ajustados.length > 0
            ? { ajustes: { campos: ajustados, motivo: ajusteMotivo.trim() } }
            : {}),
        },
        motivo: marginReason.trim() || undefined,
      });

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const puedeGuardar = !!calc && bloqueantes.length === 0
    && calc.blockingIssues.length === 0 && !saving;

  const driverOptions = toDriverOptions(
    availableDrivers(catalogs, draft.partyId),
    parties.map((p) => ({ id: p.id, name: p.name })),
  );

  const ajustados = ruta && tripCalculado ? camposAjustados(ruta, tripCalculado) : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Nueva liquidación</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cargá lo que dice la guía: nro de viaje, ruta y conductor. El resto se completa solo.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 px-6 py-5">
          {/* ══ Formulario ══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            {descartado && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
                <i className="ri-information-line mr-1"></i>{descartado}
              </div>
            )}

            {/* ── 1 · La guía ────────────────────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">1 · La guía de viaje</h3>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Nro de viaje"
                  value={tripNumber}
                  onChange={(e) => setTripNumber(e.target.value)}
                  placeholder="V-88123"
                />
                <Input
                  label="Fecha *"
                  type="date"
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                La fecha decide qué reglas estaban vigentes: un viaje de agosto se liquida con la
                tarifa de agosto.
              </p>
            </section>

            {/* ── 2 · Quién ──────────────────────────────────────────────────────────── */}
            <section className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">2 · Conductor y transportista</h3>
              <DriverCarrierPicker
                drivers={driverOptions}
                carriers={parties.map((p) => ({ id: p.id, name: p.name }))}
                driverId={draft.driverId ?? ''}
                carrierId={draft.partyId ?? ''}
                onChange={({ driverId, carrierId }) => {
                  if (driverId && driverId !== draft.driverId) {
                    aplicar(applyDriverSelection(draft, driverId, catalogs));
                  } else if (carrierId !== (draft.partyId ?? '')) {
                    aplicar(applyPartySelection(draft, carrierId || null, catalogs));
                  } else {
                    setDraft({ ...draft, driverId: driverId || null });
                  }
                }}
              />
            </section>

            {/* ── 3 · La ruta ────────────────────────────────────────────────────────── */}
            <section className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">3 · La ruta</h3>
              <Select
                label="Ruta *"
                value={draft.routeId ?? ''}
                onChange={(e) => aplicar(applyRouteSelection(draft, e.target.value || null, catalogs))}
                options={[
                  { value: '', label: availableRoutes(catalogs, draft.partyId).length === 0 ? 'No hay rutas cargadas' : 'Elegir ruta…' },
                  ...availableRoutes(catalogs, draft.partyId).map((r) => ({
                    value: r.id, label: `${r.code} — ${r.name}`,
                  })),
                ]}
              />

              {ruta && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">
                    De la ruta {ruta.code}
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-y-2 gap-x-4 text-xs">
                    <Dato label="Zona origen" valor={catalogoValido?.zones.find((z) => z.id === ruta.originZoneId)?.code ?? '—'} />
                    <Dato label="Zona destino" valor={catalogoValido?.zones.find((z) => z.id === ruta.destZoneId)?.code ?? '—'} />
                    <Dato label="Km" valor={String(ruta.km)} />
                    <Dato label="Paradas" valor={String(ruta.stopCount)} />
                    <Dato label="Bultos" valor={String(ruta.packageCount)} />
                    <Dato label="Peso" valor={`${ruta.weightKg} kg`} />
                    <Dato label="Peajes" valor={`${ruta.tollCount} · ${ruta.tollsAmount}`} />
                    <Dato label="Duración" valor={`${ruta.durationHours} h`} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAjustando(!ajustando)}
                    className="mt-2 text-[11px] text-teal-600 hover:underline cursor-pointer"
                  >
                    <i className="ri-edit-line mr-1"></i>
                    {ajustando ? 'Dejar los datos de la ruta' : 'Este viaje fue distinto'}
                  </button>

                  {ajustando && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                      <p className="text-[11px] text-slate-500">
                        Dejá vacío lo que no cambie. Corregir acá NO modifica la ruta: el resto de
                        los viajes la siguen usando tal cual.
                      </p>
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        {([
                          ['km', 'Km'],
                          ['clientCount', 'Paradas'],
                          ['packageCount', 'Bultos'],
                          ['tollCount', 'Peajes'],
                          ['tollsAmount', 'Monto peajes'],
                        ] as const).map(([campo, label]) => (
                          <Input
                            key={campo}
                            label={label}
                            value={ajustes[campo] ?? ''}
                            onChange={(e) => setAjustes({ ...ajustes, [campo]: e.target.value })}
                            placeholder="—"
                          />
                        ))}
                      </div>
                      <Input
                        label="Motivo del ajuste *"
                        value={ajusteMotivo}
                        onChange={(e) => setAjusteMotivo(e.target.value)}
                        placeholder="Desvío por corte de ruta"
                      />
                    </div>
                  )}

                  {ajustados.length > 0 && (
                    <p className="text-[11px] text-amber-700 mt-2">
                      <i className="ri-edit-line mr-1"></i>
                      Ajustado a mano: {ajustados.join(', ')}
                      {ajusteMotivo.trim() && ` — ${ajusteMotivo.trim()}`}
                    </p>
                  )}
                </div>
              )}

              {!ruta && draft.partyId && availableRoutes(catalogs, draft.partyId).length === 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  {nombreDe(draft.partyId)} no tiene rutas cargadas. Se cargan en Compañías → Rutas.
                </p>
              )}
            </section>

            {/* ── 4 · Vehículo ───────────────────────────────────────────────────────── */}
            <section className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">4 · Vehículo</h3>
              <Select
                label="Tipo de vehículo"
                value={draft.truckTypeCode ?? ''}
                onChange={(e) => setDraft(applyVehicleSelection(draft, e.target.value || null))}
                options={[
                  { value: '', label: vehicleTypes.length === 0 ? 'La compañía no tiene vehículos cargados' : 'Elegir…' },
                  ...vehicleTypes.map((v) => ({ value: v.code, label: `${v.code} — ${v.name}` })),
                ]}
                disabled={!draft.partyId}
              />
              <p className="text-xs text-slate-500 mt-1.5">
                De acá salen el volumen y la capacidad. Sin vehículo, las reglas por m³ o toneladas
                no se aplican.
              </p>
            </section>

            {/* ── 5 · Del día ────────────────────────────────────────────────────────── */}
            <section className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">5 · Lo que pasó en el viaje</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input
                  label="Recolectas"
                  type="number"
                  value={dia.pickupCount}
                  onChange={(e) => setDia({ ...dia, pickupCount: e.target.value })}
                />
                <Input
                  label="Minutos de atraso"
                  type="number"
                  value={dia.lateMinutes}
                  onChange={(e) => setDia({ ...dia, lateMinutes: e.target.value })}
                />
                <Input
                  label="Incidentes"
                  type="number"
                  value={dia.incidentCount}
                  onChange={(e) => setDia({ ...dia, incidentCount: e.target.value })}
                />
                <Select
                  label="Tipo de servicio"
                  value={dia.serviceType}
                  onChange={(e) => setDia({ ...dia, serviceType: e.target.value as ServiceType })}
                  options={[
                    { value: 'STANDARD', label: 'Estándar' },
                    { value: 'EXPRESS', label: 'Express' },
                    { value: 'DEDICATED', label: 'Dedicado' },
                  ]}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Las <strong>recolectas</strong> son el servicio de ir a buscar una devolución
                posterior a la entrega. Se pagan si el transportista tiene una regla para ellas.
              </p>
            </section>

            {/* ── 6 · Variables de la compañía ───────────────────────────────────────── */}
            {(customFields.length > 0 || constantes.length > 0) && (
              <section className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  6 · Datos propios de {nombreDe(draft.partyId)}
                </h3>

                {customFields.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {customFields.map((f) => (
                      <Input
                        key={f.key}
                        label={f.unit ? `${f.label} (${f.unit})` : f.label}
                        type={f.kind === 'NUMBER' ? 'number' : 'text'}
                        value={customRaw[f.key] ?? ''}
                        onChange={(e) => setCustomRaw({ ...customRaw, [f.key]: e.target.value })}
                      />
                    ))}
                  </div>
                )}

                {constantes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {constantes.map((c) => (
                      <span key={c.key} className="px-2 py-1 text-xs bg-slate-100 rounded-full text-slate-600">
                        {c.label}: <strong>{c.defaultValue}</strong>
                        <span className="text-slate-400 ml-1">fija de la compañía</span>
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── 7 · Devoluciones ───────────────────────────────────────────────────── */}
            <section className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">7 · Devoluciones</h3>
                <Button variant="secondary" size="sm" onClick={() => setReturns([...returns, emptyReturn()])}>
                  <i className="ri-add-line mr-1"></i>Agregar
                </Button>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                <strong>Informativo:</strong> no afecta el pago — el viaje se le paga igual al
                transportista.
              </p>
              {returns.map((d, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    <Input
                      label={i === 0 ? 'Nro de factura' : undefined}
                      value={d.invoiceNumber}
                      onChange={(e) => setReturns(returns.map((x, j) => j === i ? { ...x, invoiceNumber: e.target.value } : x))}
                      placeholder="F-1029"
                    />
                  </div>
                  <div className="col-span-3">
                    <Select
                      label={i === 0 ? 'Tipo' : undefined}
                      value={d.kind}
                      onChange={(e) => setReturns(returns.map((x, j) => j === i ? { ...x, kind: e.target.value as 'PARCIAL' | 'TOTAL' } : x))}
                      options={[{ value: 'PARCIAL', label: 'Parcial' }, { value: 'TOTAL', label: 'Total' }]}
                    />
                  </div>
                  <div className="col-span-4">
                    <Input
                      label={i === 0 ? 'Código de producto' : undefined}
                      value={d.productCode}
                      onChange={(e) => setReturns(returns.map((x, j) => j === i ? { ...x, productCode: e.target.value } : x))}
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
            </section>

            {/* ── 8 · Cierre ─────────────────────────────────────────────────────────── */}
            <section className="border-t border-slate-200 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">8 · Notas y estado</h3>
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
                {calc?.margin.action !== 'NONE' && (
                  <Input
                    label="Motivo del margen *"
                    value={marginReason}
                    onChange={(e) => setMarginReason(e.target.value)}
                    placeholder="Por qué se liquida con este margen"
                  />
                )}
              </div>
            </section>
          </div>

          {/* ══ Panel de cálculo ════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-20 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">¿Por qué este total?</h3>

              {bloqueantes.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-slate-600 mb-1">Falta para poder liquidar:</p>
                  <ul className="text-xs text-slate-600 space-y-0.5">
                    {bloqueantes.map((p) => <li key={p.code}>• {p.message}</li>)}
                  </ul>
                </div>
              )}

              {catalog instanceof CatalogError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-3">
                  {catalog.message}
                </div>
              )}

              {calc && catalogoValido && totals && (
                <>
                  <CalcBreakdownPanel
                    result={calc}
                    ctx={{
                      rules: catalogoValido.rules,
                      customLabels: Object.fromEntries(
                        catalogoValido.partyVariables.map((v) => [v.key, v.label]),
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
                      {totals.excludedCount === 1 ? '' : 's'}: {formatMoney(totals.excludedAmount, catalogoValido.country.localCurrency)} menos.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <div className="text-sm">
            {totals && catalogoValido && (
              <span className="text-slate-600">
                Total: <strong className="text-teal-700">
                  {formatMoney(totals.total, catalogoValido.country.localCurrency)}
                </strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void handleGuardar()} disabled={!puedeGuardar}>
              <i className="ri-save-line mr-1"></i>
              {saving ? 'Guardando…' : 'Emitir liquidación'}
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
