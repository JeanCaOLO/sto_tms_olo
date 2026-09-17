// El Probador del motor.
//
// Qué es: el banco de pruebas donde se arma un viaje y se ve el total con su desglose, sin emitir
// nada. Sirve para dos cosas distintas y las dos importan — entender por qué una regla cobra lo que
// cobra, y demostrarle a alguien que el cálculo hace lo que se dice que hace.
//
// Lo que estaba mal y esta versión corrige:
//
//   · Mentía sobre dos capacidades. No pasaba las variables personalizadas de la compañía ni su
//     estructura de costos, así que una regla por variable daba cero acá y su valor real en la
//     liquidación. Ahora las dos pantallas pasan por el MISMO armado (`catalogLoader` +
//     `buildCalculateInput`); si el Probador mostrara otra cosa, sería un defecto del motor y no
//     de una copia divergida.
//   · Pedía todo a mano. Trece números y dos zonas, aunque la ruta ya los tuviera cargados. Ahora
//     hay dos modos: **desde una ruta** (la cascada de la liquidación, con conductor y vehículo) y
//     **viaje libre**, para inventar combinaciones que ninguna ruta produce — que es justamente lo
//     que un probador tiene que permitir.
//   · Mandaba `driverId: null` fijo: ninguna regla por conductor podía probarse.
//   · Mostraba una tabla de tres columnas —etapa, regla, monto— y tiraba todo lo que el motor
//     produce para explicarse. Ahora usa el mismo panel plegable que la liquidación.
//
// Y las plantillas dejaron de ser sólo un atajo: cada una declara cuánto **debe** dar, el Probador
// muestra el veredicto, y un test recorre todas y se pone rojo si un total se movió.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import DriverCarrierPicker from '../../../components/tarifas/DriverCarrierPicker';
import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import { calculate } from '../../../lib/tarifas';
import { CatalogError, loadCountries, loadParties, loadTarifasCatalog } from '../../../lib/tarifas/catalogLoader';
import { buildCalculateInput } from '../../../lib/tarifas/settlementInput';
import { listRoutesByCountry } from '../../../lib/tarifas/routesDataSource';
import { listDriversByCountry, toDriverOptions } from '../../../lib/tarifas/driversDataSource';
import { listVehicleTypes } from '../../../lib/tarifas/partyVehicleTypesDataSource';
import { listTemplates, saveTemplate } from '../../../lib/tarifas/localRulesDataSource';
import {
  applyDriverSelection, applyPartySelection, applyRouteSelection, applyVehicleSelection,
  availableRoutes, draftProblems, emptyDraft,
  type FormCatalogs, type SettlementDraft, type VehicleOption,
} from '../../../lib/tarifas/settlementForm';
import {
  buildCustomVarFields, constantVars, initialCustomVarValues, parseCustomVarValues,
} from '../../../lib/tarifas/customVarFields';
import { toTripContext } from '../../../lib/tarifas/routeTrip';
import {
  checkScenario, toScenario, toTemplateRow, type ScenarioCheck, type TemplateScenario,
} from '../../../lib/tarifas/templateScenarios';
import { formatMoney } from '../../../lib/tarifas/format';
import type {
  CalcResult, DriverDef, FleetType, RouteDef, ServiceType, TripContext, Zone,
} from '../../../lib/tarifas/types';

interface RuleTesterProps {
  organizationId: string;
}

type Modo = 'ruta' | 'libre';

/** El viaje del modo libre: lo que en el modo ruta aporta la lane, acá se teclea. */
interface ViajeLibre {
  originZoneId: string;
  destZoneId: string;
  km: string;
  clientCount: string;
  packageCount: string;
  weightKg: string;
  durationHours: string;
  tollsAmount: string;
  tollCount: string;
  truckTypeId: string;
  truckVolumeM3: string;
  truckWeightTons: string;
  fleetType: FleetType;
  customerId: string;
}

const viajeLibreInicial = (): ViajeLibre => ({
  originZoneId: '', destZoneId: '',
  km: '100', clientCount: '5', packageCount: '20', weightKg: '500',
  durationHours: '4', tollsAmount: '0', tollCount: '0',
  truckTypeId: '', truckVolumeM3: '0', truckWeightTons: '0',
  fleetType: 'OWN', customerId: '',
});

