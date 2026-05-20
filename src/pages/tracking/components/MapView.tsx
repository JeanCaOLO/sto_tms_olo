import { useState } from 'react';
import Badge from '../../../components/base/Badge';

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

interface MapViewProps {
  selectedRoute: {
    id: string;
    route_number: string;
    route_date: string;
    status: string;
    driver_name: string;
    vehicle_plate: string;
    route_type_name: string;
  } | null;
  stops: Stop[];
  stopsLoading: boolean;
  updatingStopId?: string | null;
  onMarkStop?: (stopId: string, status: 'delivered' | 'failed' | 'pending') => void;
  onMarkStopDelivered: (stopId: string, delivered: boolean) => void;
}

function resolveStopStatus(stop: Stop): string {
  if (stop.delivery_status) return stop.delivery_status;
  const s = (stop.status || '').toLowerCase();
  if (s === 'delivered' || s === 'entregado') return 'delivered';
  if (s === 'failed' || s === 'fallido') return 'failed';
  if (s === 'in_transit' || s === 'en tránsito') return 'in_transit';
  return 'pending';
}

function getStopVariant(s: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (s) {
    case 'delivered': return 'success';
    case 'in_transit': return 'info';
    case 'failed': return 'danger';
    default: return 'default';
  }
}

function getStopLabel(s: string): string {
  switch (s) {
    case 'delivered': return 'Entregado';
    case 'in_transit': return 'En camino';
    case 'failed': return 'Fallido';
    default: return 'Pendiente';
  }
}

function getStopDotClass(s: string): string {
  switch (s) {
    case 'delivered': return 'bg-emerald-500 border-emerald-200';
    case 'failed': return 'bg-red-500 border-red-200';
    case 'in_transit': return 'bg-teal-500 border-teal-200';
    default: return 'bg-slate-300 border-slate-200';
  }
}

function getStopDotIcon(s: string): string {
  switch (s) {
    case 'delivered': return 'ri-checkbox-circle-fill';
    case 'failed': return 'ri-close-circle-fill';
    case 'in_transit': return 'ri-truck-fill';
    default: return 'ri-map-pin-2-fill';
  }
}

