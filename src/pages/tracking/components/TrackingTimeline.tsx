interface TrackingEvent {
  id: string;
  event_type: string;
  event_status: string;
  event_time: string;
  notes: string | null;
  route_number?: string;
}

interface TrackingTimelineProps {
  events: TrackingEvent[];
}

function safeFormatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function safeFormatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Fecha desconocida';
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return 'Fecha desconocida';
  }
}

export const TrackingTimeline = ({ events }: TrackingTimelineProps) => {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'route_started':
        return 'ri-play-circle-line';
      case 'stop_arrived':
        return 'ri-map-pin-line';
      case 'delivery_completed':
        return 'ri-checkbox-circle-line';
      case 'delivery_failed':
        return 'ri-close-circle-line';
      case 'route_completed':
        return 'ri-flag-line';
      case 'delay_reported':
        return 'ri-alarm-warning-line';
      default:
        return 'ri-record-circle-line';
    }
  };

  const getEventColor = (eventStatus: string) => {
    switch (eventStatus) {
      case 'success':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-amber-600 bg-amber-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      case 'info':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'route_started':
        return 'Ruta iniciada';
      case 'stop_arrived':
        return 'Llegada a parada';
      case 'delivery_completed':
        return 'Entrega completada';
      case 'delivery_failed':
        return 'Entrega fallida';
      case 'route_completed':
        return 'Ruta completada';
      case 'delay_reported':
        return 'Retraso reportado';
      default:
        return eventType;
    }
  };

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
          <i className="ri-time-line text-5xl text-gray-300"></i>
        </div>
        <p className="text-gray-500">No hay eventos de tracking registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={event.id} className="flex gap-4">
          {/* Línea de tiempo */}
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${getEventColor(
                event.event_status
              )}`}
            >
              <i className={`${getEventIcon(event.event_type)} text-lg`}></i>
            </div>
            {index < events.length - 1 && (
              <div className="w-0.5 h-full min-h-[40px] bg-gray-200 mt-2"></div>
            )}
          </div>

          {/* Contenido del evento */}
          <div className="flex-1 pb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900">
                  {getEventLabel(event.event_type)}
                </h4>
                <span className="text-xs text-gray-500">
                  {safeFormatTime(event.event_time)}
                </span>
              </div>
              
              {event.route_number && (
                <p className="text-sm text-gray-600 mb-1">
                  <i className="ri-route-line mr-1"></i>
                  Ruta: {event.route_number}
                </p>
              )}
              
              {event.notes && (
                <p className="text-sm text-gray-600 mt-2">{event.notes}</p>
              )}
              
              <p className="text-xs text-gray-400 mt-2">
                {safeFormatDate(event.event_time)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};