import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { calculate, deriveContext } from '../../../lib/tarifas';
import { toCalculateInput } from '../../../lib/tarifas/repository';
import type { CalcResult } from '../../../lib/tarifas/types';

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
  const [routeDetails, setRouteDetails] = useState<RouteDetails | null>(null);

  const [calc, setCalc] = useState<CalcState | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState('');
  // Reglas que el motor aplicó y que el usuario dejó marcadas para que cuenten en ESTA
  // liquidación puntual (por defecto, todas las que aplicó el motor). Destildar una no cambia
  // la regla del catálogo ni su condición — solo la excluye de este cálculo.
  const [selectedRuleSeqs, setSelectedRuleSeqs] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    if (routeDetails && appUser?.organization_id) {
      runCalculation();
    } else {
      setCalc(null);
      setSelectedRuleSeqs(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDetails, formData.total_distance, formData.total_deliveries, formData.settlement_date, appUser?.organization_id]);

  // El total y el desglose por etapa que ve el usuario (y el que se persiste al guardar) se
  // recalculan a partir de las líneas que quedaron marcadas, no del total crudo del motor.
  useEffect(() => {
    if (!calc) return;
    const total = calc.result.trace
      .filter((line) => selectedRuleSeqs.has(line.seq))
      .reduce((sum, line) => sum + Number(line.final), 0);
    setFormData((prev) => ({ ...prev, total_amount: Number(total.toFixed(2)) }));
  }, [calc, selectedRuleSeqs]);

  const toggleRuleSeq = (seq: number) => {
    setSelectedRuleSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
  };

  const loadData = async () => {
    try {
      const [routesRes, carriersRes, driversRes] = await Promise.all([
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
          .order('full_name')
      ]);

      if (routesRes.data) setRoutes(routesRes.data);
      if (carriersRes.data) setCarriers(carriersRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
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

      const { input, warning: countryWarning } = await toCalculateInput({
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

      const derived = deriveContext(input);
      const result = calculate(input);
      // El aviso de país de resguardo (ver repository.ts::resolveLiquidadorCountry) se muestra
      // igual que cualquier otro aviso del motor, en la pestaña "Reglas".
      if (countryWarning) result.warnings = [countryWarning, ...result.warnings];

      setCalc({ result, originZoneId: derived.originZoneId, destZoneId: derived.destZoneId });
      setSelectedRuleSeqs(new Set(result.trace.map((line) => line.seq)));
    } catch (error: any) {
      console.error('Error calculando tarifa:', error);
      setCalcError(error?.message || 'No se pudo calcular la tarifa con las reglas configuradas para este país.');
      setCalc(null);
      setSelectedRuleSeqs(new Set());
    } finally {
      setCalcLoading(false);
    }
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
    setCalc(null);
    setSelectedRuleSeqs(new Set());
    setCalcError('');
    setActiveTab('general');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.route_id || !formData.carrier_id || !formData.driver_id) {
      alert('Por favor complete todos los campos obligatorios');
      return;
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

      if (settlement) {
        const { error } = await supabase
          .from('settlements')
          .update(settlementData)
          .eq('id', settlement.id);

        if (error) throw error;
      } else {
        // Generar número de liquidación
        const { data: lastSettlement } = await supabase
          .from('settlements')
          .select('settlement_number')
          .eq('organization_id', appUser?.organization_id)
          .order('created_at', { ascending: false })
          .limit(1);

        let settlementNumber = 'LIQ-0001';
        if (lastSettlement && lastSettlement.length > 0) {
          const lastNumber = parseInt(lastSettlement[0].settlement_number.split('-')[1]);
          settlementNumber = `LIQ-${String(lastNumber + 1).padStart(4, '0')}`;
        }

        const { error } = await supabase
          .from('settlements')
          .insert({
            ...settlementData,
            settlement_number: settlementNumber,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
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
                    <i className="ri-route-line text-teal-600"></i>
                    Datos de la Ruta
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Distancia Total (km)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.total_distance}
                        onChange={(e) => setFormData({ ...formData, total_distance: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Total Entregas
                      </label>
                      <input
                        type="number"
                        value={formData.total_deliveries}
                        onChange={(e) => setFormData({ ...formData, total_deliveries: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>
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
                        </tr>
                      </thead>
                      <tbody>
                        {calc.result.trace.map((line) => {
                          const included = selectedRuleSeqs.has(line.seq);
                          return (
                            <tr key={line.seq} className="border-t border-gray-200">
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
                              </td>
                              <td className={`py-2 px-3 text-right font-medium ${included ? 'text-gray-900' : 'text-gray-300 line-through'}`}>${line.final}</td>
                            </tr>
                          );
                        })}
                        {calc.result.trace.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-4 px-3 text-center text-gray-400">
                              Ninguna regla activa aplica a esta ruta.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {calc.result.trace.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-teal-200 bg-white">
                            <td colSpan={3} className="py-2 px-3 text-right font-bold text-gray-900">
                              Total a liquidar al transportista (seleccionadas)
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-teal-600">${formData.total_amount.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
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
                            return (
                              <li key={line.seq} className="text-sm flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
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
    </div>
  );
}
