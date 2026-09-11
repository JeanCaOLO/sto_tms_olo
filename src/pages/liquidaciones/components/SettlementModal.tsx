import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { calculate, deriveContext } from '../../../lib/tarifas';
import { toCalculateInput } from '../../../lib/tarifas/repository';
import type { CalcResult, CalculateInput, MarginStatus, Override, Rule } from '../../../lib/tarifas/types';
import { OverrideSchema } from '../../../lib/tarifas/schemas';
import { saveSnapshot } from '../../../lib/tarifas/localData/settlementSnapshots';
import { listSimulatedCarriers } from '../../../lib/tarifas/localRulesDataSource';
import { formatPred } from '../../../lib/tarifas/format';
import Badge from '../../../components/base/Badge';
import AdhocRuleModal from './AdhocRuleModal';

const MARGIN_BADGE_VARIANT: Record<MarginStatus, 'success' | 'warning' | 'danger'> = {
  OK: 'success', WARN: 'warning', CRITICAL: 'danger', LOSS: 'danger',
};
const MARGIN_STATUS_LABEL: Record<MarginStatus, string> = {
  OK: 'OK', WARN: 'Atención', CRITICAL: 'Crítico', LOSS: 'Pérdida',
};
const APPROVAL_STATUSES = ['Aprobado', 'Pagado'];

// Todas las variables que alimentan el motor de cálculo — MISMOS campos que "Probador del motor"
// (src/pages/reglas-tarifa/components/RuleTester.tsx) — se editan acá, no se derivan de datos
// reales del TMS (carrier_id/vehicle_type de la ruta real). Mientras el módulo de tarifas sea un
// mockup sin acceso a la base de datos real, el cálculo debe usar exclusivamente lo que existe
// DENTRO del módulo (zonas/reglas/transportistas de prueba/tipos de vehículo libres) — igual que
// el Probador — para que siempre se pueda configurar una tarifa de costo que matchee. Los campos
// reales (Ruta/Transportista/Conductor) siguen sirviendo solo para saber a quién pagarle.
const DEFAULT_TRIP_DETAILS = {
  km: 0,
  clientCount: 0,
  packageCount: 0,
  weightKg: 0,
  durationHours: 0,
  tollsAmount: '0',
  lateMinutes: 0,
  incidentCount: 0,
  serviceType: 'STANDARD' as 'STANDARD' | 'EXPRESS' | 'DEDICATED',
  fleetType: 'OWN' as 'OWN' | 'OUTSOURCED',
  truckTypeId: '',
  carrierId: '', // transportista de PRUEBA usado solo para el cálculo cuando fleetType=OUTSOURCED
  customerId: '', // id libre, igual que en el Probador — no viene de la tabla real `customers`
  originZoneId: '',
  destZoneId: '',
};
type TripDetails = typeof DEFAULT_TRIP_DETAILS;

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  settlement?: any;
}

interface RouteDetails {
  id: string;
  route_type_id: string | null;
  store_id: string | null;
  vehicle_id: string | null;
  carrier_id: string | null;
  driver_id: string | null;
  total_weight: number | null;
  total_stops: number | null;
}

interface CalcState {
  result: CalcResult;
  originZoneId: string;
  destZoneId: string;
}

const STAGE_LABELS: Record<string, string> = {
  BASE: 'Base', VARIABLE: 'Variable', MODIFIER: 'Modificador',
  SURCHARGE: 'Recargo', ADJUSTMENT: 'Ajuste', TAX: 'Impuesto',
};

