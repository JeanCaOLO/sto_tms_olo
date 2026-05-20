interface RoutesChartProps {
  data: { label: string; completed: number; planned: number }[];
}

export function RoutesChart({ data }: RoutesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.completed, d.planned)),
    1
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        Rutas Completadas vs Planificadas
      </h3>
      <div className="relative h-80 px-4 py-6 bg-gray-50 rounded-lg">
        {/* Grid lines */}
        <div className="absolute inset-0 px-4 py-6">
          {[0, 25, 50, 75, 100].map((percent) => (
            <div
              key={percent}
              className="absolute left-4 right-4 border-t border-gray-200"
              style={{ bottom: `${6 + (percent / 100) * 64}%` }}
            >
              <span className="absolute -left-8 -top-2 text-xs text-gray-400">
                {Math.round((maxValue * percent) / 100)}
              </span>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="relative h-full flex items-end justify-between gap-3">
          {data.map((item, index) => {
            const completedHeight = (item.completed / maxValue) * 100;
            const plannedHeight = (item.planned / maxValue) * 100;

            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div className="relative w-full h-64 flex items-end justify-center gap-1">
                  {/* Línea de completadas */}
                  {index > 0 && (
                    <svg
                      className="absolute -left-1/2 bottom-0 w-full h-full pointer-events-none"
                      style={{ zIndex: 1 }}
                    >
                      <line
                        x1="100%"
                        y1={`${100 - (data[index - 1].completed / maxValue) * 100}%`}
                        x2="0%"
                        y2={`${100 - completedHeight}%`}
                        stroke="#10b981"
                        strokeWidth="2"
                      />
                    </svg>
                  )}

                  {/* Línea de planificadas */}
                  {index > 0 && (
                    <svg
                      className="absolute -left-1/2 bottom-0 w-full h-full pointer-events-none"
                      style={{ zIndex: 1 }}
                    >
                      <line
                        x1="100%"
                        y1={`${100 - (data[index - 1].planned / maxValue) * 100}%`}
                        x2="0%"
                        y2={`${100 - plannedHeight}%`}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                    </svg>
                  )}

                  {/* Punto completadas */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform group"
                    style={{ bottom: `${completedHeight}%`, zIndex: 2 }}
                  >
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      {item.completed} completadas
                    </div>
                  </div>

                  {/* Punto planificadas */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform group"
                    style={{ bottom: `${plannedHeight}%`, zIndex: 2 }}
                  >
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      {item.planned} planificadas
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500"></div>
            <span className="text-xs text-gray-600">Completadas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500 border-t-2 border-dashed"></div>
            <span className="text-xs text-gray-600">Planificadas</span>
          </div>
        </div>
      </div>
    </div>
  );
}