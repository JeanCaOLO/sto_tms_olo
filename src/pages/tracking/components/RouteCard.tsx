import Badge from '../../../components/base/Badge';

interface RouteCardProps {
  route: {
    id: string;
    route_number: string;
    route_date: string;
    driver_name: string;
    vehicle_plate: string;
    carrier_name: string;
    route_type_name: string;
    total_stops: number;
    completed_stops: number;
    total_weight: number;
    status: string;
  };
  isSelected: boolean;
  onClick: () => void;
  onChangeStatus: (routeId: string, newStatus: string) => void;
  updatingStatus: boolean;
}

function getStatusVariant(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'active':
    case 'in_progress':
    case 'En tránsito': return 'info';
    case 'Completada':
    case 'completed': return 'success';
    case 'Planificada':
    case 'planned': return 'default';
    case 'delayed':
    case 'Con Retraso': return 'danger';
    default: return 'default';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
    case 'in_progress':
    case 'En tránsito': return 'En tránsito';
    case 'Completada':
    case 'completed': return 'Completada';
    case 'Planificada':
    case 'planned': return 'Planificada';
    case 'delayed':
    case 'Con Retraso': return 'Con Retraso';
    default: return status;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'active':
    case 'in_progress':
    case 'En tránsito': return 'ri-truck-line';
    case 'Completada':
    case 'completed': return 'ri-checkbox-circle-line';
    case 'Planificada':
    case 'planned': return 'ri-calendar-check-line';
    case 'delayed':
    case 'Con Retraso': return 'ri-alarm-warning-line';
    default: return 'ri-route-line';
  }
}

function getNextStatus(current: string): { label: string; value: string; icon: string } | null {
  switch (current) {
    case 'Planificada':
    case 'planned':
      return { label: 'Iniciar', value: 'En tránsito', icon: 'ri-play-line' };
    case 'active':
    case 'in_progress':
    case 'En tránsito':
      return { label: 'Completar', value: 'Completada', icon: 'ri-check-double-line' };
    default:
      return null;
  }
}

export const RouteCard = ({ route, isSelected, onClick, onChangeStatus, updatingStatus }: RouteCardProps) => {
  const progress =
    route.total_stops > 0
      ? Math.round((route.completed_stops / route.total_stops) * 100)
      : 0;

  const formattedDate = route.route_date
    ? new Date(route.route_date + 'T00:00:00').toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

  const nextStatus = getNextStatus(route.status);

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-teal-500 bg-teal-50'
          : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">{route.route_number}</h3>
            {route.route_type_name && (
              <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">
                {route.route_type_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            <i className="ri-calendar-line mr-1"></i>
            {formattedDate}
          </p>
        </div>
        <Badge variant={getStatusVariant(route.status)} size="sm">
          <i className={`${getStatusIcon(route.status)} mr-1`}></i>
          {getStatusLabel(route.status)}
        </Badge>
      </div>

      {/* Info conductor y vehículo */}
      <div className="space-y-1 mb-3">
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <i className="ri-user-line text-slate-400"></i>
          <span className="truncate">{route.driver_name}</span>
        </p>
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <i className="ri-truck-line text-slate-400"></i>
          <span>{route.vehicle_plate}</span>
          {route.carrier_name && (
            <span className="text-slate-400 truncate">· {route.carrier_name}</span>
          )}
        </p>
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <i className="ri-weight-line text-slate-400"></i>
          <span>{route.total_weight ? `${Number(route.total_weight).toFixed(0)} kg` : '—'}</span>
        </p>
      </div>

      {/* Progreso */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Paradas</span>
          <span className="text-xs font-semibold text-slate-700">
            {route.completed_stops}/{route.total_stops}
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              progress === 100 ? 'bg-emerald-500' : progress > 0 ? 'bg-teal-500' : 'bg-slate-300'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-right text-xs text-slate-400 mt-0.5">{progress}%</p>
      </div>

      {/* Botón cambiar estado */}
      {nextStatus && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChangeStatus(route.id, nextStatus.value);
          }}
          disabled={updatingStatus}
          className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            nextStatus.value === 'En tránsito'
              ? 'bg-teal-600 text-white hover:bg-teal-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          } disabled:opacity-50`}
        >
          <i className={nextStatus.icon}></i>
          {nextStatus.label} ruta
        </button>
      )}
    </div>
  );
};

export default RouteCard;
