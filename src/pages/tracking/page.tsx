import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import StatCard from '../../components/feature/StatCard';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import { RouteCard } from './components/RouteCard';
import { MapView } from './components/MapView';
import { TrackingTimeline } from './components/TrackingTimeline';

interface Route {
  id: string;
  route_number: string;
  route_date: string;
  status: string;
  total_stops: number;
  completed_stops: number;
  total_weight: number;
  total_volume: number;
  capacity_percentage: number | null;
  route_type_id: string | null;
  route_type_name: string | null;
  driver: { full_name: string } | null;
  vehicle: { plate: string } | null;
  carrier: { name: string } | null;
}

interface Stop {
  id: string;
  guide_number: string;
  sequence_number: number;
  delivery_status: string | null;
  status: string;
  customer_name: string;
  order_number: string;
  delivery_address: string;
  delivery_city: string;
}

interface TrackingEvent {
  id: string;
  route_id: string | null;
  event_type: string;
  event_status: string;
  event_time: string;
  notes: string | null;
  route: { route_number: string } | null;
}

interface RutaTipo {
  id: string;
  name: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  icon: string;
}

// ─── Toast Component ─────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div className="fixed top-5 right-5 z-50 space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium pointer-events-auto
            shadow-lg transition-all duration-300 animate-fade-in min-w-[280px]
            ${t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : ''}
            ${t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : ''}
            ${t.type === 'info' ? 'bg-teal-50 border-teal-200 text-teal-800' : ''}
            ${t.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : ''}
          `}
        >
          <i className={`${t.icon} text-base flex-shrink-0`}></i>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            className="ml-2 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Auto-complete modal ─────────────────────────────────────────
function CompleteRouteModal({
  routeNumber,
  onConfirm,
  onCancel,
}: {
  routeNumber: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-emerald-100 rounded-full">
          <i className="ri-checkbox-circle-line text-4xl text-emerald-600"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">¡Todas las paradas entregadas!</h3>
        <p className="text-sm text-slate-500 mb-6">
          La ruta <span className="font-semibold text-slate-700">{routeNumber}</span> tiene todas sus
          entregas completadas. ¿Deseas marcarla como <strong>Completada</strong>?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Después
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            Completar ruta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────
export default function TrackingPage() {
  const { appUser, loading: authLoading } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [rutas, setRutas] = useState<RutaTipo[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRouteStops, setSelectedRouteStops] = useState<Stop[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rutaTypeFilter, setRutaTypeFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [updatingStopId, setUpdatingStopId] = useState<string | null>(null);

  // ─── Toast helpers ───────────────────────────────────────────
  const addToast = useCallback((message: string, type: Toast['type'], icon: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Stats ───────────────────────────────────────────────────
  const stats = {
    activeRoutes: routes.filter((r) =>
      ['active', 'En tránsito', 'in_progress'].includes(r.status)
    ).length,
    planificadas: routes.filter((r) =>
      ['Planificada', 'planned'].includes(r.status)
    ).length,
    inTransit: routes.filter((r) =>
      ['active', 'En tránsito', 'in_progress'].includes(r.status)
    ).length,
    completedToday: routes.filter((r) =>
      ['Completada', 'completed'].includes(r.status) &&
      r.route_date === new Date().toISOString().split('T')[0]
    ).length,
  };

  // ─── Fetch routes ────────────────────────────────────────────
  const fetchRoutes = useCallback(async () => {
    if (!appUser?.organization_id) return;
    try {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await supabase
        .from('routes')
        .select(`
          *,
          driver:drivers(full_name),
          vehicle:vehicles(plate),
          carrier:carriers(name),
          route_type:route_types(name)
        `)
        .eq('organization_id', appUser.organization_id)
        .order('created_at', { ascending: false });

      if (error) {
        setFetchError(error.message);
        return;
      }

      const mapped: Route[] = (data || []).map((r: any) => ({
        ...r,
        route_type_name: r.route_type?.name ?? null,
      }));
      setRoutes(mapped);
    } catch (err: any) {
      setFetchError(err?.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [appUser?.organization_id]);

  const fetchRutas = useCallback(async () => {
    if (!appUser?.organization_id) return;
    const { data } = await supabase.from('route_types').select('id, name').eq('status', 'active').order('name');
    setRutas(data || []);
  }, [appUser?.organization_id]);

  const fetchTrackingEvents = useCallback(async () => {
    if (!appUser?.organization_id) return;
    try {
      const { data, error } = await supabase
        .from('tracking_events')
        .select('*, route:routes(route_number)')
        .eq('organization_id', appUser.organization_id)
        .order('event_time', { ascending: false })
        .limit(50);
      if (!error) setTrackingEvents((data as TrackingEvent[]) || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  }, [appUser?.organization_id]);

  const fetchStopsForRoute = useCallback(async (routeId: string) => {
    if (!appUser?.organization_id) return;
    try {
      setStopsLoading(true);
      const { data, error } = await supabase
        .from('dispatch_guides')
        .select(`
          id,
          guide_number,
          sequence_number,
          status,
          delivery_status,
          order:orders(
            order_number,
            delivery_address,
            delivery_city,
            customer:customers(name)
          )
        `)
        .eq('route_id', routeId)
        .eq('organization_id', appUser.organization_id)
        .order('sequence_number', { ascending: true });

      if (error) {
        setSelectedRouteStops([]);
        return;
      }

      const stops: Stop[] = (data || []).map((dg: any) => ({
        id: dg.id,
        guide_number: dg.guide_number,
        sequence_number: dg.sequence_number,
        status: dg.status || 'Pendiente',
        delivery_status: dg.delivery_status,
        customer_name: dg.order?.customer?.name || 'Cliente desconocido',
        order_number: dg.order?.order_number || '',
        delivery_address: dg.order?.delivery_address || 'Sin dirección',
        delivery_city: dg.order?.delivery_city || '',
      }));

      setSelectedRouteStops(stops);
    } catch (err) {
      setSelectedRouteStops([]);
    } finally {
      setStopsLoading(false);
    }
  }, [appUser?.organization_id]);

  // ─── Change route status ────────────────────────────────────
  const handleChangeRouteStatus = async (routeId: string, newStatus: string) => {
    try {
      setUpdatingStatus(true);
      const { error } = await supabase
        .from('routes')
        .update({ status: newStatus })
        .eq('id', routeId);
      if (error) throw error;

      await supabase.from('tracking_events').insert({
        route_id: routeId,
        event_type: newStatus === 'En tránsito' ? 'route_started' : 'route_completed',
        event_status: 'success',
        event_time: new Date().toISOString(),
        notes:
          newStatus === 'En tránsito'
            ? 'Ruta iniciada — conductor en camino'
            : 'Ruta completada exitosamente',
        organization_id: appUser!.organization_id,
      });

      await fetchRoutes();
      await fetchTrackingEvents();

      if (newStatus === 'En tránsito') {
        addToast('¡Ruta iniciada! El conductor está en camino.', 'success', 'ri-truck-line');
        setSelectedRouteId(routeId);
      } else if (newStatus === 'Completada') {
        addToast('Ruta marcada como completada.', 'success', 'ri-checkbox-circle-line');
        setShowCompleteModal(false);
      }
    } catch (err) {
      addToast('Error al cambiar el estado de la ruta.', 'error', 'ri-error-warning-line');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ─── Mark stop ───────────────────────────────────────────────
  const handleMarkStop = async (stopId: string, deliveryStatus: 'delivered' | 'failed' | 'pending') => {
    if (!selectedRouteId || !appUser) return;
    setUpdatingStopId(stopId);

    const statusMap: Record<string, string> = {
      delivered: 'Entregado',
      failed: 'Fallido',
      pending: 'Pendiente',
    };

    try {
      const { error } = await supabase
        .from('dispatch_guides')
        .update({ delivery_status: deliveryStatus, status: statusMap[deliveryStatus] })
        .eq('id', stopId);
      if (error) throw error;

      // Registrar tracking event
      const eventMap: Record<string, string> = {
        delivered: 'delivery_completed',
        failed: 'delivery_failed',
        pending: 'stop_arrived',
      };
      const stop = selectedRouteStops.find((s) => s.id === stopId);
      await supabase.from('tracking_events').insert({
        route_id: selectedRouteId,
        event_type: eventMap[deliveryStatus],
        event_status: deliveryStatus === 'failed' ? 'error' : deliveryStatus === 'pending' ? 'info' : 'success',
        event_time: new Date().toISOString(),
        notes:
          deliveryStatus === 'delivered'
            ? `Entrega completada — ${stop?.customer_name || 'Cliente'} (Parada ${stop?.sequence_number})`
            : deliveryStatus === 'failed'
            ? `Entrega fallida — ${stop?.customer_name || 'Cliente'} (Parada ${stop?.sequence_number})`
            : `Parada ${stop?.sequence_number} revertida a pendiente`,
        organization_id: appUser.organization_id,
      });

      const updatedStops = selectedRouteStops.map((s) =>
        s.id === stopId ? { ...s, delivery_status: deliveryStatus, status: statusMap[deliveryStatus] } : s
      );
      setSelectedRouteStops(updatedStops);

      const completedCount = updatedStops.filter((s) =>
        s.delivery_status === 'delivered'
      ).length;

      await supabase
        .from('routes')
        .update({ completed_stops: completedCount })
        .eq('id', selectedRouteId);

      setRoutes((prev) =>
        prev.map((r) =>
          r.id === selectedRouteId ? { ...r, completed_stops: completedCount } : r
        )
      );

      await fetchTrackingEvents();

      if (deliveryStatus === 'delivered') {
        addToast(`Entrega marcada como exitosa.`, 'success', 'ri-checkbox-circle-line');
        // ¿Todas entregadas? Proponer completar ruta
        const selectedRoute = routes.find((r) => r.id === selectedRouteId);
        const isInTransit =
          selectedRoute &&
          ['active', 'in_progress', 'En tránsito'].includes(selectedRoute.status);
        if (
          isInTransit &&
          completedCount === updatedStops.length &&
          updatedStops.length > 0
        ) {
          setTimeout(() => setShowCompleteModal(true), 600);
        }
      } else if (deliveryStatus === 'failed') {
        addToast(`Entrega marcada como fallida.`, 'warning', 'ri-close-circle-line');
      } else {
        addToast(`Parada revertida a pendiente.`, 'info', 'ri-arrow-go-back-line');
      }
    } catch (err) {
      addToast('Error al actualizar la parada.', 'error', 'ri-error-warning-line');
    } finally {
      setUpdatingStopId(null);
    }
  };

  // ─── Legacy shim for MapView ──────────────────────────────────
  const handleMarkStopDelivered = (stopId: string, delivered: boolean) =>
    handleMarkStop(stopId, delivered ? 'delivered' : 'pending');

  // ─── Effects ─────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && appUser) {
      fetchRoutes();
      fetchTrackingEvents();
      fetchRutas();
    }
  }, [authLoading, appUser, fetchRoutes, fetchTrackingEvents, fetchRutas]);

  useEffect(() => {
    if (selectedRouteId && appUser) {
      fetchStopsForRoute(selectedRouteId);
    } else {
      setSelectedRouteStops([]);
    }
  }, [selectedRouteId, appUser, fetchStopsForRoute]);

  // ─── Filters ─────────────────────────────────────────────────
  const filteredRoutes = routes.filter((route) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      route.route_number.toLowerCase().includes(q) ||
      (route.driver?.full_name || '').toLowerCase().includes(q) ||
      (route.vehicle?.plate || '').toLowerCase().includes(q) ||
      (route.carrier?.name || '').toLowerCase().includes(q) ||
      (route.route_type_name || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'all' ||
      route.status === statusFilter ||
      (statusFilter === 'En tránsito' &&
        ['active', 'in_progress', 'En tránsito'].includes(route.status)) ||
      (statusFilter === 'Completada' &&
        ['Completada', 'completed'].includes(route.status));

    const matchesRutaType =
      rutaTypeFilter === 'all' || route.route_type_id === rutaTypeFilter;

    return matchesSearch && matchesStatus && matchesRutaType;
  });

  const selectedRoute = selectedRouteId
    ? routes.find((r) => r.id === selectedRouteId) || null
    : null;

  const selectedRouteEvents = selectedRouteId
    ? trackingEvents.filter((e) => e.route_id === selectedRouteId)
    : trackingEvents;

  const isLoading = authLoading || loading;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {showCompleteModal && selectedRoute && (
        <CompleteRouteModal
          routeNumber={selectedRoute.route_number}
          onConfirm={() => handleChangeRouteStatus(selectedRoute.id, 'Completada')}
          onCancel={() => setShowCompleteModal(false)}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Tracking de Rutas</h1>
            <p className="text-sm text-slate-500 mt-1">
              Seguimiento en tiempo real de rutas generadas desde Planificación
            </p>
          </div>
          <button
            onClick={() => {
              fetchRoutes();
              fetchTrackingEvents();
              if (selectedRouteId) fetchStopsForRoute(selectedRouteId);
              addToast('Datos actualizados.', 'info', 'ri-refresh-line');
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Planificadas" value={stats.planificadas} icon="ri-calendar-check-line" color="teal" />
          <StatCard title="En Tránsito" value={stats.inTransit} icon="ri-truck-line" color="teal" />
          <StatCard title="Completadas Hoy" value={stats.completedToday} icon="ri-checkbox-circle-line" color="emerald" />
          <StatCard title="Total Rutas" value={routes.length} icon="ri-route-line" color="teal" />
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <i className="ri-error-warning-line text-red-500 text-lg flex-shrink-0"></i>
            <div>
              <p className="text-sm font-medium text-red-700">Error al cargar las rutas</p>
              <p className="text-xs text-red-500 mt-0.5">{fetchError}</p>
            </div>
            <button
              onClick={() => { setFetchError(null); fetchRoutes(); }}
              className="ml-auto text-xs text-red-600 hover:underline cursor-pointer whitespace-nowrap"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <Input
                placeholder="Buscar por ruta, conductor, vehículo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon="ri-search-line"
              />
            </div>
            <div className="w-44">
              <Select value={rutaTypeFilter} onChange={(e) => setRutaTypeFilter(e.target.value)}>
                <option value="all">Todas las rutas</option>
                {rutas.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos los estados</option>
                <option value="Planificada">Planificada</option>
                <option value="En tránsito">En tránsito</option>
                <option value="Completada">Completada</option>
                <option value="delayed">Con Retraso</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Panel principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de rutas */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-800">Rutas</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  {isLoading ? '...' : `${filteredRoutes.length} rutas`}
                </span>
              </div>
              <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
                    <p className="text-xs text-slate-400">Cargando rutas...</p>
                  </div>
                ) : filteredRoutes.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3">
                      <i className="ri-route-line text-4xl"></i>
                    </div>
                    <p className="text-sm">No hay rutas disponibles</p>
                    <p className="text-xs mt-1">Genera rutas desde Planificación</p>
                  </div>
                ) : (
                  filteredRoutes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={{
                        id: route.id,
                        route_number: route.route_number,
                        route_date: route.route_date,
                        driver_name: route.driver?.full_name || 'Sin conductor',
                        vehicle_plate: route.vehicle?.plate || 'Sin vehículo',
                        carrier_name: route.carrier?.name || '',
                        route_type_name: route.route_type_name || '',
                        total_stops: route.total_stops,
                        completed_stops: route.completed_stops,
                        total_weight: route.total_weight,
                        status: route.status,
                      }}
                      isSelected={selectedRouteId === route.id}
                      onClick={() =>
                        setSelectedRouteId(
                          selectedRouteId === route.id ? null : route.id
                        )
                      }
                      onChangeStatus={handleChangeRouteStatus}
                      updatingStatus={updatingStatus}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Mapa + Paradas */}
          <div className="lg:col-span-2">
            <MapView
              selectedRoute={
                selectedRoute
                  ? {
                      id: selectedRoute.id,
                      route_number: selectedRoute.route_number,
                      route_date: selectedRoute.route_date,
                      status: selectedRoute.status,
                      driver_name: selectedRoute.driver?.full_name || '',
                      vehicle_plate: selectedRoute.vehicle?.plate || '',
                      route_type_name: selectedRoute.route_type_name || '',
                    }
                  : null
              }
              stops={selectedRouteStops}
              stopsLoading={stopsLoading}
              updatingStopId={updatingStopId}
              onMarkStop={handleMarkStop}
              onMarkStopDelivered={handleMarkStopDelivered}
            />
          </div>
        </div>

        {/* Timeline de eventos */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-slate-800">
              <i className="ri-time-line mr-2 text-teal-600"></i>
              Historial de Eventos
              {selectedRoute && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  — {selectedRoute.route_number}
                </span>
              )}
            </h2>
            {selectedRoute && (
              <button
                onClick={() => setSelectedRouteId(null)}
                className="text-xs text-teal-600 hover:underline cursor-pointer whitespace-nowrap"
              >
                <i className="ri-list-check mr-1"></i>
                Ver todos los eventos
              </button>
            )}
          </div>
          <TrackingTimeline
            events={selectedRouteEvents.map((e) => ({
              ...e,
              route_number: e.route?.route_number,
            }))}
          />
        </div>
      </div>
    </>
  );
}
