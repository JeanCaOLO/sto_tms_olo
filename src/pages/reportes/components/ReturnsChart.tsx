interface ReturnsChartProps {
  data: { reason: string; count: number }[];
}

export function ReturnsChart({ data }: ReturnsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">No hay datos de devoluciones disponibles</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const colors = [
    'from-red-500 to-red-400',
    'from-orange-500 to-orange-400',
    'from-amber-500 to-amber-400',
    'from-yellow-500 to-yellow-400',
    'from-lime-500 to-lime-400',
    'from-emerald-500 to-emerald-400',
    'from-teal-500 to-teal-400',
    'from-cyan-500 to-cyan-400',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Gráfica de barras */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Devoluciones por Motivo
        </h3>
        <div className="space-y-3">
          {data.map((item, index) => {
            const width = (item.count / maxValue) * 100;
            const percentage = ((item.count / total) * 100).toFixed(1);

            return (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 font-medium truncate">
                    {item.reason}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 ml-2">
                    {item.count}
                  </span>
                </div>
                <div className="h-8 bg-gray-200 rounded-lg overflow-hidden relative">
                  <div
                    className={`h-full bg-gradient-to-r ${
                      colors[index % colors.length]
                    } rounded-lg transition-all duration-500 group-hover:opacity-90 flex items-center justify-end px-3`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {percentage}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resumen */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Resumen de Motivos
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          {data.map((item, index) => {
            const percentage = ((item.count / total) * 100).toFixed(1);

            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className={`w-3 h-3 rounded-full bg-gradient-to-br ${
                      colors[index % colors.length]
                    } flex-shrink-0`}
                  ></div>
                  <span className="text-sm text-gray-700 truncate">
                    {item.reason}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-900">
                    {item.count}
                  </span>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="mt-4 p-4 bg-teal-50 rounded-lg border border-teal-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-teal-900">
              Total de Devoluciones
            </span>
            <span className="text-2xl font-bold text-teal-600">{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}