export default function SettlementModal({ isOpen, onClose, onSuccess, settlement }: SettlementModalProps) {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  // Transportistas de PRUEBA del módulo de tarifas (mismos que "Probador del motor") — usados
  // únicamente para alimentar el cálculo cuando fleetType=OUTSOURCED, nunca los transportistas
  // reales del TMS.
  const [simulatedCarriers, setSimulatedCarriers] = useState<any[]>([]);
  const [routeDetails, setRouteDetails] = useState<RouteDetails | null>(null);
  // Variables de tarifación editables por el usuario — ver DEFAULT_TRIP_DETAILS. Se consumen SOLO
  // datos que viven DENTRO del módulo de tarifas (zonas/transportistas de prueba/tipos de vehículo
  // libres), igual que "Probador del motor".
  const [tripDetails, setTripDetails] = useState<TripDetails>(DEFAULT_TRIP_DETAILS);

  const [calc, setCalc] = useState<CalcState | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState('');
  // Reglas que el motor aplicó y que el usuario dejó marcadas para que cuenten en ESTA
  // liquidación puntual (por defecto, todas las que aplicó el motor). Destildar una no cambia
  // la regla del catálogo ni su condición — solo la excluye de este cálculo.
  const [selectedRuleSeqs, setSelectedRuleSeqs] = useState<Set<number>>(new Set());
  // Motivo obligatorio cuando el margen (liquidado vs. costo operativo) cae por debajo del umbral
  // "exige motivo" de la política del país — nunca se aprueba/paga en silencio en esa zona.
  const [marginReason, setMarginReason] = useState('');

  // `baseInput`/`countryWarning`: lo que se arma UNA VEZ por ruta (datos reales de Supabase +
  // catálogo de reglas). `overrides`/`adhocRules` se editan localmente y solo cambian cómo se
  // RECALCULA ese mismo `baseInput` — nunca se persisten en el catálogo ni en la ruta.
  const [baseInput, setBaseInput] = useState<CalculateInput | null>(null);
  const [countryWarning, setCountryWarning] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [adhocRules, setAdhocRules] = useState<Rule[]>([]);
  const [editingRuleCode, setEditingRuleCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ value: '', reason: '' });
  const [editError, setEditError] = useState('');
  const [showAdhocModal, setShowAdhocModal] = useState(false);

  const [formData, setFormData] = useState({
    route_id: '',
    carrier_id: '',
    driver_id: '',
    settlement_date: new Date().toISOString().split('T')[0],
    status: 'Borrador',

    // Datos de la ruta
    total_distance: 0,
    total_deliveries: 0,
    total_returns: 0,

    // Total calculado por el motor de reglas
    total_amount: 0,

    notes: ''
  });

  useEffect(() => {
    if (isOpen && appUser?.organization_id) {
      loadData();
    }
  }, [isOpen, appUser]);

  useEffect(() => {
    if (settlement) {
      setFormData({
        route_id: settlement.route_id || '',
        carrier_id: settlement.carrier_id || '',
        driver_id: settlement.driver_id || '',
        settlement_date: settlement.settlement_date || new Date().toISOString().split('T')[0],
        status: settlement.status || 'Borrador',
        total_distance: settlement.total_distance || 0,
        total_deliveries: settlement.total_deliveries || 0,
        total_returns: settlement.total_returns || 0,
        total_amount: settlement.total_amount || 0,
        notes: settlement.notes || ''
      });
    } else {
      resetForm();
    }
  }, [settlement]);

  useEffect(() => {
    if (formData.route_id) {
      loadRouteData(formData.route_id);
    } else {
      setRouteDetails(null);
    }
  }, [formData.route_id]);

  // Autocompleta lo que ya se conoce de la ruta real (conveniencia), pero queda 100% editable — el
  // resto de las variables del motor arrancan en los valores por defecto del Probador. Se calcula
  // con una función (no un valor de estado) para que `runCalculation` pueda usar el mismo valor de
  // arranque sin depender de un `setTripDetails` asíncrono todavía no aplicado.
  const buildAutoTripDetails = (): TripDetails => ({
    ...DEFAULT_TRIP_DETAILS,
    km: formData.total_distance || 0,
    clientCount: routeDetails?.total_stops || 0,
    packageCount: formData.total_deliveries || 0,
    weightKg: routeDetails?.total_weight || 0,
  });

  useEffect(() => {
    setOverrides({});
    setAdhocRules([]);
    setTripDetails(buildAutoTripDetails());
    if (routeDetails && appUser?.organization_id) {
      runCalculation();
    } else {
      setBaseInput(null);
      setCountryWarning(null);
      setCalc(null);
      setSelectedRuleSeqs(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDetails, formData.total_distance, formData.total_deliveries, formData.settlement_date, appUser?.organization_id]);

  // Overrides no cambian qué reglas aplican (mismo `baseInput`, mismos seq) — se preserva la
  // selección de líneas del usuario. Agregar/quitar una regla ad-hoc, o cambiar una variable de
  // tarifación (zona/servicio/cliente/duración/peajes/atraso/incidentes), SÍ puede cambiar el
  // conjunto de líneas resultantes (otras condiciones empiezan/dejan de cumplirse), así que ahí se
  // recalcula la selección completa (todas incluidas).
  useEffect(() => {
    if (!baseInput) return;
    recompute(baseInput, countryWarning, overrides, adhocRules, tripDetails, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides]);

  useEffect(() => {
    if (!baseInput) return;
    recompute(baseInput, countryWarning, overrides, adhocRules, tripDetails, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adhocRules]);

  useEffect(() => {
    if (!baseInput) return;
    recompute(baseInput, countryWarning, overrides, adhocRules, tripDetails, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripDetails]);

  // Zonas del país ya resuelto para esta ruta (ver repository.ts::resolveLiquidadorCountry) — la
  // única fuente para "Zona origen"/"Zona destino" es lo configurado en Tarifas → Reglas de Tarifa,
  // nunca un dato inventado.
  const availableZones = baseInput
    ? baseInput.zones.filter((z) => z.countryId === baseInput.country.id)
    : [];

  // El total y el desglose por etapa que ve el usuario (y el que se persiste al guardar) se
  // recalculan a partir de las líneas que quedaron marcadas, no del total crudo del motor.
  useEffect(() => {
    if (!calc) return;
    const total = calc.result.trace
      .filter((line) => selectedRuleSeqs.has(line.seq))
      .reduce((sum, line) => sum + Number(line.final), 0);
    setFormData((prev) => ({ ...prev, total_amount: Number(total.toFixed(2)) }));
  }, [calc, selectedRuleSeqs]);

  // Condición en texto claro de una regla aplicada (ej. "Zona de origen = CCS Y Zona de destino =
  // CAR"), buscando la Rule original (catálogo o ad-hoc) por su código — para que "Reglas" muestre
  // POR QUÉ aplicó, no solo el código, igual que el panel Explicar del prototipo.
  const getRuleConditionText = (ruleCode: string): string | null => {
    const rule = [...(baseInput?.rules ?? []), ...adhocRules].find((r) => r.code === ruleCode);
    return rule ? formatPred(rule.conditions) : null;
  };

  const toggleRuleSeq = (seq: number) => {
    setSelectedRuleSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
  };

  const loadData = async () => {
    try {
      const [routesRes, carriersRes, driversRes, simulatedCarriersRes] = await Promise.all([
        supabase
          .from('routes')
          .select('*, stores(name), drivers(full_name), vehicles(plate), carriers(name)')
          .eq('organization_id', appUser?.organization_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('carriers')
          .select('*')
          .eq('organization_id', appUser?.organization_id)
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('drivers')
          .select('id, full_name, document, status')
          .eq('organization_id', appUser?.organization_id)
          .eq('status', 'active')
          .order('full_name'),
        listSimulatedCarriers(appUser?.organization_id || ''),
      ]);

      if (routesRes.data) setRoutes(routesRes.data);
      if (carriersRes.data) setCarriers(carriersRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
      setSimulatedCarriers(simulatedCarriersRes);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadRouteData = async (routeId: string) => {
    try {
      const { data: route } = await supabase
        .from('routes')
        .select('*, carriers(id, name), drivers(id, full_name)')
        .eq('id', routeId)
        .single();

      if (route) {
        const { data: guides } = await supabase
          .from('dispatch_guides')
          .select('status')
          .eq('route_id', routeId);

        const deliveries = guides?.filter(g => g.status === 'Entregado').length || 0;

        const { data: returns } = await supabase
          .from('returns')
          .select('id')
          .eq('route_id', routeId);

        setFormData(prev => ({
          ...prev,
          carrier_id: route.carrier_id || '',
          driver_id: route.driver_id || '',
          total_distance: route.total_distance || 0,
          total_deliveries: deliveries,
          total_returns: returns?.length || 0
        }));

        setRouteDetails({
          id: route.id,
          route_type_id: route.route_type_id ?? null,
          store_id: route.store_id ?? null,
          vehicle_id: route.vehicle_id ?? null,
          carrier_id: route.carrier_id ?? null,
          driver_id: route.driver_id ?? null,
          total_weight: route.total_weight ?? null,
          total_stops: route.total_stops ?? null,
        });
      }
    } catch (error) {
      console.error('Error loading route data:', error);
    }
  };

  const runCalculation = async () => {
    if (!routeDetails || !appUser?.organization_id) return;
    setCalcLoading(true);
    setCalcError('');
    try {
      // `stores`/`route_types` del TMS real todavía no tienen columna `zone_id` (ver
      // src/lib/tarifas/repository.ts) — no se selecciona ni se pide acá; se completa como `null`
      // al armar el store/routeType sintético para el motor.
      const [storeRes, routeTypeRes, vehicleRes] = await Promise.all([
        routeDetails.store_id
          ? supabase.from('stores').select('id, country_id').eq('id', routeDetails.store_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        routeDetails.route_type_id
          ? supabase.from('route_types').select('id').eq('id', routeDetails.route_type_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        routeDetails.vehicle_id
          ? supabase.from('vehicles').select('vehicle_type').eq('id', routeDetails.vehicle_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const store = storeRes.data;
      if (!store) {
        throw new Error('La ruta seleccionada no tiene un punto de origen configurado. Asignalo en Rutas antes de liquidar.');
      }

      const { input, warning } = await toCalculateInput({
        countryId: store.country_id,
        route: {
          id: routeDetails.id,
          route_type_id: routeDetails.route_type_id,
          store_id: routeDetails.store_id,
          carrier_id: routeDetails.carrier_id,
          driver_id: routeDetails.driver_id,
          total_distance: formData.total_distance,
          total_weight: routeDetails.total_weight,
          total_stops: routeDetails.total_stops,
        },
        vehicleType: vehicleRes.data?.vehicle_type ?? null,
        settlement: { total_deliveries: formData.total_deliveries, settlement_date: formData.settlement_date },
        stores: [{ ...store, zone_id: null }],
        routeTypes: routeTypeRes.data ? [{ ...routeTypeRes.data, zone_id: null }] : [],
      });

      setBaseInput(input);
      setCountryWarning(warning);
      recompute(input, warning, {}, [], buildAutoTripDetails(), true);
    } catch (error: any) {
      console.error('Error calculando tarifa:', error);
      setCalcError(error?.message || 'No se pudo calcular la tarifa con las reglas configuradas para este país.');
      setBaseInput(null);
      setCountryWarning(null);
      setCalc(null);
      setSelectedRuleSeqs(new Set());
    } finally {
      setCalcLoading(false);
    }
  };

  // Único punto que llama a calculate(): siempre re-arma el input con los overrides/reglas ad-hoc
  // vigentes sobre el mismo `baseInput` ya resuelto (rutas/reglas/zonas/costos no se vuelven a
  // pedir a Supabase por cada edición). `resetSelection` decide si la selección de líneas
  // (checkboxes de "Reglas") vuelve a "todas incluidas" — ver comentario del efecto que la llama.
  const recompute = (
    input: CalculateInput,
    warning: string | null,
    overridesArg: Record<string, Override>,
    adhocRulesArg: Rule[],
    tripDetailsArg: TripDetails,
    resetSelection: boolean,
  ) => {
    try {
      // Todas las variables del motor vienen de `tripDetailsArg` — mismos campos que "Probador del
      // motor", nada derivado de datos reales del TMS (carrier_id/vehicle_type de la ruta real).
      // Zona vacía = se sigue usando la location por defecto de la ruta (zona catch-all).
      const trip = {
        ...input.trip,
        km: Number(tripDetailsArg.km) || 0,
        clientCount: Number(tripDetailsArg.clientCount) || 0,
        packageCount: Number(tripDetailsArg.packageCount) || 0,
        weightKg: Number(tripDetailsArg.weightKg) || 0,
        originLocationId: tripDetailsArg.originZoneId || input.trip.originLocationId,
        destLocationId: tripDetailsArg.destZoneId || input.trip.destLocationId,
        serviceType: tripDetailsArg.serviceType,
        fleetType: tripDetailsArg.fleetType,
        carrierId: tripDetailsArg.fleetType === 'OUTSOURCED' ? (tripDetailsArg.carrierId || null) : null,
        truckTypeId: tripDetailsArg.truckTypeId,
        customerId: tripDetailsArg.customerId || null,
        durationHours: Number(tripDetailsArg.durationHours) || 0,
        tollsAmount: tripDetailsArg.tollsAmount || '0',
        lateMinutes: Number(tripDetailsArg.lateMinutes) || 0,
        incidentCount: Number(tripDetailsArg.incidentCount) || 0,
      };
      const fullInput: CalculateInput = { ...input, trip, overrides: overridesArg, adhocRules: adhocRulesArg };
      const derived = deriveContext(fullInput);
      const result = calculate(fullInput);
      // El aviso de país de resguardo (ver repository.ts::resolveLiquidadorCountry) se muestra
      // igual que cualquier otro aviso del motor, en la pestaña "Reglas".
      if (warning) result.warnings = [warning, ...result.warnings];

      setCalc({ result, originZoneId: derived.originZoneId, destZoneId: derived.destZoneId });
      setCalcError('');
      if (resetSelection) {
        setSelectedRuleSeqs(new Set(result.trace.map((line) => line.seq)));
      }
    } catch (error: any) {
      console.error('Error calculando tarifa:', error);
      setCalcError(error?.message || 'No se pudo calcular la tarifa con las reglas configuradas para este país.');
      setCalc(null);
      setSelectedRuleSeqs(new Set());
    }
  };

  const startEditOverride = (ruleCode: string, currentComputed: string, existing?: Override) => {
    setEditingRuleCode(ruleCode);
    setEditDraft({ value: existing?.value ?? currentComputed, reason: existing?.reason ?? '' });
    setEditError('');
  };

  const cancelEditOverride = () => {
    setEditingRuleCode(null);
    setEditError('');
  };

  const applyOverride = (ruleCode: string) => {
    const candidate = { value: editDraft.value.trim(), reason: editDraft.reason.trim() };
    const validation = OverrideSchema.safeParse(candidate);
    if (!validation.success) {
      setEditError(validation.error.issues[0]?.message || 'Override inválido.');
      return;
    }
    setOverrides((prev) => ({ ...prev, [ruleCode]: candidate }));
    setEditingRuleCode(null);
    setEditError('');
  };

  const removeOverride = (ruleCode: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[ruleCode];
      return next;
    });
  };

  const addAdhocRule = (rule: Rule) => {
    setAdhocRules((prev) => [...prev, rule]);
  };

  const removeAdhocRule = (code: string) => {
    setAdhocRules((prev) => prev.filter((r) => r.code !== code));
    removeOverride(code);
  };

  const resetForm = () => {
    setFormData({
      route_id: '',
      carrier_id: '',
      driver_id: '',
      settlement_date: new Date().toISOString().split('T')[0],
      status: 'Borrador',
      total_distance: 0,
      total_deliveries: 0,
      total_returns: 0,
      total_amount: 0,
      notes: ''
    });
    setRouteDetails(null);
    setBaseInput(null);
    setCountryWarning(null);
    setCalc(null);
    setSelectedRuleSeqs(new Set());
    setOverrides({});
    setAdhocRules([]);
    setTripDetails(DEFAULT_TRIP_DETAILS);
    setEditingRuleCode(null);
    setCalcError('');
    setMarginReason('');
    setActiveTab('general');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.route_id || !formData.carrier_id || !formData.driver_id) {
      alert('Por favor complete todos los campos obligatorios');
      return;
    }

    // El margen (liquidado vs. costo operativo) puede bloquear o condicionar el paso a un estado
    // aprobatorio — nunca se aprueba/paga en silencio una liquidación en pérdida o de bajo margen.
    if (calc && APPROVAL_STATUSES.includes(formData.status)) {
      if (calc.result.margin.action === 'BLOCK') {
        alert(
          'No se puede aprobar/pagar esta liquidación: el margen da pérdida y la política de este ' +
          'país bloquea la aprobación en esos casos. Ajustá la liquidación o cambiá el estado a Borrador/En Revisión.',
        );
        return;
      }
      if (calc.result.margin.action === 'REQUIRE_REASON' && !marginReason.trim()) {
        alert(
          'El margen de esta liquidación está por debajo del umbral aceptable — completá el motivo ' +
          'en la pestaña Resumen antes de aprobar/pagar.',
        );
        setActiveTab('resumen');
        return;
      }
    }

    setLoading(true);

    try {
      // La tabla `settlements` real del TMS NO tiene columnas trace/discarded/stage_subtotals/
      // fx_used/warnings/origin_zone_id/dest_zone_id (verificado en vivo: insertarlas devuelve
      // 400) — son de un modelo de snapshot que nunca se migró a la base real. Hasta que exista esa
      // migración, se persiste únicamente lo que la tabla real sí soporta: el total ya CURADO por
      // el usuario (formData.total_amount, sincronizado desde `calc`+`selectedRuleSeqs` — ver el
      // useEffect de arriba). El desglose completo (aplicadas/descartadas/avisos) queda disponible
      // en el modal mientras se arma la liquidación, pero no se guarda todavía.
      const settlementData = {
        organization_id: appUser?.organization_id,
        route_id: formData.route_id,
        carrier_id: formData.carrier_id,
        driver_id: formData.driver_id,
        settlement_date: formData.settlement_date,
        total_distance: formData.total_distance,
        total_deliveries: formData.total_deliveries,
        total_returns: formData.total_returns,
        total_amount: formData.total_amount,
        status: formData.status,
        notes: formData.notes,
        updated_at: new Date().toISOString()
      };

      let settlementId = settlement?.id;

      if (settlement) {
        const { error } = await supabase
          .from('settlements')
          .update(settlementData)
          .eq('id', settlement.id);

        if (error) throw error;
      } else {
        // Generar número de liquidación: se toma el MÁXIMO sufijo numérico entre todas las
        // liquidaciones de la organización (no solo la más reciente por created_at) — así una
        // fila con un número corrupto o fuera de orden (ej. "LIQ-0NaN") nunca hace que el
        // siguiente número calculado choque con uno ya existente (23505 duplicate key).
        const { data: allSettlements } = await supabase
          .from('settlements')
          .select('settlement_number')
          .eq('organization_id', appUser?.organization_id);

        const maxNumber = (allSettlements || []).reduce((max, s) => {
          const match = /^LIQ-(\d+)$/.exec(s.settlement_number || '');
          if (!match) return max;
          const n = parseInt(match[1], 10);
          return Number.isFinite(n) && n > max ? n : max;
        }, 0);
        const settlementNumber = `LIQ-${String(maxNumber + 1).padStart(4, '0')}`;

        const { data: inserted, error } = await supabase
          .from('settlements')
          .insert({
            ...settlementData,
            settlement_number: settlementNumber,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (error) throw error;
        settlementId = inserted?.id;
      }

      // Snapshot liviano de margen/costo (ver src/lib/tarifas/localData/settlementSnapshots.ts) —
      // la tabla real no soporta guardar esto todavía, así que vive en el almacén local del motor
      // de tarifas, para que la lista pueda mostrar el semáforo de margen. Si el cálculo falló
      // (`calc` null) no queda snapshot y la lista simplemente muestra "—" para esa fila.
      if (settlementId && calc) {
        saveSnapshot(settlementId, {
          margin_status: calc.result.margin.status,
          margin_amount: calc.result.margin.amount,
          margin_pct: calc.result.margin.pct,
          cost_total: calc.result.cost.total,
          cost_model_id: calc.result.cost.modelId,
          updated_at: new Date().toISOString(),
        });
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error saving settlement:', error);
      alert('Error al guardar la liquidación');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredStageSubtotalsDisplay: Record<string, number> = {};
  if (calc) {
    for (const line of calc.result.trace) {
      if (!selectedRuleSeqs.has(line.seq)) continue;
      filteredStageSubtotalsDisplay[line.stage] = (filteredStageSubtotalsDisplay[line.stage] ?? 0) + Number(line.final);
    }
  }

  const tabs = [
    { id: 'general', label: 'Datos Generales', icon: 'ri-file-list-3-line' },
    { id: 'tarifas', label: 'Tarifas y Cálculo', icon: 'ri-calculator-line' },
    { id: 'reglas', label: 'Reglas', icon: 'ri-settings-3-line' },
    { id: 'resumen', label: 'Resumen', icon: 'ri-money-dollar-circle-line' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-teal-50 to-cyan-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {settlement ? 'Editar Liquidación' : 'Nueva Liquidación'}
              </h2>
              <p className="text-sm text-gray-600">Complete la información de la liquidación</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <i className="ri-close-line text-xl text-gray-500"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-teal-600 border-t-2 border-teal-500'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <i className={`${tab.icon} text-lg`}></i>
                <span className="text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Tab: Datos Generales */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ruta <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.route_id}
                      onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar ruta</option>
                      {routes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {route.route_number} - {route.stores?.name} ({new Date(route.route_date).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de Liquidación <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.settlement_date}
                      onChange={(e) => setFormData({ ...formData, settlement_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Transportista <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.carrier_id}
                      onChange={(e) => setFormData({ ...formData, carrier_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar transportista</option>
                      {carriers.map((carrier) => (
                        <option key={carrier.id} value={carrier.id}>
                          {carrier.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Conductor <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.driver_id}
                      onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar conductor</option>
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.full_name} - {driver.document}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value="Borrador">Borrador</option>
                      <option value="En Revisión">En Revisión</option>
                      <option value="Aprobado">Aprobado</option>
                      <option value="Pagado">Pagado</option>
                      <option value="Rechazado">Rechazado</option>
                    </select>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <i className="ri-flask-line text-teal-600"></i>
                    Variables de Tarifación
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Mismos campos que "Probador del motor" (Tarifas → Reglas de Tarifa). Se
                    autocompletan desde la ruta elegida donde tiene sentido, pero el cálculo SIEMPRE
                    usa datos del propio módulo (zonas, transportistas de prueba, tipos de
                    vehículo) — nunca datos reales del TMS — para que siempre se pueda configurar
                    un costo que matchee.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Km</label>
                      <input
                        type="number"
                        value={tripDetails.km}
                        onChange={(e) => setTripDetails({ ...tripDetails, km: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Paradas/clientes</label>
                      <input
                        type="number"
                        value={tripDetails.clientCount}
                        onChange={(e) => setTripDetails({ ...tripDetails, clientCount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Entregas/bultos</label>
                      <input
                        type="number"
                        value={tripDetails.packageCount}
                        onChange={(e) => setTripDetails({ ...tripDetails, packageCount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Peso (kg)</label>
                      <input
                        type="number"
                        value={tripDetails.weightKg}
                        onChange={(e) => setTripDetails({ ...tripDetails, weightKg: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Duración (horas)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={tripDetails.durationHours}
                        onChange={(e) => setTripDetails({ ...tripDetails, durationHours: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Peajes</label>
                      <input
                        value={tripDetails.tollsAmount}
                        onChange={(e) => setTripDetails({ ...tripDetails, tollsAmount: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Minutos de atraso</label>
                      <input
                        type="number"
                        value={tripDetails.lateMinutes}
                        onChange={(e) => setTripDetails({ ...tripDetails, lateMinutes: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Incidentes</label>
                      <input
                        type="number"
                        value={tripDetails.incidentCount}
                        onChange={(e) => setTripDetails({ ...tripDetails, incidentCount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de servicio</label>
                      <select
                        value={tripDetails.serviceType}
                        onChange={(e) => setTripDetails({ ...tripDetails, serviceType: e.target.value as TripDetails['serviceType'] })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      >
                        <option value="STANDARD">Estándar</option>
                        <option value="EXPRESS">Express</option>
                        <option value="DEDICATED">Dedicado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Flota</label>
                      <select
                        value={tripDetails.fleetType}
                        onChange={(e) => setTripDetails({ ...tripDetails, fleetType: e.target.value as TripDetails['fleetType'] })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      >
                        <option value="OWN">Propia</option>
                        <option value="OUTSOURCED">Tercerizada</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de vehículo</label>
                      <input
                        value={tripDetails.truckTypeId}
                        onChange={(e) => setTripDetails({ ...tripDetails, truckTypeId: e.target.value })}
                        placeholder="Ej: TT-350"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    {tripDetails.fleetType === 'OUTSOURCED' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Transportista (para el cálculo)</label>
                        <select
                          value={tripDetails.carrierId}
                          onChange={(e) => setTripDetails({ ...tripDetails, carrierId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        >
                          <option value="">Elegir...</option>
                          {simulatedCarriers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cliente (id libre)</label>
                      <input
                        value={tripDetails.customerId}
                        onChange={(e) => setTripDetails({ ...tripDetails, customerId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Zona origen</label>
                      <select
                        value={tripDetails.originZoneId}
                        onChange={(e) => setTripDetails({ ...tripDetails, originZoneId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      >
                        <option value="">Sin zona (usar la de la ruta)</option>
                        {availableZones.map((z) => (
                          <option key={z.id} value={z.id}>{z.code} - {z.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Zona destino</label>
                      <select
                        value={tripDetails.destZoneId}
                        onChange={(e) => setTripDetails({ ...tripDetails, destZoneId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      >
                        <option value="">Sin zona (usar la de la ruta)</option>
                        {availableZones.map((z) => (
                          <option key={z.id} value={z.id}>{z.code} - {z.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Total Devoluciones
                    </label>
                    <input
                      type="number"
                      value={formData.total_returns}
                      onChange={(e) => setFormData({ ...formData, total_returns: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    placeholder="Observaciones adicionales..."
                  />
                </div>
              </div>
            )}

            {/* Tab: Tarifas y Cálculo */}
            {activeTab === 'tarifas' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">Cálculo automático por reglas</h4>
                      <p className="text-xs text-blue-700">
                        El monto se calcula con las reglas de tarifa activas (Tarifas → Reglas de Tarifa) según
                        país, zona, transportista y demás condiciones de esta ruta. Destildá una fila para
                        excluirla de esta liquidación puntual sin desactivar la regla en el catálogo.
                      </p>
                    </div>
                  </div>
                </div>

                {calcLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Calculando tarifa...
                  </div>
                )}

                {calcError && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
                    <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
                    <span>{calcError}</span>
                  </div>
                )}

                {!formData.route_id && !calcLoading && (
                  <p className="text-sm text-gray-500">Seleccioná una ruta en "Datos Generales" para ver el cálculo.</p>
                )}

                {calc && (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="w-10 py-2 px-3"></th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600">Etapa</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600">Regla</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600">Monto</th>
                          <th className="w-24 py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {calc.result.trace.map((line) => {
                          const included = selectedRuleSeqs.has(line.seq);
                          const isEditing = editingRuleCode === line.ruleCode;
                          const isAdhoc = adhocRules.some((r) => r.code === line.ruleCode);
                          return (
                            <Fragment key={line.seq}>
                              <tr className="border-t border-gray-200">
                                <td className="py-2 px-3">
                                  <input
                                    type="checkbox"
                                    checked={included}
                                    onChange={() => toggleRuleSeq(line.seq)}
                                    className="w-4 h-4 accent-teal-600"
                                  />
                                </td>
                                <td className={`py-2 px-3 ${included ? 'text-gray-600' : 'text-gray-300'}`}>{STAGE_LABELS[line.stage] || line.stage}</td>
                                <td className={`py-2 px-3 ${included ? 'text-gray-800' : 'text-gray-300 line-through'}`}>
                                  {line.label} <span className="text-xs text-gray-400">({line.ruleCode})</span>
                                  {isAdhoc && <span className="ml-1 text-xs text-teal-600">(ad-hoc)</span>}
                                </td>
                                <td className={`py-2 px-3 text-right font-medium ${included ? 'text-gray-900' : 'text-gray-300 line-through'}`}>
                                  {line.override ? (
                                    <span>
                                      <span className="line-through text-gray-400 mr-1">${line.computedRef}</span>
                                      ${line.final}
                                    </span>
                                  ) : (
                                    <>${line.final}</>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEditOverride(line.ruleCode, line.computedRef, line.override)}
                                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                                      title="Editar monto (override con motivo)"
                                    >
                                      <i className="ri-edit-line text-sm"></i>
                                    </button>
                                    {isAdhoc && (
                                      <button
                                        type="button"
                                        onClick={() => removeAdhocRule(line.ruleCode)}
                                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                        title="Quitar regla ad-hoc"
                                      >
                                        <i className="ri-delete-bin-line text-sm"></i>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isEditing && (
                                <tr className="bg-teal-50/50 border-t border-teal-100">
                                  <td></td>
                                  <td colSpan={4} className="py-3 px-3">
                                    <div className="flex flex-col md:flex-row gap-2 md:items-end">
                                      <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo monto</label>
                                        <input
                                          value={editDraft.value}
                                          onChange={(e) => setEditDraft({ ...editDraft, value: e.target.value })}
                                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                        />
                                      </div>
                                      <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Motivo (obligatorio)</label>
                                        <input
                                          value={editDraft.reason}
                                          onChange={(e) => setEditDraft({ ...editDraft, reason: e.target.value })}
                                          placeholder="Ej: descuento comercial autorizado"
                                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <button type="button" onClick={() => applyOverride(line.ruleCode)} className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700">Aplicar</button>
                                        <button type="button" onClick={cancelEditOverride} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                                        {line.override && (
                                          <button type="button" onClick={() => { removeOverride(line.ruleCode); cancelEditOverride(); }} className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50">Quitar override</button>
                                        )}
                                      </div>
                                    </div>
                                    {editError && <p className="text-xs text-red-600 mt-1">{editError}</p>}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                        {calc.result.trace.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-4 px-3 text-center text-gray-400">
                              Ninguna regla activa aplica a esta ruta.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {calc.result.trace.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-teal-200 bg-white">
                            <td colSpan={4} className="py-2 px-3 text-right font-bold text-gray-900">
                              Total a liquidar al transportista (seleccionadas)
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-teal-600">${formData.total_amount.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {calc && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAdhocModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg"
                    >
                      <i className="ri-add-line"></i>
                      Agregar regla ad-hoc a esta liquidación
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Reglas */}
            {activeTab === 'reglas' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-alert-line text-amber-600 text-xl mt-0.5"></i>
                    <div>
                      <h4 className="text-sm font-semibold text-amber-900 mb-1">Reglas evaluadas para esta liquidación</h4>
                      <p className="text-xs text-amber-700">
                        Las "Aplicadas" son las que el motor encontró vigentes para este viaje — elegí cuáles
                        contar en esta liquidación puntual. Para crear, editar o desactivar reglas del catálogo
                        andá a Tarifas → Reglas de Tarifa.
                      </p>
                    </div>
                  </div>
                </div>

                {calc && (
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <i className="ri-checkbox-circle-line text-green-600"></i>
                        Aplicadas — incluidas en esta liquidación ({selectedRuleSeqs.size}/{calc.result.trace.length})
                      </h4>
                      {calc.result.trace.length === 0 ? (
                        <p className="text-sm text-gray-400">Ninguna.</p>
                      ) : (
                        <ul className="space-y-1">
                          {calc.result.trace.map((line) => {
                            const included = selectedRuleSeqs.has(line.seq);
                            const conditionText = getRuleConditionText(line.ruleCode);
                            return (
                              <li key={line.seq} className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input
                                      type="checkbox"
                                      checked={included}
                                      onChange={() => toggleRuleSeq(line.seq)}
                                      className="w-4 h-4 accent-teal-600"
                                    />
                                    <span className={included ? 'text-gray-700' : 'text-gray-400 line-through'}>
                                      {line.label} <span className="text-xs text-gray-400">({line.ruleCode})</span>
                                    </span>
                                  </label>
                                  <span className={`font-medium ${included ? 'text-gray-900' : 'text-gray-400 line-through'}`}>${line.final}</span>
                                </div>
                                {conditionText && (
                                  <p className="text-xs text-gray-500 mt-1 ml-6">Aplica porque: {conditionText}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <i className="ri-close-circle-line text-gray-400"></i>
                        Descartadas ({calc.result.discarded.length})
                      </h4>
                      {calc.result.discarded.length === 0 ? (
                        <p className="text-sm text-gray-400">Ninguna.</p>
                      ) : (
                        <ul className="space-y-1">
                          {calc.result.discarded.map((d, i) => (
                            <li key={i} className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                              <span className="font-medium">{d.ruleCode}</span> — {d.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {calc.result.warnings.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Avisos</h4>
                        <ul className="space-y-1">
                          {calc.result.warnings.map((w, i) => (
                            <li key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Resumen */}
            {activeTab === 'resumen' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-6 border border-teal-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <i className="ri-money-dollar-circle-line text-teal-600 text-2xl"></i>
                    Resumen Financiero
                  </h3>

                  {calc ? (
                    <div className="space-y-3">
                      {Object.entries(filteredStageSubtotalsDisplay)
                        .filter(([, amount]) => amount !== 0)
                        .map(([stage, amount]) => (
                          <div key={stage} className="flex justify-between items-center py-2 border-b border-teal-200">
                            <span className="text-sm text-gray-700">{STAGE_LABELS[stage] || stage}</span>
                            <span className="text-sm font-semibold text-gray-900">${amount.toFixed(2)}</span>
                          </div>
                        ))}

                      <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-teal-300">
                        <span className="text-lg font-bold text-gray-900">Total a liquidar al transportista</span>
                        <span className="text-2xl font-bold text-teal-600">
                          ${formData.total_amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Seleccioná una ruta para ver el resumen del cálculo.</p>
                  )}
                </div>

                {calc && (
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <i className="ri-scales-3-line text-teal-600"></i>
                      Margen vs. costo operativo
                    </h4>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">Costo operativo estimado ({calc.result.cost.modelId})</span>
                      <span className="font-semibold text-gray-900">${calc.result.cost.total}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">Margen (liquidado − costo)</span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          ${calc.result.margin.amount} ({(Number(calc.result.margin.pct) * 100).toFixed(1)}%)
                        </span>
                        <Badge variant={MARGIN_BADGE_VARIANT[calc.result.margin.status]}>
                          {MARGIN_STATUS_LABEL[calc.result.margin.status]}
                        </Badge>
                      </span>
                    </div>
                    {calc.result.margin.action === 'BLOCK' && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mt-2">
                        <i className="ri-forbid-line mt-0.5 shrink-0"></i>
                        <span>Esta liquidación está en pérdida — no se puede aprobar/pagar mientras el cálculo se mantenga así.</span>
                      </div>
                    )}
                    {calc.result.margin.action === 'REQUIRE_REASON' && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Motivo (obligatorio para aprobar/pagar con este margen) <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={marginReason}
                          onChange={(e) => setMarginReason(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          placeholder="Ej: acuerdo comercial puntual con el transportista..."
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Detalles de la Ruta</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-teal-600">{formData.total_distance}</div>
                      <div className="text-xs text-gray-600">Kilómetros</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{formData.total_deliveries}</div>
                      <div className="text-xs text-gray-600">Entregas</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">{formData.total_returns}</div>
                      <div className="text-xs text-gray-600">Devoluciones</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? 'Guardando...' : settlement ? 'Actualizar' : 'Crear Liquidación'}
            </button>
          </div>
        </form>
      </div>

      <AdhocRuleModal
        isOpen={showAdhocModal}
        onClose={() => setShowAdhocModal(false)}
        onAdd={addAdhocRule}
        countryId={baseInput?.trip.countryId || ''}
      />
    </div>
  );
}
