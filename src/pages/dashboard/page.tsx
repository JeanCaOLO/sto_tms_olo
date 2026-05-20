import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/feature/StatCard';
import Card from '../../components/base/Card';
import Badge from '../../components/base/Badge';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    activeRoutes: 0,
    deliveredToday: 0,
    pendingReturns: 0
  });
  const [recentRoutes, setRecentRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [ordersRes, routesRes, guidesRes, returnsRes, recentRoutesRes] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('routes').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
        supabase.from('dispatch_guides').select('*', { count: 'exact', head: true }).eq('delivery_status', 'delivered'),
        supabase.from('returns').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('routes')
          .select(`
            *,
            driver:drivers(full_name),
            vehicle:vehicles(plate),
            store:stores(name)
          `)
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      setStats({
        totalOrders: ordersRes.count || 0,
        activeRoutes: routesRes.count || 0,
        deliveredToday: guidesRes.count || 0,
        pendingReturns: returnsRes.count || 0
      });

      setRecentRoutes(recentRoutesRes.data || []);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; label: string }> = {
      planned: { variant: 'default', label: 'Planificada' },
      in_progress: { variant: 'info', label: 'En Progreso' },
      completed: { variant: 'success', label: 'Completada' },
      cancelled: { variant: 'danger', label: 'Cancelada' }
    };
    const config = statusMap[status] || statusMap.planned;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-4 text-slate-600">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">Resumen general del sistema de transportes</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <i className="ri-calendar-line w-4 h-4 flex items-center justify-center"></i>
          <span>{new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Pedidos"
          value={stats.totalOrders}
          icon="ri-file-list-3-line"
          color="teal"
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Rutas Activas"
          value={stats.activeRoutes}
          icon="ri-route-line"
          color="blue"
          trend={{ value: 8, isPositive: true }}
        />
        <StatCard
          title="Entregas Hoy"
          value={stats.deliveredToday}
          icon="ri-checkbox-circle-line"
          color="emerald"
          trend={{ value: 15, isPositive: true }}
        />
        <StatCard
          title="Devoluciones Pendientes"
          value={stats.pendingReturns}
          icon="ri-arrow-go-back-line"
          color="amber"
          trend={{ value: 5, isPositive: false }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Rutas Recientes</h2>
            <a href="/rutas" className="text-sm text-teal-600 hover:text-teal-700 font-medium cursor-pointer">
              Ver todas
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ruta</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Conductor</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Vehículo</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Paradas</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentRoutes.map((route) => (
                  <tr key={route.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{route.route_number}</p>
                        <p className="text-xs text-slate-500">{route.store?.name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">{route.driver?.full_name || 'Sin asignar'}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{route.vehicle?.plate || 'Sin asignar'}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {route.completed_stops}/{route.total_stops}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(route.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Rendimiento Semanal</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Entregas Completadas</span>
                <span className="text-sm font-semibold text-slate-900">87%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '87%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Eficiencia de Rutas</span>
                <span className="text-sm font-semibold text-slate-900">92%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: '92%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Satisfacción Cliente</span>
                <span className="text-sm font-semibold text-slate-900">95%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '95%' }}></div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Alertas Activas</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                <i className="ri-alert-line text-amber-600 w-4 h-4 flex items-center justify-center mt-0.5"></i>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Retraso en ruta</p>
                  <p className="text-xs text-amber-700 mt-1">RUT-2024-003 con 15 min de retraso</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                <i className="ri-error-warning-line text-red-600 w-4 h-4 flex items-center justify-center mt-0.5"></i>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Vehículo en mantenimiento</p>
                  <p className="text-xs text-red-700 mt-1">ABCD12 requiere revisión</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}