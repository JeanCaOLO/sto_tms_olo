interface OrdersChartProps {
  data: { label: string; value: number }[];
}

export function OrdersChart({ data }: OrdersChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        Pedidos por Día
      </h3>
      <div className="flex items-end justify-between gap-2 h-80 px-4 py-6 bg-gray-50 rounded-lg">
        {data.map((item, index) => {
          const height = (item.value / maxValue) * 100;
          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center gap-2 group"
            >
              <div className="relative w-full flex items-end justify-center h-64">
                <div
                  className="w-full bg-gradient-to-t from-teal-500 to-teal-400 rounded-t-lg transition-all duration-300 hover:from-teal-600 hover:to-teal-500 cursor-pointer relative"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {item.value} pedidos
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
    </div>
  );
}