import { lazy } from 'react';
import { Navigate, RouteObject } from 'react-router-dom';

const HomePage = lazy(() => import('../pages/home/page'));
const LoginPage = lazy(() => import('../pages/login/page'));
const DashboardPage = lazy(() => import('../pages/dashboard/page'));
const PedidosPage = lazy(() => import('../pages/pedidos/page'));
const ZonasPage = lazy(() => import('../pages/zonas/page'));
const LicenciasPage = lazy(() => import('../pages/licencias/page'));
const PlanificacionPage = lazy(() => import('../pages/planificacion/page'));
const VehiculosPage = lazy(() => import('../pages/vehiculos/page'));
const ConductoresPage = lazy(() => import('../pages/conductores/page'));
const ClientesPage = lazy(() => import('../pages/clientes/page'));
const TiendasPage = lazy(() => import('../pages/tiendas/page'));
const PaisesPage = lazy(() => import('../pages/paises/page'));
const TransportistasPage = lazy(() => import('../pages/transportistas/page'));
const ReglasTarifaPage = lazy(() => import('../pages/reglas-tarifa/page'));
const LiquidacionesPage = lazy(() => import('../pages/liquidaciones/page'));
const ConfiguracionPage = lazy(() => import('../pages/configuracion/page'));
const SeedPage = lazy(() => import('../pages/seed/page'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));
const DevolucionesPage = lazy(() => import('../pages/devoluciones/page'));
const GuiasPage = lazy(() => import('../pages/guias/page'));
const TrackingPage = lazy(() => import('../pages/tracking/page'));
// Contratos y Reportes están "Coming Soon": la ruta muestra el placeholder en
// vez del módulo (las páginas reales siguen en el repo para cuando se habiliten).
const ComingSoonPage = lazy(() => import('../pages/ComingSoon'));
const OmsPanelPage = lazy(() => import('../pages/oms/panel/page'));
const OmsColaPage = lazy(() => import('../pages/oms/cola/page'));
const OmsReglasPage = lazy(() => import('../pages/oms/reglas/page'));
const OmsSimuladorPage = lazy(() => import('../pages/oms/simulador/page'));
const OmsRutasDespachoPage = lazy(() => import('../pages/oms/rutas-despacho/page'));
const OmsAuditoriaPage = lazy(() => import('../pages/oms/auditoria/page'));

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
    path: '/zonas',
    element: <ZonasPage />
  },
  {
    path: '/licencias',
    element: <LicenciasPage />
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
    path: '/reglas-tarifa',
    element: <ReglasTarifaPage />
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
    element: <GuiasPage />,
  },
  {
    path: '/tracking',
    element: <TrackingPage />,
  },
  {
    path: '/contratos',
    element: <ComingSoonPage title="Contratos" />,
  },
  {
    path: '/reportes',
    element: <ComingSoonPage title="Reportes" />,
  },
  {
    path: '/oms',
    element: <Navigate to="/oms/panel" replace />,
  },
  {
    path: '/oms/panel',
    element: <OmsPanelPage />,
  },
  {
    path: '/oms/cola',
    element: <OmsColaPage />,
  },
  {
    path: '/oms/reglas',
    element: <OmsReglasPage />,
  },
  {
    path: '/oms/simulador',
    element: <OmsSimuladorPage />,
  },
  {
    path: '/oms/rutas-despacho',
    element: <OmsRutasDespachoPage />,
  },
  {
    path: '/oms/auditoria',
    element: <OmsAuditoriaPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
];

export default routes;