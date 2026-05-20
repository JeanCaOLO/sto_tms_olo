import { lazy } from 'react';
import { RouteObject } from 'react-router-dom';

const HomePage = lazy(() => import('../pages/home/page'));
const LoginPage = lazy(() => import('../pages/login/page'));
const DashboardPage = lazy(() => import('../pages/dashboard/page'));
const PedidosPage = lazy(() => import('../pages/pedidos/page'));
const RutasPage = lazy(() => import('../pages/rutas/page'));
const PlanificacionPage = lazy(() => import('../pages/planificacion/page'));
const VehiculosPage = lazy(() => import('../pages/vehiculos/page'));
const ConductoresPage = lazy(() => import('../pages/conductores/page'));
const ClientesPage = lazy(() => import('../pages/clientes/page'));
const TiendasPage = lazy(() => import('../pages/tiendas/page'));
const PaisesPage = lazy(() => import('../pages/paises/page'));
const TransportistasPage = lazy(() => import('../pages/transportistas/page'));
const LiquidacionesPage = lazy(() => import('../pages/liquidaciones/page'));
const ConfiguracionPage = lazy(() => import('../pages/configuracion/page'));
const SeedPage = lazy(() => import('../pages/seed/page'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));
const DevolucionesPage = lazy(() => import('../pages/devoluciones/page'));
const GuiasPage = lazy(() => import('../pages/guias/page'));
const ReportesPage = lazy(() => import('../pages/reportes/page'));
const ContratosPage = lazy(() => import('../pages/contratos/page'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: <DashboardPage />
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/dashboard',
    element: <DashboardPage />
  },
  {
    path: '/pedidos',
    element: <PedidosPage />
  },
  {
    path: '/rutas',
    element: <RutasPage />
  },
  {
    path: '/planificacion',
    element: <PlanificacionPage />
  },
  {
    path: '/vehiculos',
    element: <VehiculosPage />
  },
  {
    path: '/conductores',
    element: <ConductoresPage />
  },
  {
    path: '/clientes',
    element: <ClientesPage />
  },
  {
    path: '/tiendas',
    element: <TiendasPage />
  },
  {
    path: '/paises',
    element: <PaisesPage />
  },
  {
    path: '/transportistas',
    element: <TransportistasPage />
  },
  {
    path: '/liquidaciones',
    element: <LiquidacionesPage />
  },
  {
    path: '/configuracion',
    element: <ConfiguracionPage />
  },
  {
    path: '/seed',
    element: <SeedPage />
  },
  {
    path: '/devoluciones',
    element: <DevolucionesPage />
  },
  {
    path: '/guias',
    lazy: async () => {
      const Component = (await import('../pages/guias/page')).default;
      return { element: <Component /> };
    },
  },
  {
    path: '/tracking',
    lazy: async () => {
      const Component = (await import('../pages/tracking/page')).default;
      return { element: <Component /> };
    },
  },
  {
    path: '/contratos',
    element: <ContratosPage />,
  },
  {
    path: '/reportes',
    element: <ReportesPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
];

export default routes;