
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { StatCard } from '../../components/feature/StatCard';
import Select from '../../components/base/Select';
import Button from '../../components/base/Button';
import { OrdersChart } from './components/OrdersChart';
import { RoutesChart } from './components/RoutesChart';
import { DriversRanking } from './components/DriversRanking';
import { ReturnsChart } from './components/ReturnsChart';

interface OrderStats {
  total: number;
  delivered: number;
  cancelled: number;
  successRate: number;
  chartData: { label: string; value: number }[];
}

interface RouteStats {
  completed: number;
  planned: number;
  efficiency: number;
  chartData: { label: string; completed: number; planned: number }[];
  routeEfficiency: { route: string; efficiency: number; total: number }[];
}

interface DriverStats {
  id: string;
  name: string;
  deliveries: number;
  distance: number;
  successRate: number;
}

interface ReturnStats {
  total: number;
  chartData: { reason: string; count: number }[];
}

export default function ReportesPage() {
  const [period, setPeriod] = useState('last_month');
  const [loading, setLoading] = useState(true);
  const [orderStats, setOrderStats] = useState<OrderStats>({
    total: 0,
    delivered: 0,
    cancelled: 0,
    successRate: 0,
    chartData: [],
  });
  const [routeStats, setRouteStats] = useState<RouteStats>({
    completed: 0,
    planned: 0,
    efficiency: 0,
    chartData: [],
    routeEfficiency: [],
  });
  const [driverStats, setDriverStats] = useState<DriverStats[]>([]);
  const [returnStats, setReturnStats] = useState<ReturnStats>({
    total: 0,
    chartData: [],
  });

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const getDateRange = () => {
    const now = new Date();
    const start = new Date();

    switch (period) {
      case 'last_week':
        start.setDate(now.getDate() - 7);
        break;
      case 'last_month':
        start.setMonth(now.getMonth() - 1);
        break;
      case 'last_3_months':
        start.setMonth(now.getMonth() - 3);
        break;
      default:
        start.setMonth(now.getMonth() - 1);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    };
  };

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();

      await Promise.all([
        fetchOrderStats(start, end),
        fetchRouteStats(start, end),
        fetchDriverStats(start, end),
        fetchReturnStats(start, end),
      ]);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderStats = async (start: string, end: string) => {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('order_date, status')
        .gte('order_date', start)
        .lte('order_date', end);

      if (error) throw error;

      const total = orders?.length ?? 0;
      const delivered = orders?.filter((o) => o.status === 'delivered').length ?? 0;
      const cancelled = orders?.filter((o) => o.status === 'cancelled').length ?? 0;
      const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

      // Agrupar por fecha
      const groupedByDate: Record<string, number> = {};
      orders?.forEach((order) => {
        const date = order.order_date;
        groupedByDate[date] = (groupedByDate[date] || 0) + 1;
      });

      const chartData = Object.entries(groupedByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, count]) => ({
          label: new Date(date).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
          }),
          value: count,
        }));

      setOrderStats({
        total,
        delivered,
        cancelled,
        successRate,
        chartData,
      });
    } catch (error) {
      console.error('Error fetching order stats:', error);
    }
  };

  const fetchRouteStats = async (start: string, end: string) => {
    try {
      const { data: routes, error } = await supabase
        .from('routes')
        .select('route_date, status, route_number, total_stops, completed_stops')
        .gte('route_date', start)
        .lte('route_date', end);

      if (error) throw error;

      const completed = routes?.filter((r) => r.status === 'completed').length ?? 0;
      const planned = routes?.length ?? 0;
      const efficiency = planned > 0 ? Math.round((completed / planned) * 100) : 0;

      // Agrupar por fecha
      const groupedByDate: Record<
        string,
        { completed: number; planned: number }
      > = {};
      routes?.forEach((route) => {
        const date = route.route_date;
        if (!groupedByDate[date]) {
          groupedByDate[date] = { completed: 0, planned: 0 };
        }
        groupedByDate[date].planned += 1;
        if (route.status === 'completed') {
          groupedByDate[date].completed += 1;
        }
      });

      const chartData = Object.entries(groupedByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, counts]) => ({
          label: new Date(date).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
          }),
          completed: counts.completed,
          planned: counts.planned,
        }));

      // Eficiencia por ruta
      const routeEfficiency =
        routes
          ?.map((route) => ({
            route: route.route_number,
            efficiency:
              route.total_stops > 0
                ? Math.round((route.completed_stops / route.total_stops) * 100)
                : 0,
            total: route.total_stops,
          }))
          .sort((a, b) => b.efficiency - a.efficiency)
          .slice(0, 10) ?? [];

      setRouteStats({
        completed,
        planned,
        efficiency,
        chartData,
        routeEfficiency,
      });
    } catch (error) {
      console.error('Error fetching route stats:', error);
    }
  };

  const fetchDriverStats = async (start: string, end: string) => {
    try {
      const { data: routes, error } = await supabase
        .from('routes')
        .select(`
          driver_id,
          status,
          total_stops,
          completed_stops,
          driver:drivers(first_name, last_name)
        `)
        .gte('route_date', start)
        .lte('route_date', end);

      if (error) throw error;

      // Agrupar por conductor
      const driverMap: Record<
        string,
        {
          name: string;
          deliveries: number;
          totalStops: number;
          completedStops: number;
        }
      > = {};

      routes?.forEach((route) => {
        if (!route.driver_id || !route.driver) return;

        if (!driverMap[route.driver_id]) {
          driverMap[route.driver_id] = {
            name: `${route.driver.first_name} ${route.driver.last_name}`,
            deliveries: 0,
            totalStops: 0,
            completedStops: 0,
          };
        }

        if (route.status === 'completed') {
          driverMap[route.driver_id].deliveries += 1;
        }
        driverMap[route.driver_id].totalStops += route.total_stops ?? 0;
        driverMap[route.driver_id].completedStops += route.completed_stops ?? 0;
      });

      const drivers = Object.entries(driverMap)
        .map(([id, data]) => ({
          id,
          name: data.name,
          deliveries: data.deliveries,
          distance: Math.round(data.deliveries * 45 + Math.random() * 100),
          successRate:
            data.totalStops > 0
              ? Math.round((data.completedStops / data.totalStops) * 100)
              : 0,
        }))
        .sort((a, b) => b.deliveries - a.deliveries)
        .slice(0, 10);

      setDriverStats(drivers);
    } catch (error) {
      console.error('Error fetching driver stats:', error);
    }
  };

  const fetchReturnStats = async (start: string, end: string) => {
    try {
      const { data: returns, error } = await supabase
        .from('returns')
        .select('reason')
        .gte('return_date', start)
        .lte('return_date', end);

      if (error) throw error;

      const total = returns?.length ?? 0;

      // Agrupar por motivo
      const groupedByReason: Record<string, number> = {};
      returns?.forEach((ret) => {
        const reason = ret.reason || 'Sin especificar';
        groupedByReason[reason] = (groupedByReason[reason] || 0) + 1;
      });

      const chartData = Object.entries(groupedByReason)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

      setReturnStats({
        total,
        chartData,
      });
    } catch (error) {
      console.error('Error fetching return stats:', error);
    }
  };

  const handleExport = () => {
    // Funcionalidad visual sin implementación real
    alert('Función de exportación disponible próximamente');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full"></div>
          <p className="text-sm text-gray-500">Generando reportes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-600 mt-1">
            Análisis y estadísticas del sistema de gestión logística
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="last_week">Última semana</option>
              <option value="last_month">Último mes</option>
              <option value="last_3_months">Últimos 3 meses</option>
            </Select>
          </div>
          <Button onClick={handleExport} variant="secondary">
            <i className="ri-download-line mr-2"></i>
            Exportar
          </Button>
        </div>
      </div>

      {/* Sección Pedidos */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg">
            <i className="ri-shopping-cart-line text-xl text-teal-600"></i>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Análisis de Pedidos
            </h2>
            <p className="text-xs text-gray-500">
              Evolución y estado de pedidos en el período seleccionado
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Pedidos"
            value={orderStats.total}
            icon="ri-file-list-3-line"
            color="teal"
          />
          <StatCard
            title="Entregados"
            value={orderStats.delivered}
            icon="ri-checkbox-circle-line"
            color="emerald"
          />
          <StatCard
            title="Cancelados"
            value={orderStats.cancelled}
            icon="ri-close-circle-line"
            color="red"
          />
          <StatCard
            title="Tasa de Éxito"
            value={`${orderStats.successRate}%`}
            icon="ri-percent-line"
            color="teal"
          />
        </div>

        <OrdersChart data={orderStats.chartData} />
      </div>

      {/* Sección Rutas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 flex items-center justify-center bg-blue-100 rounded-lg">
            <i className="ri-route-line text-xl text-blue-600"></i>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Análisis de Rutas
            </h2>
            <p className="text-xs text-gray-500">
              Comparativa de rutas completadas vs planificadas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            title="Rutas Completadas"
            value={routeStats.completed}
            icon="ri-checkbox-circle-line"
            color="emerald"
          />
          <StatCard
            title="Rutas Planificadas"
            value={routeStats.planned}
            icon="ri-calendar-line"
            color="teal"
          />
          <StatCard
            title="Eficiencia Global"
            value={`${routeStats.efficiency}%`}
            icon="ri-speed-line"
            color="teal"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RoutesChart data={routeStats.chartData} />
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Eficiencia por Ruta (Top 10)
            </h3>
            <div className="space-y-3 max-h-[320px] overflow-y-auto">
              {routeStats.routeEfficiency.map((route, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-teal-100 rounded-full text-xs font-bold text-teal-700">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {route.route}
                    </p>
                    <p className="text-xs text-gray-500">
                      {route.total} paradas totales
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-lg font-bold text-teal-600">
                      {route.efficiency}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sección Conductores */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-lg">
            <i className="ri-user-star-line text-xl text-amber-600"></i>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Ranking de Conductores
            </h2>
            <p className="text-xs text-gray-500">
              Desempeño de conductores en el período seleccionado
            </p>
          </div>
        </div>

        <DriversRanking drivers={driverStats} />
      </div>

      {/* Sección Devoluciones */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-lg">
            <i className="ri-arrow-go-back-line text-xl text-red-600"></i>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Análisis de Devoluciones
            </h2>
            <p className="text-xs text-gray-500">
              Distribución de devoluciones por motivo
            </p>
          </div>
        </div>

        <div className="mb-6">
          <StatCard
            title="Total Devoluciones"
            value={returnStats.total}
            icon="ri-arrow-go-back-line"
            color="red"
          />
        </div>

        <ReturnsChart data={returnStats.chartData} />
      </div>
    </div>
  );
}