export const MapView = ({
  selectedRoute,
  stops,
  stopsLoading,
  updatingStopId,
  onMarkStop,
  onMarkStopDelivered,
}: MapViewProps) => {
  const [focusedStopIndex, setFocusedStopIndex] = useState(0);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);

  const focusedStop = stops[focusedStopIndex] || null;

  const mapUrl = focusedStop
    ? `https://maps.google.com/maps?q=${encodeURIComponent(
        `${focusedStop.delivery_address}, ${focusedStop.delivery_city}, Chile`
      )}&output=embed&z=15`
    : null;

  const deliveredCount = stops.filter((s) => resolveStopStatus(s) === 'delivered').length;
  const failedCount = stops.filter((s) => resolveStopStatus(s) === 'failed').length;

  const handleMark = (stopId: string, status: 'delivered' | 'failed' | 'pending') => {
    if (onMarkStop) {
      onMarkStop(stopId, status);
    } else {
      onMarkStopDelivered(stopId, status === 'delivered');
    }
    setExpandedStopId(null);
  };

  if (!selectedRoute) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 h-[620px] flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-20 h-20 flex items-center justify-center mx-auto mb-4 bg-slate-50 rounded-full">
            <i className="ri-map-2-line text-5xl text-slate-300"></i>
          </div>
          <p className="text-base font-medium text-slate-500">Selecciona una ruta</p>
          <p className="text-sm text-slate-400 mt-1">
            Haz clic en una ruta de la lista para ver sus paradas
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden h-[620px] flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">{selectedRoute.route_number}</h2>
            {selectedRoute.route_type_name && (
              <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-medium">
                {selectedRoute.route_type_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            <i className="ri-user-line mr-1"></i>{selectedRoute.driver_name}
            <span className="mx-1.5 text-slate-300">·</span>
            <i className="ri-truck-line mr-1"></i>{selectedRoute.vehicle_plate}
          </p>
        </div>
        {/* Contadores */}
        <div className="flex items-center gap-4 text-right">
          {failedCount > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600">{failedCount} fallidas</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {deliveredCount}/{stops.length} entregas
            </p>
            {stops.length > 0 && (
              <div className="w-28 bg-slate-200 rounded-full h-1.5 mt-1 ml-auto">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.round((deliveredCount / stops.length) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista de paradas */}
        <div className="w-72 border-r border-slate-100 overflow-y-auto flex-shrink-0">
          {stopsLoading ? (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line animate-spin text-teal-600 text-xl"></i>
            </div>
          ) : stops.length === 0 ? (
            <div className="text-center py-10 px-4 text-slate-400">
              <i className="ri-map-pin-line text-3xl mb-2"></i>
              <p className="text-sm">Sin paradas registradas</p>
              <p className="text-xs mt-1">Esta ruta no tiene guías de despacho</p>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              {stops.map((stop, index) => {
                const eff = resolveStopStatus(stop);
                const isUpdating = updatingStopId === stop.id;
                const isExpanded = expandedStopId === stop.id;

                return (
                  <div
                    key={stop.id}
                    className={`rounded-lg border transition-all ${
                      focusedStopIndex === index
                        ? 'border-teal-400 bg-teal-50'
                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                    } ${isUpdating ? 'opacity-60' : ''}`}
                  >
                    <div
                      className="p-3 cursor-pointer"
                      onClick={() => {
                        setFocusedStopIndex(index);
                        setExpandedStopId(isExpanded ? null : stop.id);
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Dot indicator */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 transition-colors ${getStopDotClass(eff)}`}
                          >
                            {isUpdating ? (
                              <i className="ri-loader-4-line animate-spin text-xs"></i>
                            ) : (
                              <i className={`${getStopDotIcon(eff)} text-xs`}></i>
                            )}
                          </div>
                          {index < stops.length - 1 && (
                            <div className="w-0.5 h-4 bg-slate-200"></div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-slate-700 truncate">
                              Parada {stop.sequence_number}
                            </span>
                            <Badge variant={getStopVariant(eff)} size="sm">
                              {getStopLabel(eff)}
                            </Badge>
                          </div>
                          <p className="text-xs font-medium text-slate-600 truncate">
                            {stop.customer_name}
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {stop.delivery_address}
                          </p>
                          {stop.delivery_city && (
                            <p className="text-xs text-slate-400">{stop.delivery_city}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones expandidas */}
                    {isExpanded && !isUpdating && (
                      <div className="px-3 pb-3 pt-0 border-t border-slate-100">
                        <p className="text-xs text-slate-400 mb-2 pt-2">Marcar parada como:</p>
                        <div className="flex gap-1.5">
                          {eff !== 'delivered' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMark(stop.id, 'delivered'); }}
                              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors cursor-pointer whitespace-nowrap font-medium"
                            >
                              <i className="ri-check-line"></i>
                              Entregado
                            </button>
                          )}
                          {eff !== 'failed' && eff !== 'delivered' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMark(stop.id, 'failed'); }}
                              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg border border-red-200 transition-colors cursor-pointer whitespace-nowrap font-medium"
                            >
                              <i className="ri-close-line"></i>
                              Fallido
                            </button>
                          )}
                          {eff !== 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMark(stop.id, 'pending'); }}
                              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-arrow-go-back-line"></i>
                              Revertir
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Acción rápida cuando no expandido */}
                    {!isExpanded && !isUpdating && eff === 'pending' && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMark(stop.id, 'delivered'); }}
                            className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap font-medium"
                          >
                            <i className="ri-check-line"></i>
                            Entregar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedStopId(stop.id); setFocusedStopIndex(index); }}
                            className="px-2 flex items-center justify-center text-xs py-1.5 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <i className="ri-more-line"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Google Maps */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {focusedStop && mapUrl ? (
            <>
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex-shrink-0 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-600">
                    <i className="ri-map-pin-line mr-1 text-teal-600"></i>
                    Parada {focusedStop.sequence_number}: {focusedStop.customer_name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {focusedStop.delivery_address}, {focusedStop.delivery_city}
                  </p>
                </div>
                <Badge variant={getStopVariant(resolveStopStatus(focusedStop))} size="sm">
                  {getStopLabel(resolveStopStatus(focusedStop))}
                </Badge>
              </div>
              <div className="flex-1 relative">
                <iframe
                  title={`Mapa parada ${focusedStop.sequence_number}`}
                  src={mapUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {/* Navegación entre paradas */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white rounded-full border border-slate-200 px-3 py-2">
                  <button
                    onClick={() => setFocusedStopIndex(Math.max(0, focusedStopIndex - 1))}
                    disabled={focusedStopIndex === 0}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <i className="ri-arrow-left-s-line text-slate-600"></i>
                  </button>
                  <span className="text-xs font-medium text-slate-600 px-1">
                    {focusedStopIndex + 1} / {stops.length}
                  </span>
                  <button
                    onClick={() => setFocusedStopIndex(Math.min(stops.length - 1, focusedStopIndex + 1))}
                    disabled={focusedStopIndex === stops.length - 1}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <i className="ri-arrow-right-s-line text-slate-600"></i>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400">
              <div className="text-center">
                <i className="ri-map-2-line text-4xl mb-2 text-slate-300"></i>
                <p className="text-sm">
                  {stopsLoading ? 'Cargando paradas...' : 'Selecciona una parada para ver el mapa'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapView;
