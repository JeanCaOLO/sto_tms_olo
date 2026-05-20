import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  settlement?: any;
}

export default function SettlementModal({ isOpen, onClose, onSuccess, settlement }: SettlementModalProps) {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);

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
    
    // Tarifas
    per_km_rate: 0,
    per_delivery_rate: 0,
    base_rate: 0,
    per_return_rate: 0,
    
    // Reglas
    capacity_bonus_rate: 0,
    capacity_penalty_rate: 0,
    min_guaranteed: 0,
    
    // Cálculos
    distance_amount: 0,
    delivery_amount: 0,
    base_amount: 0,
    return_amount: 0,
    bonus_amount: 0,
    penalty_amount: 0,
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
        per_km_rate: 0,
        per_delivery_rate: 0,
        base_rate: settlement.base_amount || 0,
        per_return_rate: 0,
        capacity_bonus_rate: 0,
        capacity_penalty_rate: 0,
        min_guaranteed: 0,
        distance_amount: settlement.distance_amount || 0,
        delivery_amount: settlement.delivery_amount || 0,
        base_amount: settlement.base_amount || 0,
        return_amount: settlement.return_amount || 0,
        bonus_amount: settlement.bonus_amount || 0,
        penalty_amount: settlement.penalty_amount || 0,
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
    }
  }, [formData.route_id]);

  useEffect(() => {
    if (formData.carrier_id) {
      loadCarrierRates(formData.carrier_id);
    }
  }, [formData.carrier_id]);

  useEffect(() => {
    calculateAmounts();
  }, [
    formData.total_distance,
    formData.total_deliveries,
    formData.total_returns,
    formData.per_km_rate,
    formData.per_delivery_rate,
    formData.base_rate,
    formData.per_return_rate,
    formData.capacity_bonus_rate,
    formData.capacity_penalty_rate,
    formData.min_guaranteed
  ]);

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
        .select('*, carriers(id, name), drivers(id, name)')
        .eq('id', routeId)
        .single();

      if (route) {
        // Contar entregas y devoluciones
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
      }
    } catch (error) {
      console.error('Error loading route data:', error);
    }
  };

  const loadCarrierRates = async (carrierId: string) => {
    try {
      const { data } = await supabase
        .from('rates')
        .select('*')
        .eq('carrier_id', carrierId)
        .in('status', ['active', 'Activo', 'activo'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const rate = data[0];
        setFormData(prev => ({
          ...prev,
          per_km_rate: rate.per_km_rate || 0,
          per_delivery_rate: rate.per_delivery_rate || 0,
          base_rate: rate.base_rate || 0,
          per_return_rate: rate.per_return_rate || 0
        }));
        setRates(data);
      }
    } catch (error) {
      console.error('Error loading rates:', error);
    }
  };

  const calculateAmounts = () => {
    const distanceAmount = formData.total_distance * formData.per_km_rate;
    const deliveryAmount = formData.total_deliveries * formData.per_delivery_rate;
    const baseAmount = formData.base_rate;
    const returnAmount = formData.total_returns * formData.per_return_rate;
    
    let bonusAmount = 0;
    let penaltyAmount = 0;
    
    // Calcular bonus/penalización por capacidad (ejemplo: si usó más del 90% de capacidad)
    // Esto se puede ajustar según las reglas de negocio
    
    const subtotal = distanceAmount + deliveryAmount + baseAmount + returnAmount;
    const totalWithAdjustments = subtotal + bonusAmount - penaltyAmount;
    
    // Aplicar mínimo garantizado
    const finalTotal = Math.max(totalWithAdjustments, formData.min_guaranteed);

    setFormData(prev => ({
      ...prev,
      distance_amount: distanceAmount,
      delivery_amount: deliveryAmount,
      base_amount: baseAmount,
      return_amount: returnAmount,
      bonus_amount: bonusAmount,
      penalty_amount: penaltyAmount,
      total_amount: finalTotal
    }));
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
      per_km_rate: 0,
      per_delivery_rate: 0,
      base_rate: 0,
      per_return_rate: 0,
      capacity_bonus_rate: 0,
      capacity_penalty_rate: 0,
      min_guaranteed: 0,
      distance_amount: 0,
      delivery_amount: 0,
      base_amount: 0,
      return_amount: 0,
      bonus_amount: 0,
      penalty_amount: 0,
      total_amount: 0,
      notes: ''
    });
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
      const settlementData = {
        organization_id: appUser?.organization_id,
        route_id: formData.route_id,
        carrier_id: formData.carrier_id,
        driver_id: formData.driver_id,
        settlement_date: formData.settlement_date,
        total_distance: formData.total_distance,
        total_deliveries: formData.total_deliveries,
        total_returns: formData.total_returns,
        base_amount: formData.base_amount,
        distance_amount: formData.distance_amount,
        delivery_amount: formData.delivery_amount,
        return_amount: formData.return_amount,
        bonus_amount: formData.bonus_amount,
        penalty_amount: formData.penalty_amount,
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
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">Tarifas Configuradas</h4>
                      <p className="text-xs text-blue-700">
                        Las tarifas se cargan automáticamente según el transportista seleccionado. Puede ajustarlas manualmente si es necesario.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tarifa Base por Ruta ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.base_rate}
                      onChange={(e) => setFormData({ ...formData, base_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tarifa por Kilómetro ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.per_km_rate}
                      onChange={(e) => setFormData({ ...formData, per_km_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tarifa por Entrega ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.per_delivery_rate}
                      onChange={(e) => setFormData({ ...formData, per_delivery_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descuento por Devolución ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.per_return_rate}
                      onChange={(e) => setFormData({ ...formData, per_return_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <i className="ri-calculator-line text-teal-600"></i>
                    Cálculo Automático
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm text-gray-600">Subtotal Kilómetros:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        ${formData.distance_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm text-gray-600">Subtotal Entregas:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        ${formData.delivery_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm text-gray-600">Tarifa Base Ruta:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        ${formData.base_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm text-gray-600">Ajuste Devoluciones:</span>
                      <span className="text-sm font-semibold text-red-600">
                        -${formData.return_amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Reglas */}
            {activeTab === 'reglas' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-alert-line text-amber-600 text-xl mt-0.5"></i>
                    <div>
                      <h4 className="text-sm font-semibold text-amber-900 mb-1">Reglas de Liquidación</h4>
                      <p className="text-xs text-amber-700">
                        Configure bonos, penalizaciones y mínimos garantizados según las políticas de su empresa.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <i className="ri-trophy-line text-green-600"></i>
                      Bonificaciones por Capacidad
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Tasa de Bono (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.capacity_bonus_rate}
                          onChange={(e) => setFormData({ ...formData, capacity_bonus_rate: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                          placeholder="Ej: 5 para 5%"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Bono si usa más del 90% de capacidad del vehículo
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <i className="ri-error-warning-line text-red-600"></i>
                      Penalizaciones
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Tasa de Penalización (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.capacity_penalty_rate}
                          onChange={(e) => setFormData({ ...formData, capacity_penalty_rate: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                          placeholder="Ej: 10 para 10%"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Penalización por exceso de devoluciones o incidencias
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <i className="ri-shield-check-line text-blue-600"></i>
                      Mínimo Garantizado
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Monto Mínimo ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.min_guaranteed}
                          onChange={(e) => setFormData({ ...formData, min_guaranteed: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                          placeholder="Ej: 50000"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Monto mínimo garantizado por ruta completada
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
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
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-teal-200">
                      <div className="flex items-center gap-2">
                        <i className="ri-route-line text-gray-600"></i>
                        <span className="text-sm text-gray-700">Tarifa Base Ruta</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        ${formData.base_amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-teal-200">
                      <div className="flex items-center gap-2">
                        <i className="ri-map-pin-line text-gray-600"></i>
                        <span className="text-sm text-gray-700">
                          Kilómetros ({formData.total_distance} km × ${formData.per_km_rate})
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        ${formData.distance_amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-teal-200">
                      <div className="flex items-center gap-2">
                        <i className="ri-checkbox-circle-line text-gray-600"></i>
                        <span className="text-sm text-gray-700">
                          Entregas ({formData.total_deliveries} × ${formData.per_delivery_rate})
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        ${formData.delivery_amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-teal-200">
                      <div className="flex items-center gap-2">
                        <i className="ri-arrow-go-back-line text-gray-600"></i>
                        <span className="text-sm text-gray-700">
                          Devoluciones ({formData.total_returns} × ${formData.per_return_rate})
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-red-600">
                        -${formData.return_amount.toFixed(2)}
                      </span>
                    </div>

                    {formData.bonus_amount > 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-teal-200">
                        <div className="flex items-center gap-2">
                          <i className="ri-trophy-line text-gray-600"></i>
                          <span className="text-sm text-gray-700">Bonificaciones</span>
                        </div>
                        <span className="text-sm font-semibold text-green-600">
                          +${formData.bonus_amount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {formData.penalty_amount > 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-teal-200">
                        <div className="flex items-center gap-2">
                          <i className="ri-error-warning-line text-gray-600"></i>
                          <span className="text-sm text-gray-700">Penalizaciones</span>
                        </div>
                        <span className="text-sm font-semibold text-red-600">
                          -${formData.penalty_amount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-teal-300">
                      <span className="text-lg font-bold text-gray-900">Total Liquidación</span>
                      <span className="text-2xl font-bold text-teal-600">
                        ${formData.total_amount.toFixed(2)}
                      </span>
                    </div>

                    {formData.min_guaranteed > 0 && formData.total_amount === formData.min_guaranteed && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                        <div className="flex items-center gap-2">
                          <i className="ri-shield-check-line text-blue-600"></i>
                          <span className="text-xs text-blue-700">
                            Se aplicó el mínimo garantizado de ${formData.min_guaranteed.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
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