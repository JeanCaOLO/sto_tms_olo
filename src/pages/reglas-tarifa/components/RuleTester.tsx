// El Probador del motor.
//
// Qué es: el banco de pruebas donde se arma un viaje y se ve el total con su desglose, sin emitir
// nada. Sirve para dos cosas distintas y las dos importan — entender por qué una regla cobra lo que
// cobra, y demostrarle a alguien que el cálculo hace lo que se dice que hace.
//
// Dos modos:
//
//   · **Desde un viaje**: se elige un viaje COMPLETADO de guía de despacho y se calcula con
//     `calculateTrip`, el mismo camino que usa la liquidación. Los datos del viaje son de solo
//     lectura; lo único que se prueba a mano son las variables personalizadas de la compañía.
//   · **Viaje libre**: se arma un `TripContext` a mano, para inventar combinaciones que ningún
//     viaje real produce — que es justamente lo que un probador tiene que permitir. Peajes,
//     recolectas y demás van como variables propias de la compañía (`custom:*`).
//
// Las plantillas son escenarios: cada una declara cuánto **debe** dar, el Probador muestra el
// veredicto, y un test recorre todas y se pone rojo si un total se movió.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import { calculate } from '../../../lib/tarifas';
import {
  CatalogError, loadCountries, loadTarifasCatalog, type TarifasCatalog,
} from '../../../lib/tarifas/catalogLoader';
import { buildCalculateInput } from '../../../lib/tarifas/settlementInput';
import { listCarrierProfiles } from '../../../lib/tarifas/partiesDataSource';
import { listTruckTypes, type TruckTypeOption } from '../../../lib/tarifas/vehiclesDataSource';
import { listTrips } from '../../../lib/tarifas/tripsDataSource';
import { calculateTrip } from '../../../lib/tarifas/tripSettlement';
import { describeTrip } from '../../../lib/tarifas/tripContext';
import { listTemplates, saveTemplate } from '../../../lib/tarifas/localRulesDataSource';
import {
  buildCustomVarFields, constantVars, initialCustomVarValues, parseCustomVarValues,
} from '../../../lib/tarifas/customVarFields';
import {
  checkScenario, toScenario, toTemplateRow, type ScenarioCheck, type TemplateScenario,
} from '../../../lib/tarifas/templateScenarios';
import { formatMoney } from '../../../lib/tarifas/format';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type {
  CalcResult, FleetType, Rule, ServiceType, TripContext, TripRecord, Zone,
} from '../../../lib/tarifas/types';

interface RuleTesterProps {
  organizationId: string;
}

type Modo = 'viaje' | 'libre';

/** El viaje del modo libre: lo que en el modo viaje aporta guía de despacho, acá se teclea. */
interface ViajeLibre {
  originZoneId: string;
  destZoneId: string;
  km: string;
  clientCount: string;
  weightKg: string;
  durationHours: string;
  truckTypeId: string;
  truckVolumeM3: string;
  truckWeightTons: string;
  fleetType: FleetType;
  customerId: string;
  carrierId: string;
}

const viajeLibreInicial = (): ViajeLibre => ({
  originZoneId: '', destZoneId: '',
  km: '100', clientCount: '5', weightKg: '500', durationHours: '4',
  truckTypeId: '', truckVolumeM3: '0', truckWeightTons: '0',
  fleetType: 'OWN', customerId: '', carrierId: '',
});

/** Lo del día del viaje libre: no sale de la compañía, es de esta prueba. */
interface DatosDelDia {
  quotedAt: string;
  serviceType: ServiceType;
}

const hoy = () => new Date().toISOString().slice(0, 10);

const diaInicial = (): DatosDelDia => ({ quotedAt: hoy(), serviceType: 'STANDARD' });

/** Lo que se muestra de un cálculo, sea de viaje o libre. */
interface Calculo {
  result: CalcResult;
  trip: TripContext;
  rules: Rule[];
}

