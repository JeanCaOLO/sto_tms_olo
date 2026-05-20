interface Driver {
  id: string;
  name: string;
  deliveries: number;
  distance: number;
  successRate: number;
}

interface DriversRankingProps {
  drivers: Driver[];
}

export function DriversRanking({ drivers }: DriversRankingProps) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">No hay datos de conductores disponibles</p>
      </div>
    );
  }

  const maxDeliveries = Math.max(...drivers.map((d) => d.deliveries), 1);

  return (
    <div className="space-y-4">
      {drivers.map((driver, index) => {
        const deliveryWidth = (driver.deliveries / maxDeliveries) * 100;
        
        return (
          <div
            key={driver.id}
            className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-4 mb-3">
              {/* Ranking badge */}
              <div
                className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full font-bold text-sm ${
                  index === 0
                    ? 'bg-amber-100 text-amber-700'
                    : index === 1
                    ? 'bg-gray-200 text-gray-700'
                    : index === 2
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {index === 0 && <i className="ri-trophy-fill text-lg"></i>}
                {index === 1 && <i className="ri-medal-fill text-lg"></i>}
                {index === 2 && <i className="ri-medal-2-fill text-lg"></i>}
                {index > 2 && `#${index + 1}`}
              </div>

              {/* Driver info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  {driver.name}
                </h4>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-gray-500">
                    <i className="ri-truck-line mr-1"></i>
                    {driver.deliveries} entregas
                  </span>
                  <span className="text-xs text-gray-500">
                    <i className="ri-map-pin-line mr-1"></i>
                    {driver.distance} km
                  </span>
                </div>
              </div>

              {/* Success rate */}
              <div className="flex-shrink-0 text-right">
                <div className="text-lg font-bold text-teal-600">
                  {driver.successRate}%
                </div>
                <div className="text-xs text-gray-500">Tasa de éxito</div>
              </div>
            </div>

            {/* Progress bars */}
            <div className="space-y-2">
              {/* Entregas */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Entregas</span>
                  <span className="text-xs font-medium text-gray-900">
                    {driver.deliveries}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all duration-500"
                    style={{ width: `${deliveryWidth}%` }}
                  ></div>
                </div>
              </div>

              {/* Tasa de éxito */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Tasa de éxito</span>
                  <span className="text-xs font-medium text-gray-900">
                    {driver.successRate}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      driver.successRate >= 90
                        ? 'bg-gradient-to-r from-green-500 to-green-400'
                        : driver.successRate >= 70
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-red-500 to-red-400'
                    }`}
                    style={{ width: `${driver.successRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}