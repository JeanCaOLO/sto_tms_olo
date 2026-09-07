import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { calculate, deriveContext } from '../../../lib/tarifas';
import { listRulesAndZonesForTesting, listTemplates } from '../../../lib/tarifas/rulesDataSource';
import type {
  CalcResult, CalculateInput, Country, FleetType, Location, Rule, ServiceType, Zone, ZoneGroup,
} from '../../../lib/tarifas/types';

interface RuleTesterProps {
  organizationId: string;
}

const STAGE_LABELS: Record<string, string> = {
  BASE: 'Base', VARIABLE: 'Variable', MODIFIER: 'Modificador',
  SURCHARGE: 'Recargo', ADJUSTMENT: 'Ajuste', TAX: 'Impuesto',
};

export default function RuleTester({ organizationId }: RuleTesterProps) {
  const [loadingData, setLoadingData] = useState(true);
  const [countries, setCountries] = useState<any[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneGroups, setZoneGroups] = useState<ZoneGroup[]>([]);
  const [rawRules, setRawRules] = useState<any[]>([]);
  const [rawZoneLaneRates, setRawZoneLaneRates] = useState<any[]>([]);
  const [rawFxRates, setRawFxRates] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [trip, setTrip] = useState({
    countryId: '',
    originZoneId: '',
    destZoneId: '',
    quotedAt: new Date().toISOString().split('T')[0],
    km: 100,
    clientCount: 5,
    packageCount: 20,
    weightKg: 500,
    truckTypeId: 'CAMION-1',
    serviceType: 'STANDARD' as ServiceType,
    fleetType: 'OWN' as FleetType,
    carrierId: '',
    customerId: '',
    durationHours: 4,
    tollsAmount: '0',
    lateMinutes: 0,
    incidentCount: 0,
  });

  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoadingData(true);
    try {
      const raw = await listRulesAndZonesForTesting(organizationId);
      setCountries(raw.countries);
      setZoneGroups(raw.zoneGroups.map((g: any) => ({ id: g.id, countryId: g.country_id ?? '', code: g.code, name: g.name })));
      const mappedZones: Zone[] = raw.zones.map((z: any) => ({ id: z.id, countryId: z.country_id ?? '', zoneGroupId: z.zone_group_id ?? null, code: z.code, name: z.name }));
      setZones(mappedZones);
      setRawRules(raw.rules);
      setRawZoneLaneRates(raw.zoneLaneRates);
      setRawFxRates(raw.fxRates);
      setCarriers(raw.carriers);
      setTemplates(await listTemplates(organizationId));

      setTrip((prev) => ({
        ...prev,
        countryId: prev.countryId || raw.countries[0]?.id || '',
        originZoneId: prev.originZoneId || mappedZones[0]?.id || '',
        destZoneId: prev.destZoneId || mappedZones[1]?.id || mappedZones[0]?.id || '',
      }));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const runCalculation = () => {
    setError('');
    setResult(null);
    try {
      const countryRow = countries.find((c: any) => c.id === trip.countryId) as any;
      if (!countryRow) throw new Error('Elegí un país.');
      const country: Country = {
        id: countryRow.id,
        iso2: countryRow.iso2,
        name: countryRow.name,
        localCurrency: countryRow.local_currency,
        refCurrency: countryRow.ref_currency,
        roundingDecimals: countryRow.rounding_decimals,
        roundingMode: countryRow.rounding_mode,
        overnightThresholdHours: countryRow.overnight_threshold_hours,
      };

      const originZone = zones.find((z) => z.id === trip.originZoneId);
      const destZone = zones.find((z) => z.id === trip.destZoneId);
      const locations: Location[] = [
        ...(originZone ? [{ id: originZone.id, countryId: originZone.countryId, zoneId: originZone.id, code: originZone.code, name: originZone.name }] : []),
        ...(destZone ? [{ id: destZone.id, countryId: destZone.countryId, zoneId: destZone.id, code: destZone.code, name: destZone.name }] : []),
      ];

      // Mismo fallback que src/lib/tarifas/repository.ts::mapRuleRow: country_id nulo = regla
      // global, se "estampa" el país del viaje actual (resolveRules filtra por countryId exacto).
      const mappedRules: Rule[] = rawRules.map((r: any) => ({
        id: r.id, countryId: r.country_id ?? trip.countryId, code: r.code, name: r.name, stage: r.stage,
        priority: r.priority, stacking: r.stacking, exclusionGroup: r.exclusion_group ?? null,
        currencyMode: r.currency_mode, conditions: r.conditions, expression: r.expression,
        isAdhoc: !!r.is_adhoc, active: !!r.active, version: r.version,
      }));

      const input: CalculateInput = {
        country,
        trip: {
          countryId: trip.countryId,
          quotedAt: new Date(trip.quotedAt).toISOString(),
          originLocationId: originZone?.id ?? '',
          destLocationId: destZone?.id ?? '',
          km: Number(trip.km),
          clientCount: Number(trip.clientCount),
          packageCount: Number(trip.packageCount),
          weightKg: Number(trip.weightKg),
          truckTypeId: trip.truckTypeId,
          serviceType: trip.serviceType,
          fleetType: trip.fleetType,
          carrierId: trip.carrierId || null,
          driverId: null,
          customerId: trip.customerId || null,
          durationHours: Number(trip.durationHours),
          tollsAmount: trip.tollsAmount || '0',
          lateMinutes: Number(trip.lateMinutes),
          incidentCount: Number(trip.incidentCount),
        },
        rules: mappedRules,
        zones,
        zoneGroups,
        locations,
        zoneLaneRates: rawZoneLaneRates
          .filter((r) => r.country_id === trip.countryId)
          .map((r) => ({ id: r.id, countryId: trip.countryId, originZoneId: r.origin_zone_id, destZoneId: r.dest_zone_id, amount: String(r.amount) })),
        fxRates: rawFxRates
          .filter((r) => r.country_id === trip.countryId)
          .map((r) => ({ id: r.id, countryId: trip.countryId, from: r.from_currency, to: r.to_currency, rate: String(r.rate), type: r.rate_type, source: r.source ?? '', validFrom: r.valid_from })),
      };

      const calcResult = calculate(input);
      const derived = deriveContext(input);
      setResult(calcResult);
      if (derived.originZoneId === '' || derived.destZoneId === '') {
        setError('Aviso: no se resolvió zona origen y/o destino (revisá que las zonas elegidas existan) — las reglas que condicionen por zona no van a matchear.');
      }
    } catch (err: any) {
      console.error('Error en el probador del motor:', err);
      setError(err?.message || 'Ocurrió un error evaluando las reglas. Revisá el JSON de condiciones/expresiones en modo avanzado.');
    }
  };

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl?.trip) return;
    const t = tpl.trip;
    setTrip((prev) => ({
      ...prev,
      countryId: tpl.country_id ?? prev.countryId,
      originZoneId: t.originLocationId ?? prev.originZoneId,
      destZoneId: t.destLocationId ?? prev.destZoneId,
      km: t.km ?? prev.km,
      clientCount: t.clientCount ?? prev.clientCount,
      packageCount: t.packageCount ?? prev.packageCount,
      weightKg: t.weightKg ?? prev.weightKg,
      truckTypeId: t.truckTypeId ?? prev.truckTypeId,
      serviceType: t.serviceType ?? prev.serviceType,
      fleetType: t.fleetType ?? prev.fleetType,
      carrierId: t.carrierId ?? '',
      customerId: t.customerId ?? '',
      durationHours: t.durationHours ?? prev.durationHours,
      tollsAmount: t.tollsAmount ?? prev.tollsAmount,
      lateMinutes: t.lateMinutes ?? prev.lateMinutes,
      incidentCount: t.incidentCount ?? prev.incidentCount,
    }));
  };

  if (loadingData) {
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
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <i className="ri-flask-line text-teal-600"></i>
            Datos del viaje de prueba
          </h3>
          <Button variant="secondary" size="sm" onClick={loadData}>
            <i className="ri-refresh-line"></i>
            Recargar datos
          </Button>
        </div>

        <div className="space-y-3">
          {templates.length > 0 && (
            <Select
              label="Cargar plantilla"
              value={selectedTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
              options={[{ value: '', label: 'Sin plantilla (viaje manual)' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
            />
          )}
          <Select
            label="País"
            value={trip.countryId}
            onChange={(e) => setTrip({ ...trip, countryId: e.target.value })}
            options={countries.map((c: any) => ({ value: c.id, label: c.name }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Zona origen"
              value={trip.originZoneId}
              onChange={(e) => setTrip({ ...trip, originZoneId: e.target.value })}
              options={zones.map((z) => ({ value: z.id, label: `${z.code} - ${z.name}` }))}
            />
            <Select
              label="Zona destino"
              value={trip.destZoneId}
              onChange={(e) => setTrip({ ...trip, destZoneId: e.target.value })}
              options={zones.map((z) => ({ value: z.id, label: `${z.code} - ${z.name}` }))}
            />
          </div>

          {zones.length === 0 && (
            <p className="text-xs text-amber-600">No hay zonas todavía — creá al menos una en la pestaña Zonas.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Km" type="number" value={trip.km} onChange={(e) => setTrip({ ...trip, km: Number(e.target.value) })} />
            <Input label="Paradas/clientes" type="number" value={trip.clientCount} onChange={(e) => setTrip({ ...trip, clientCount: Number(e.target.value) })} />
            <Input label="Entregas/bultos" type="number" value={trip.packageCount} onChange={(e) => setTrip({ ...trip, packageCount: Number(e.target.value) })} />
            <Input label="Peso (kg)" type="number" value={trip.weightKg} onChange={(e) => setTrip({ ...trip, weightKg: Number(e.target.value) })} />
            <Input label="Duración (horas)" type="number" value={trip.durationHours} onChange={(e) => setTrip({ ...trip, durationHours: Number(e.target.value) })} />
            <Input label="Peajes" value={trip.tollsAmount} onChange={(e) => setTrip({ ...trip, tollsAmount: e.target.value })} />
            <Input label="Minutos de atraso" type="number" value={trip.lateMinutes} onChange={(e) => setTrip({ ...trip, lateMinutes: Number(e.target.value) })} />
            <Input label="Incidentes" type="number" value={trip.incidentCount} onChange={(e) => setTrip({ ...trip, incidentCount: Number(e.target.value) })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Tipo de servicio"
              value={trip.serviceType}
              onChange={(e) => setTrip({ ...trip, serviceType: e.target.value as ServiceType })}
              options={[{ value: 'STANDARD', label: 'Estándar' }, { value: 'EXPRESS', label: 'Express' }, { value: 'DEDICATED', label: 'Dedicado' }]}
            />
            <Select
              label="Flota"
              value={trip.fleetType}
              onChange={(e) => setTrip({ ...trip, fleetType: e.target.value as FleetType })}
              options={[{ value: 'OWN', label: 'Propia' }, { value: 'OUTSOURCED', label: 'Tercerizada' }]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Tipo de vehículo" value={trip.truckTypeId} onChange={(e) => setTrip({ ...trip, truckTypeId: e.target.value })} />
            <Input label="Fecha" type="date" value={trip.quotedAt} onChange={(e) => setTrip({ ...trip, quotedAt: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {trip.fleetType === 'OUTSOURCED' && carriers.length > 0 ? (
              <Select
                label="Transportista"
                value={trip.carrierId}
                onChange={(e) => setTrip({ ...trip, carrierId: e.target.value })}
                options={[{ value: '', label: 'Elegir...' }, ...carriers.map((c) => ({ value: c.id, label: c.name }))]}
              />
            ) : (
              <Input
                label="Transportista (id libre)"
                value={trip.carrierId}
                onChange={(e) => setTrip({ ...trip, carrierId: e.target.value })}
                placeholder={trip.fleetType === 'OUTSOURCED' ? 'Requerido para outsourcing' : 'Dejá vacío para flota propia'}
              />
            )}
            <Input label="Cliente (id libre)" value={trip.customerId} onChange={(e) => setTrip({ ...trip, customerId: e.target.value })} />
          </div>

          <p className="text-xs text-slate-400">
            El motor calcula cuánto se le debe liquidar (pagar) al transportista por este viaje —
            la bifurcación nómina (flota propia) / cuentas por pagar (tercerizada) la deciden las
            reglas activas condicionadas por "Flota", no un cálculo aparte.
          </p>

          <Button className="w-full" onClick={runCalculation} disabled={zones.length === 0 || rawRules.length === 0}>
            <i className="ri-play-line mr-2"></i>
            Calcular
          </Button>
          {rawRules.length === 0 && <p className="text-xs text-amber-600">No hay reglas todavía — creá al menos una en la pestaña Reglas.</p>}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <i className="ri-file-list-3-line text-teal-600"></i>
          Resultado
        </h3>

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
            <span>{error}</span>
          </div>
        )}

        {!result && !error && <p className="text-sm text-slate-400">Completá los datos y hacé click en Calcular.</p>}

        {result && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-semibold text-slate-600">Etapa</th>
                    <th className="text-left py-2 font-semibold text-slate-600">Regla</th>
                    <th className="text-right py-2 font-semibold text-slate-600">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trace.map((line) => (
                    <tr key={line.seq} className="border-b border-slate-100">
                      <td className="py-2 text-slate-600">{STAGE_LABELS[line.stage] || line.stage}</td>
                      <td className="py-2 text-slate-800">{line.label} <span className="text-xs text-slate-400">({line.ruleCode})</span></td>
                      <td className="py-2 text-right font-medium text-slate-900">${line.final}</td>
                    </tr>
                  ))}
                  {result.trace.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center text-slate-400">Ninguna regla activa aplica.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 border-t-2 border-teal-200">
              <span className="font-bold text-slate-900">Total a liquidar al transportista</span>
              <span className="text-xl font-bold text-teal-600">${result.totalLiquidado}</span>
            </div>

            {result.discarded.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Descartadas</h4>
                <ul className="space-y-1">
                  {result.discarded.map((d, i) => (
                    <li key={i} className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="font-medium">{d.ruleCode}</span> ({d.reason}) — {d.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Avisos</h4>
                <ul className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