const mensajeDe = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function RuleTester({ organizationId }: RuleTesterProps) {
  const [cargando, setCargando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [modo, setModo] = useState<Modo>('viaje');
  const [countryId, setCountryId] = useState('');

  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [carriers, setCarriers] = useState<CarrierProfile[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [truckTypes, setTruckTypes] = useState<TruckTypeOption[]>([]);
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);

  const [tripId, setTripId] = useState('');
  /** Perfil del transportista del viaje elegido: lo informa el último cálculo. */
  const [viajePartyId, setViajePartyId] = useState<string | null>(null);
  const [libre, setLibre] = useState<ViajeLibre>(viajeLibreInicial());
  const [dia, setDia] = useState<DatosDelDia>(diaInicial());
  const [customRaw, setCustomRaw] = useState<Record<string, string>>({});

  const [catalog, setCatalog] = useState<TarifasCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');

  const [escenarioId, setEscenarioId] = useState('');
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Valores de variables que trae una plantilla y que hay que reponer DESPUÉS de que se regeneren
  // los campos de la compañía. Sin esto, aplicar un escenario cargaba sus variables y el efecto que
  // reinicia los campos las pisaba con el valor por defecto un instante después.
  const pendientes = useRef<Record<string, string> | null>(null);

  const libreCarrier = useMemo(
    () => carriers.find((c) => c.carrierId === libre.carrierId) ?? null,
    [carriers, libre.carrierId],
  );
  const partyId = modo === 'viaje' ? viajePartyId : (libreCarrier?.partyId ?? null);
  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  // ── Carga ─────────────────────────────────────────────────────────────────────────────────

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const paises = await loadCountries();
      setCountries(paises.map((c) => ({ id: c.id, name: c.name })));
      setCountryId((prev) => prev || paises[0]?.id || '');
      setTemplates(await listTemplates(organizationId) as Record<string, unknown>[]);
    } catch (e) {
      console.error('Error cargando el probador:', e);
      setError(mensajeDe(e, 'No se pudieron cargar los países ni los escenarios.'));
    } finally {
      setCargando(false);
    }
  }, [organizationId]);

  useEffect(() => { void recargar(); }, [recargar]);

  useEffect(() => {
    if (!countryId) return;
    let vigente = true;
    setLoadingTrips(true);
    void (async () => {
      try {
        const [t, c, trucks] = await Promise.all([
          listTrips({ countryId, status: 'completed' }),
          listCarrierProfiles({ countryId }),
          listTruckTypes(),
        ]);
        if (!vigente) return;
        setTrips(t);
        setCarriers(c);
        setTruckTypes(trucks);
      } catch (e) {
        console.error('Error cargando viajes del probador:', e);
        if (vigente) setError(mensajeDe(e, 'No se pudieron cargar los viajes del país.'));
      } finally {
        if (vigente) setLoadingTrips(false);
      }
    })();
    return () => { vigente = false; };
  }, [countryId]);

  // ── El catálogo del motor ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!countryId) { setCatalog(null); return; }
    let vigente = true;
    setCatalogError('');
    void loadTarifasCatalog(countryId, partyId)
      .then((c) => { if (vigente) setCatalog(c); })
      .catch((e) => {
        if (!vigente) return;
        setCatalog(null);
        setCatalogError(e instanceof CatalogError ? e.message : mensajeDe(e, 'No se pudo cargar el catálogo del país.'));
      });
    return () => { vigente = false; };
  }, [countryId, partyId]);

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

  // ── El cálculo ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let vigente = true;

    const terminar = (c: Calculo | null, mensaje = '') => {
      if (!vigente) return;
      setCalculo(c);
      setError(mensaje);
      setCalculando(false);
    };

    const { values, errors } = parseCustomVarValues(customFields, customRaw);
    if (Object.keys(errors).length > 0) { terminar(null, Object.values(errors).join(' ')); return undefined; }

    if (modo === 'viaje') {
      if (!trip) { terminar(null); return undefined; }
      setCalculando(true);
      void calculateTrip(trip, { customVars: values }, { allowSettled: true })
        .then((r) => {
          if (!vigente) return;
          if (r.status !== 'ok') { terminar(null, r.message); return; }
          const c = r.calculation;
          setViajePartyId((prev) => (prev === c.partyId ? prev : c.partyId));
          terminar({
            result: { ...c.result, warnings: c.warnings, blockingIssues: c.blockingIssues },
            trip: c.input.trip,
            rules: c.input.rules,
          });
        })
        .catch((e) => {
          console.error('Error en el probador del motor:', e);
          terminar(null, mensajeDe(e, 'No se pudo calcular el viaje.'));
        });
      return () => { vigente = false; };
    }

    // Viaje libre: se necesita el catálogo del país.
    if (!catalog) { terminar(null); return undefined; }
    try {
      const fleetType: FleetType = libreCarrier
        ? (libreCarrier.classification === 'OWN' ? 'OWN' : 'OUTSOURCED')
        : libre.fleetType;
      const armado: TripContext = {
        countryId,
        partyId: libreCarrier?.partyId ?? null,
        quotedAt: new Date(dia.quotedAt).toISOString(),
        originLocationId: libre.originZoneId,
        destLocationId: libre.destZoneId,
        km: Number(libre.km) || 0,
        clientCount: Number(libre.clientCount) || 0,
        weightKg: Number(libre.weightKg) || 0,
        truckTypeId: libre.truckTypeId,
        serviceType: dia.serviceType,
        fleetType,
        carrierId: libreCarrier?.carrierId ?? null,
        driverId: null,
        customerId: libre.customerId || null,
        durationHours: Number(libre.durationHours) || 0,
        truckVolumeM3: Number(libre.truckVolumeM3) || 0,
        truckWeightTons: Number(libre.truckWeightTons) || 0,
        customVars: values,
      };
      const { input, issues, warnings } = buildCalculateInput(catalog, armado);
      const calc = calculate(input);
      calc.warnings = [...warnings, ...calc.warnings];
      calc.blockingIssues = [...issues, ...calc.blockingIssues];
      terminar({ result: calc, trip: input.trip, rules: catalog.rules });
    } catch (err) {
      console.error('Error en el probador del motor:', err);
      terminar(null, mensajeDe(err, 'No se pudo evaluar. Revisá el JSON de condiciones o expresiones en modo avanzado.'));
    }
    return () => { vigente = false; };
  }, [modo, trip, libre, libreCarrier, dia, customFields, customRaw, catalog, countryId]);

  const result = calculo?.result ?? null;

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

    // Un escenario guardado describe un viaje entero, no un viaje real: se carga en modo libre.
    setModo('libre');
    setCountryId(s.countryId || countryId);
    setLibre({
      originZoneId: t.originLocationId,
      destZoneId: t.destLocationId,
      km: String(t.km),
      clientCount: String(t.clientCount),
      weightKg: String(t.weightKg),
      durationHours: String(t.durationHours),
      truckTypeId: t.truckTypeId,
      truckVolumeM3: String(t.truckVolumeM3),
      truckWeightTons: String(t.truckWeightTons),
      fleetType: t.fleetType,
      customerId: t.customerId ?? '',
      carrierId: carriers.find((c) => c.partyId && c.partyId === t.partyId)?.carrierId ?? '',
    });
    setDia({ quotedAt: t.quotedAt.slice(0, 10), serviceType: t.serviceType });

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
    if (!escenario || !result || !calculo) return;
    setGuardando(true);
    setError('');
    try {
      const fila = toTemplateRow({
        id: escenario.id,
        name: escenario.name,
        countryId: escenario.countryId,
        trip: calculo.trip,
        expectedTotal: result.totalLiquidado,
      });
      await saveTemplate(organizationId, fila as never, escenario.id);
      setTemplates(await listTemplates(organizationId) as Record<string, unknown>[]);
    } catch (e) {
      console.error('Error fijando el total esperado:', e);
      setError(mensajeDe(e, 'No se pudo guardar el total esperado.'));
    } finally {
      setGuardando(false);
    }
  };

  // ── Pantalla ──────────────────────────────────────────────────────────────────────────────

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
            onChange={(e) => { setCountryId(e.target.value); setTripId(''); setViajePartyId(null); setEscenarioId(''); }}
            options={countries.map((c) => ({ value: c.id, label: c.name }))}
          />

          {/* Los dos modos ───────────────────────────────────────────────────────────── */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {([['viaje', 'Desde un viaje'], ['libre', 'Viaje libre']] as const).map(([valor, label]) => (
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
            {modo === 'viaje'
              ? 'Igual que la liquidación: el viaje completado aporta zona, kilómetros, paradas, peso y vehículo.'
              : 'Para inventar combinaciones que ningún viaje produce y ver qué reglas se despiertan.'}
          </p>

          {catalogError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {catalogError}
            </p>
          )}

          {modo === 'viaje' ? (
            <>
              <Select
                label="Viaje completado *"
                value={tripId}
                onChange={(e) => { setTripId(e.target.value); setViajePartyId(null); }}
                options={[
                  {
                    value: '',
                    label: loadingTrips
                      ? 'Cargando viajes…'
                      : trips.length === 0 ? 'No hay viajes completados en este país' : 'Elegir viaje…',
                  },
                  ...trips.map((t) => ({
                    value: t.id,
                    label: `${t.routeNumber} · ${t.routeDate} · ${t.carrierName ?? 'sin transportista'}`,
                  })),
                ]}
              />

              {trip && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">
                    Del viaje {trip.routeNumber}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 text-xs">
                    {describeTrip(trip).map((d) => <Dato key={d.label} label={d.label} valor={d.value} />)}
                  </div>
                  {trip.carrierId && !viajePartyId && !calculando && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      El transportista no tiene perfil de cálculo: se prueba solo con las reglas del país.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <Select
                label="Compañía (opcional)"
                value={libre.carrierId}
                onChange={(e) => setLibre({ ...libre, carrierId: e.target.value })}
                options={[
                  { value: '', label: 'Sin compañía (solo reglas del país)' },
                  ...carriers.map((c) => ({
                    value: c.carrierId,
                    label: `${c.name} · ${c.classification === 'OWN' ? 'flota propia' : 'tercero'}`,
                  })),
                ]}
              />

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
                  No hay zonas en este país — se dan de alta en Catálogos, o ninguna regla por zona
                  podrá aplicar.
                </p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Input label="Km" type="number" value={libre.km} onChange={(e) => setLibre({ ...libre, km: e.target.value })} />
                <Input label="Paradas completadas" type="number" value={libre.clientCount} onChange={(e) => setLibre({ ...libre, clientCount: e.target.value })} />
                <Input label="Peso (kg)" type="number" value={libre.weightKg} onChange={(e) => setLibre({ ...libre, weightKg: e.target.value })} />
                <Input label="Duración (h)" type="number" value={libre.durationHours} onChange={(e) => setLibre({ ...libre, durationHours: e.target.value })} />
                <div>
                  <Input
                    label="Tipo de camión"
                    value={libre.truckTypeId}
                    onChange={(e) => setLibre({ ...libre, truckTypeId: e.target.value })}
                    list="probador-truck-types"
                  />
                  <datalist id="probador-truck-types">
                    {truckTypes.map((t) => <option key={t.code} value={t.code} />)}
                  </datalist>
                </div>
                <Input label="Volumen (m³)" type="number" value={libre.truckVolumeM3} onChange={(e) => setLibre({ ...libre, truckVolumeM3: e.target.value })} />
                <Input label="Capacidad (t)" type="number" value={libre.truckWeightTons} onChange={(e) => setLibre({ ...libre, truckWeightTons: e.target.value })} />
                <Input label="Cliente (id libre)" value={libre.customerId} onChange={(e) => setLibre({ ...libre, customerId: e.target.value })} />
              </div>

              {!libreCarrier && (
                <Select
                  label="Flota"
                  value={libre.fleetType}
                  onChange={(e) => setLibre({ ...libre, fleetType: e.target.value as FleetType })}
                  options={[{ value: 'OWN', label: 'Propia' }, { value: 'OUTSOURCED', label: 'Tercerizada' }]}
                />
              )}
              {libreCarrier && (
                <p className="text-[11px] text-slate-400">
                  La flota la define el transportista elegido, no se teclea: es su única fuente de verdad.
                </p>
              )}

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
                </div>
              </div>
            </>
          )}

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
          {customFields.length === 0 && (
            <p className="text-[11px] text-slate-400">
              Peajes, recolectas, atrasos e incidencias se prueban como variables propias de la
              compañía: se declaran en su ficha y aparecen acá como campos.
            </p>
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
          {calculando && <i className="ri-loader-4-line animate-spin text-slate-400"></i>}
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

        {!result && !error && !calculando && (
          <p className="text-sm text-slate-400">
            {modo === 'viaje'
              ? 'Elegí un viaje completado para ver el desglose.'
              : 'Completá el viaje para ver el desglose.'}
          </p>
        )}

        {result && calculo && (
          <CalcBreakdownPanel
            result={result}
            ctx={{
              rules: calculo.rules,
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