/** Lo del día: no sale de la ruta ni de la compañía, es de este viaje. */
interface DatosDelDia {
  quotedAt: string;
  serviceType: ServiceType;
  pickupCount: string;
  lateMinutes: string;
  incidentCount: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);

const diaInicial = (): DatosDelDia => ({
  quotedAt: hoy(), serviceType: 'STANDARD', pickupCount: '0', lateMinutes: '0', incidentCount: '0',
});

export default function RuleTester({ organizationId }: RuleTesterProps) {
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<Modo>('ruta');
  const [countryId, setCountryId] = useState('');

  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [routes, setRoutes] = useState<RouteDef[]>([]);
  const [drivers, setDrivers] = useState<DriverDef[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleOption[]>([]);
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);

  const [draft, setDraft] = useState<SettlementDraft>(emptyDraft());
  const [descartado, setDescartado] = useState<string | null>(null);
  const [libre, setLibre] = useState<ViajeLibre>(viajeLibreInicial());
  const [dia, setDia] = useState<DatosDelDia>(diaInicial());
  const [customRaw, setCustomRaw] = useState<Record<string, string>>({});

  const [escenarioId, setEscenarioId] = useState('');
  const [result, setResult] = useState<CalcResult | null>(null);
  const [tripCalculado, setTripCalculado] = useState<TripContext | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Valores de variables que trae una plantilla y que hay que reponer DESPUÉS de que se regeneren
  // los campos de la compañía. Sin esto, aplicar un escenario cargaba sus variables y el efecto que
  // reinicia los campos las pisaba con el valor por defecto un instante después.
  const pendientes = useRef<Record<string, string> | null>(null);

  // ── Carga ─────────────────────────────────────────────────────────────────────────────────

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const paises = loadCountries();
      setCountries(paises.map((c) => ({ id: c.id, name: c.name })));
      setCountryId((prev) => prev || paises[0]?.id || '');
      setTemplates(await listTemplates(organizationId) as Record<string, unknown>[]);
    } finally {
      setCargando(false);
    }
  }, [organizationId]);

  useEffect(() => { void recargar(); }, [recargar]);

  useEffect(() => {
    if (!countryId) return;
    void (async () => {
      setRoutes(await listRoutesByCountry(countryId));
      setDrivers(await listDriversByCountry(countryId));
    })();
  }, [countryId]);

  useEffect(() => {
    if (!draft.partyId) { setVehicleTypes([]); return; }
    void listVehicleTypes(draft.partyId)
      .then((v) => setVehicleTypes(v.map((t) => ({
        code: t.code, name: t.name, volumeM3: t.volumeM3, weightTons: t.weightTons,
      }))))
      .catch(() => setVehicleTypes([]));
  }, [draft.partyId]);

  const parties = useMemo(
    () => loadParties().filter((p) => p.countryId === countryId),
    [countryId],
  );

  const catalogs: FormCatalogs = useMemo(() => ({
    parties: parties.map((p) => ({
      id: p.id, name: p.name, classification: p.classification, status: p.status,
    })),
    routes,
    drivers,
    vehicleTypes,
  }), [parties, routes, drivers, vehicleTypes]);

  // ── El catálogo del motor ─────────────────────────────────────────────────────────────────

  const catalogOrError = useMemo(() => {
    if (!countryId) return null;
    try {
      return loadTarifasCatalog(countryId, draft.partyId);
    } catch (e) {
      return e instanceof CatalogError ? e : null;
    }
  }, [countryId, draft.partyId]);

  const catalog = catalogOrError && !(catalogOrError instanceof CatalogError) ? catalogOrError : null;
  const catalogError = catalogOrError instanceof CatalogError ? catalogOrError.message : '';

  // Estable entre renders: si fuera un `??` suelto, sería un arreglo nuevo cada vez y el efecto
  // que elige las zonas por defecto se dispararía sin parar.
  const zones: Zone[] = useMemo(() => catalog?.zones ?? [], [catalog]);

  const customFields = useMemo(
    () => buildCustomVarFields(catalog?.partyVariables ?? []),
    [catalog],
  );
  const constantes = useMemo(
    () => constantVars(catalog?.partyVariables ?? []),
    [catalog],
  );

  useEffect(() => {
    const base = initialCustomVarValues(customFields);
    if (pendientes.current) {
      for (const key of Object.keys(base)) {
        const traido = pendientes.current[key];
        if (traido !== undefined) base[key] = traido;
      }
      pendientes.current = null;
    }
    setCustomRaw(base);
  }, [customFields]);

  // Zonas por defecto para el modo libre: sin ellas, toda regla por zona queda muda.
  useEffect(() => {
    if (zones.length === 0) return;
    setLibre((prev) => (prev.originZoneId
      ? prev
      : { ...prev, originZoneId: zones[0].id, destZoneId: zones[1]?.id ?? zones[0].id }));
  }, [zones]);

  const ruta = useMemo(
    () => routes.find((r) => r.id === draft.routeId) ?? null,
    [routes, draft.routeId],
  );

  const vehiculo = useMemo(
    () => vehicleTypes.find((v) => v.code === draft.truckTypeCode) ?? null,
    [vehicleTypes, draft.truckTypeCode],
  );

  const problemas = modo === 'ruta' ? draftProblems(draft, catalogs) : [];

  // ── El cálculo ────────────────────────────────────────────────────────────────────────────

  const armarViaje = useCallback((): TripContext | null => {
    const { values, errors } = parseCustomVarValues(customFields, customRaw);
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors).join(' '));
      return null;
    }

    const quotedAt = new Date(dia.quotedAt).toISOString();

    if (modo === 'ruta') {
      if (!ruta || !draft.partyId) return null;
      const party = parties.find((p) => p.id === draft.partyId);
      if (!party) return null;

      return toTripContext(ruta, {
        quotedAt,
        partyId: draft.partyId,
        driverId: draft.driverId,
        truckTypeId: draft.truckTypeCode ?? '',
        serviceType: dia.serviceType,
        truckVolumeM3: vehiculo?.volumeM3 ?? 0,
        truckWeightTons: vehiculo?.weightTons ?? 0,
        pickupCount: Number(dia.pickupCount) || 0,
        lateMinutes: Number(dia.lateMinutes) || 0,
        incidentCount: Number(dia.incidentCount) || 0,
        customVars: values,
      }, party.classification);
    }

    // Viaje libre: la compañía es opcional, y sin ella la flota la elige quien prueba.
    const party = draft.partyId ? parties.find((p) => p.id === draft.partyId) : null;
    const fleetType: FleetType = party
      ? (party.classification === 'OWN' ? 'OWN' : 'OUTSOURCED')
      : libre.fleetType;

    return {
      countryId,
      partyId: draft.partyId,
      quotedAt,
      originLocationId: libre.originZoneId,
      destLocationId: libre.destZoneId,
      km: Number(libre.km) || 0,
      clientCount: Number(libre.clientCount) || 0,
      packageCount: Number(libre.packageCount) || 0,
      weightKg: Number(libre.weightKg) || 0,
      truckTypeId: libre.truckTypeId,
      serviceType: dia.serviceType,
      fleetType,
      carrierId: fleetType === 'OUTSOURCED' ? draft.partyId : null,
      driverId: draft.driverId,
      customerId: libre.customerId || null,
      durationHours: Number(libre.durationHours) || 0,
      tollsAmount: libre.tollsAmount || '0',
      tollCount: Number(libre.tollCount) || 0,
      pickupCount: Number(dia.pickupCount) || 0,
      truckVolumeM3: Number(libre.truckVolumeM3) || 0,
      truckWeightTons: Number(libre.truckWeightTons) || 0,
      lateMinutes: Number(dia.lateMinutes) || 0,
      incidentCount: Number(dia.incidentCount) || 0,
      customVars: values,
    };
  }, [modo, ruta, draft, parties, vehiculo, libre, dia, customFields, customRaw, countryId]);

  const recalcular = useCallback(() => {
    setError('');
    if (!catalog) { setResult(null); setTripCalculado(null); return; }

    try {
      const trip = armarViaje();
      if (!trip) { setResult(null); setTripCalculado(null); return; }

      const { input, issues, warnings } = buildCalculateInput(catalog, trip);
      const calc = calculate(input);
      calc.warnings = [...warnings, ...calc.warnings];
      calc.blockingIssues = [...issues, ...calc.blockingIssues];
      setResult(calc);
      setTripCalculado(input.trip);
    } catch (err) {
      console.error('Error en el probador del motor:', err);
      setResult(null);
      setTripCalculado(null);
      setError((err as Error)?.message
        || 'No se pudo evaluar. Revisá el JSON de condiciones o expresiones en modo avanzado.');
    }
  }, [catalog, armarViaje]);

  // Recalcula ante cualquier cambio: es un probador, ver el efecto inmediato ES la herramienta.
  useEffect(() => { recalcular(); }, [recalcular]);

  // ── Escenarios ────────────────────────────────────────────────────────────────────────────

  const escenario: TemplateScenario | null = useMemo(() => {
    const row = templates.find((t) => t.id === escenarioId);
    return row ? toScenario(row as never) : null;
  }, [templates, escenarioId]);

  const veredicto: ScenarioCheck | null = useMemo(
    () => (escenario && result ? checkScenario(escenario, result.totalLiquidado) : null),
    [escenario, result],
  );

  const aplicarEscenario = (id: string) => {
    setEscenarioId(id);
    const row = templates.find((t) => t.id === id);
    if (!row) return;

    const s = toScenario(row as never);
    const t = s.trip;

    // Un escenario guardado describe un viaje entero, no una lane: se carga en modo libre.
    setModo('libre');
    setCountryId(s.countryId || countryId);
    setDraft((prev) => ({ ...prev, partyId: t.partyId, routeId: null, driverId: t.driverId, truckTypeCode: null }));
    setLibre({
      originZoneId: t.originLocationId,
      destZoneId: t.destLocationId,
      km: String(t.km),
      clientCount: String(t.clientCount),
      packageCount: String(t.packageCount),
      weightKg: String(t.weightKg),
      durationHours: String(t.durationHours),
      tollsAmount: String(t.tollsAmount),
      tollCount: String(t.tollCount),
      truckTypeId: t.truckTypeId,
      truckVolumeM3: String(t.truckVolumeM3),
      truckWeightTons: String(t.truckWeightTons),
      fleetType: t.fleetType,
      customerId: t.customerId ?? '',
    });
    setDia({
      quotedAt: t.quotedAt.slice(0, 10),
      serviceType: t.serviceType,
      pickupCount: String(t.pickupCount),
      lateMinutes: String(t.lateMinutes),
      incidentCount: String(t.incidentCount),
    });

    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(t.customVars ?? {})) vars[k] = String(v);
    pendientes.current = vars;
    setCustomRaw((prev) => ({ ...prev, ...vars }));
  };

  /**
   * Fija el total actual como el esperado del escenario.
   *
   * Es deliberadamente un acto explícito: un total que se movió puede ser una mejora o una
   * regresión, y la única forma de distinguirlas es que alguien mire el número nuevo y lo acepte.
   */
  const fijarEsperado = async () => {
    if (!escenario || !result || !tripCalculado) return;
    setGuardando(true);
    try {
      const fila = toTemplateRow({
        id: escenario.id,
        name: escenario.name,
        countryId: escenario.countryId,
        trip: tripCalculado,
        expectedTotal: result.totalLiquidado,
      });
      await saveTemplate(organizationId, fila as never, escenario.id);
      setTemplates(await listTemplates(organizationId) as Record<string, unknown>[]);
    } finally {
      setGuardando(false);
    }
  };

  // ── Pantalla ──────────────────────────────────────────────────────────────────────────────

  const aplicar = (cambio: { draft: SettlementDraft; cleared: string[] }) => {
    setDraft(cambio.draft);
    setDescartado(cambio.cleared.length === 0 ? null : {
      routeId: 'Se quitó la ruta: era de otra compañía.',
      driverId: 'Se quitó el conductor: era de otra compañía.',
      truckTypeCode: 'Se quitó el vehículo: no está en el catálogo de esta compañía.',
    }[cambio.cleared[0]] ?? null);
  };

  const driverOptions = useMemo(
    () => toDriverOptions(drivers, parties.map((p) => ({ id: p.id, name: p.name }))),
    [drivers, parties],
  );

  const zonaCode = (id: string) => zones.find((z) => z.id === id)?.code ?? '—';

  if (cargando) {
    return (
      <Card>
        <div className="text-center py-10 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── El viaje ──────────────────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <i className="ri-flask-line text-teal-600"></i>
            El viaje de prueba
          </h3>
          <Button variant="secondary" size="sm" onClick={() => void recargar()}>
            <i className="ri-refresh-line"></i>
            Recargar
          </Button>
        </div>

        <div className="space-y-3">
          {templates.length > 0 && (
            <Select
              label="Escenario guardado"
              value={escenarioId}
              onChange={(e) => (e.target.value ? aplicarEscenario(e.target.value) : setEscenarioId(''))}
              options={[
                { value: '', label: 'Ninguno — armar el viaje a mano' },
                ...templates.map((t) => ({ value: String(t.id), label: String(t.name) })),
              ]}
            />
          )}

          <Select
            label="País"
            value={countryId}
            onChange={(e) => { setCountryId(e.target.value); setDraft(emptyDraft()); setEscenarioId(''); }}
            options={countries.map((c) => ({ value: c.id, label: c.name }))}
          />

          {/* Los dos modos ───────────────────────────────────────────────────────────── */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {([['ruta', 'Desde una ruta'], ['libre', 'Viaje libre']] as const).map(([valor, label]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setModo(valor)}
                className={`flex-1 text-xs py-1.5 rounded-md cursor-pointer transition ${
                  modo === valor ? 'bg-white shadow-sm font-medium text-slate-800' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">
            {modo === 'ruta'
              ? 'Igual que el alta de liquidación: la ruta aporta zonas, kilómetros, paradas y peajes.'
              : 'Para inventar combinaciones que ninguna ruta produce y ver qué reglas se despiertan.'}
          </p>

          {catalogError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {catalogError}
            </p>
          )}

          {/* Compañía ──────────────────────────────────────────────────────────────────── */}
          <Select
            label={modo === 'ruta' ? 'Compañía a la que se le liquida *' : 'Compañía (opcional)'}
            value={draft.partyId ?? ''}
            onChange={(e) => aplicar(applyPartySelection(draft, e.target.value || null, catalogs))}
            options={[
              { value: '', label: modo === 'ruta' ? 'Elegir…' : 'Sin compañía (sólo reglas del país)' },
              ...parties.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.classification === 'OWN' ? 'flota propia' : 'tercero'}`,
              })),
            ]}
          />

          {descartado && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <i className="ri-information-line mr-1"></i>{descartado}
            </p>
          )}

          {modo === 'ruta' ? (
            <>
              <Select
                label="Ruta *"
                value={draft.routeId ?? ''}
                onChange={(e) => aplicar(applyRouteSelection(draft, e.target.value || null, catalogs))}
                options={[
                  {
                    value: '',
                    label: availableRoutes(catalogs, draft.partyId).length === 0
                      ? 'No hay rutas cargadas para esta compañía'
                      : 'Elegir ruta…',
                  },
                  ...availableRoutes(catalogs, draft.partyId).map((r) => ({
                    value: r.id, label: `${r.code} — ${r.name}`,
                  })),
                ]}
              />

              {ruta && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">
                    De la ruta {ruta.code}
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-y-2 gap-x-4 text-xs">
                    <Dato label="Zona origen" valor={zonaCode(ruta.originZoneId)} />
                    <Dato label="Zona destino" valor={zonaCode(ruta.destZoneId)} />
                    <Dato label="Km" valor={String(ruta.km)} />
                    <Dato label="Paradas" valor={String(ruta.stopCount)} />
                    <Dato label="Bultos" valor={String(ruta.packageCount)} />
                    <Dato label="Peso" valor={`${ruta.weightKg} kg`} />
                    <Dato label="Peajes" valor={`${ruta.tollCount} · ${ruta.tollsAmount}`} />
                    <Dato label="Duración" valor={`${ruta.durationHours} h`} />
                  </div>
                </div>
              )}

              <DriverCarrierPicker
                drivers={driverOptions}
                carriers={parties.map((p) => ({ id: p.id, name: p.name }))}
                driverId={draft.driverId ?? ''}
                carrierId={draft.partyId ?? ''}
                onChange={(next) => {
                  if (next.driverId !== (draft.driverId ?? '')) {
                    aplicar(applyDriverSelection(draft, next.driverId || null, catalogs));
                  } else if (next.carrierId !== (draft.partyId ?? '')) {
                    aplicar(applyPartySelection(draft, next.carrierId || null, catalogs));
                  }
                }}
              />

              <Select
                label="Tipo de vehículo"
                value={draft.truckTypeCode ?? ''}
                onChange={(e) => setDraft(applyVehicleSelection(draft, e.target.value || null))}
                options={[
                  {
                    value: '',
                    label: vehicleTypes.length === 0
                      ? 'La compañía no tiene catálogo de vehículos'
                      : 'Elegir vehículo…',
                  },
                  ...vehicleTypes.map((v) => ({
                    value: v.code,
                    label: `${v.code} — ${v.name}${v.volumeM3 ? ` · ${v.volumeM3} m³` : ''}`,
                  })),
                ]}
              />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Zona origen"
                  value={libre.originZoneId}
                  onChange={(e) => setLibre({ ...libre, originZoneId: e.target.value })}
                  options={zones.map((z) => ({ value: z.id, label: `${z.code} — ${z.name}` }))}
                />
                <Select
                  label="Zona destino"
                  value={libre.destZoneId}
                  onChange={(e) => setLibre({ ...libre, destZoneId: e.target.value })}
                  options={zones.map((z) => ({ value: z.id, label: `${z.code} — ${z.name}` }))}
                />
              </div>

              {zones.length === 0 && (
                <p className="text-xs text-amber-600">
                  No hay zonas en este país — creá al menos una en la pestaña Zonas, o ninguna regla
                  por zona podrá aplicar.
                </p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Input label="Km" type="number" value={libre.km} onChange={(e) => setLibre({ ...libre, km: e.target.value })} />
                <Input label="Paradas" type="number" value={libre.clientCount} onChange={(e) => setLibre({ ...libre, clientCount: e.target.value })} />
                <Input label="Bultos" type="number" value={libre.packageCount} onChange={(e) => setLibre({ ...libre, packageCount: e.target.value })} />
                <Input label="Peso (kg)" type="number" value={libre.weightKg} onChange={(e) => setLibre({ ...libre, weightKg: e.target.value })} />
                <Input label="Duración (h)" type="number" value={libre.durationHours} onChange={(e) => setLibre({ ...libre, durationHours: e.target.value })} />
                <Input label="Cantidad de peajes" type="number" value={libre.tollCount} onChange={(e) => setLibre({ ...libre, tollCount: e.target.value })} />
                <Input label="Monto de peajes" value={libre.tollsAmount} onChange={(e) => setLibre({ ...libre, tollsAmount: e.target.value })} />
                <Input label="Vehículo (código)" value={libre.truckTypeId} onChange={(e) => setLibre({ ...libre, truckTypeId: e.target.value })} />
                <Input label="Volumen (m³)" type="number" value={libre.truckVolumeM3} onChange={(e) => setLibre({ ...libre, truckVolumeM3: e.target.value })} />
                <Input label="Capacidad (t)" type="number" value={libre.truckWeightTons} onChange={(e) => setLibre({ ...libre, truckWeightTons: e.target.value })} />
                <Input label="Cliente (id libre)" value={libre.customerId} onChange={(e) => setLibre({ ...libre, customerId: e.target.value })} />
              </div>

              {!draft.partyId && (
                <Select
                  label="Flota"
                  value={libre.fleetType}
                  onChange={(e) => setLibre({ ...libre, fleetType: e.target.value as FleetType })}
                  options={[{ value: 'OWN', label: 'Propia' }, { value: 'OUTSOURCED', label: 'Tercerizada' }]}
                />
              )}
              {draft.partyId && (
                <p className="text-[11px] text-slate-400">
                  La flota la define la compañía elegida, no se teclea: es su única fuente de verdad.
                </p>
              )}
            </>
          )}

          {/* Lo del día ────────────────────────────────────────────────────────────────── */}
          <div className="border-t border-slate-200 pt-3">
            <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">Lo del día</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input label="Fecha" type="date" value={dia.quotedAt} onChange={(e) => setDia({ ...dia, quotedAt: e.target.value })} />
              <Select
                label="Servicio"
                value={dia.serviceType}
                onChange={(e) => setDia({ ...dia, serviceType: e.target.value as ServiceType })}
                options={[
                  { value: 'STANDARD', label: 'Estándar' },
                  { value: 'EXPRESS', label: 'Express' },
                  { value: 'DEDICATED', label: 'Dedicado' },
                ]}
              />
              <Input label="Recolectas" type="number" value={dia.pickupCount} onChange={(e) => setDia({ ...dia, pickupCount: e.target.value })} />
              <Input label="Minutos de atraso" type="number" value={dia.lateMinutes} onChange={(e) => setDia({ ...dia, lateMinutes: e.target.value })} />
              <Input label="Incidentes" type="number" value={dia.incidentCount} onChange={(e) => setDia({ ...dia, incidentCount: e.target.value })} />
            </div>
          </div>

          {/* Variables de la compañía ──────────────────────────────────────────────────── */}
          {(customFields.length > 0 || constantes.length > 0) && (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">
                Variables de la compañía
              </p>
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {constantes.map((c) => (
                    <span key={c.key} className="px-2 py-1 text-xs bg-slate-100 rounded-full text-slate-600">
                      {c.label}: <strong>{c.defaultValue}</strong>
                      <span className="text-slate-400 ml-1">fija de la compañía</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {problemas.length > 0 && (
            <ul className="space-y-1">
              {problemas.map((p) => (
                <li
                  key={p.code}
                  className={`text-xs rounded-lg px-3 py-2 border ${
                    p.blocking
                      ? 'text-slate-600 bg-slate-50 border-slate-200'
                      : 'text-amber-700 bg-amber-50 border-amber-200'
                  }`}
                >
                  {p.message}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-400">
            Acá no se emite nada: es el mismo cálculo que hará la liquidación, con los mismos datos.
            La bifurcación nómina (flota propia) / cuentas por pagar (tercero) la deciden las reglas
            condicionadas por flota, no un cálculo aparte.
          </p>
        </div>
      </Card>

      {/* ── El resultado ──────────────────────────────────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <i className="ri-file-list-3-line text-teal-600"></i>
          ¿Por qué este total?
        </h3>

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
            <span>{error}</span>
          </div>
        )}

        {veredicto && result && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 border text-sm ${
              veredicto.verdict === 'OK'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : veredicto.verdict === 'MOVIO'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            {veredicto.verdict === 'OK' && (
              <>
                <i className="ri-check-line mr-1"></i>
                Este escenario sigue dando lo que declara:{' '}
                <strong>{formatMoney(veredicto.expected!, result.currency)}</strong>.
              </>
            )}
            {veredicto.verdict === 'MOVIO' && (
              <>
                <i className="ri-error-warning-line mr-1"></i>
                El total se movió: esperaba <strong>{formatMoney(veredicto.expected!, result.currency)}</strong>{' '}
                y da <strong>{formatMoney(veredicto.actual, result.currency)}</strong>{' '}
                (diferencia {veredicto.drift}). Si el cambio es correcto, fijá el total nuevo.
              </>
            )}
            {veredicto.verdict === 'SIN_ESPERADO' && (
              <>Este escenario no declara un total esperado: no verifica nada todavía.</>
            )}
            {veredicto.verdict !== 'OK' && (
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={() => void fijarEsperado()} disabled={guardando}>
                  <i className="ri-bookmark-line mr-1"></i>
                  Fijar {formatMoney(veredicto.actual, result.currency)} como el total esperado
                </Button>
              </div>
            )}
          </div>
        )}

        {!result && !error && (
          <p className="text-sm text-slate-400">
            {modo === 'ruta'
              ? 'Elegí compañía y ruta para ver el desglose.'
              : 'Completá el viaje para ver el desglose.'}
          </p>
        )}

        {result && (
          <CalcBreakdownPanel
            result={result}
            ctx={{
              rules: catalog?.rules ?? [],
              customLabels: Object.fromEntries(
                [...customFields, ...constantes].map((f) => [f.key, f.label]),
              ),
            }}
          />
        )}
      </Card>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <span className="block text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium">{valor}</span>
    </div>
  );
}
