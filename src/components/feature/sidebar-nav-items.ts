export interface MenuItem {
  icon: string;
  label: string;
  // Clave i18n para traducir la etiqueta (label es el fallback en español).
  i18nKey: string;
  path: string;
  badge?: number;
  // Módulo aún no disponible: se muestra apagado y no navegable ("Coming Soon").
  comingSoon?: boolean;
  // Clave de módulo del backend de permisos (para ocultar el ítem sin `view`).
  permKey?: string;
}

export interface MenuGroup {
  type: 'group';
  icon: string;
  label: string;
  i18nKey: string;
  children: MenuItem[];
}

export type NavItem = MenuItem | MenuGroup;

export const navItems: NavItem[] = [
  { icon: 'ri-dashboard-line', label: 'Dashboard', i18nKey: 'menu.dashboard', path: '/dashboard', permKey: 'dashboard' },
  { icon: 'ri-file-list-line', label: 'Pedidos', i18nKey: 'menu.pedidos', path: '/pedidos', permKey: 'pedidos' },
  { icon: 'ri-arrow-go-back-line', label: 'Devoluciones', i18nKey: 'menu.devoluciones', path: '/devoluciones', permKey: 'devoluciones' },
  { icon: 'ri-file-text-line', label: 'Guías de Despacho', i18nKey: 'menu.guias', path: '/guias', permKey: 'guias' },
  { icon: 'ri-map-pin-add-line', label: 'Planificación', i18nKey: 'menu.planificacion', path: '/planificacion', permKey: 'planificacion' },
  { icon: 'ri-map-pin-line', label: 'Tracking', i18nKey: 'menu.tracking', path: '/tracking', permKey: 'tracking' },
  { icon: 'ri-money-dollar-circle-line', label: 'Tarifas', i18nKey: 'menu.tarifas', path: '/liquidaciones', permKey: 'tarifas' },
  {
    type: 'group',
    icon: 'ri-scales-3-line',
    label: 'OMS',
    i18nKey: 'menu.oms',
    children: [
      { icon: 'ri-dashboard-2-line', label: 'Panel OMS', i18nKey: 'menu.omsPanel', path: '/oms/panel', permKey: 'oms.panel' },
      { icon: 'ri-stack-line', label: 'Cola de Priorización', i18nKey: 'menu.omsCola', path: '/oms/cola', permKey: 'oms.cola' },
      { icon: 'ri-settings-3-line', label: 'Motor de Reglas', i18nKey: 'menu.omsReglas', path: '/oms/reglas', permKey: 'oms.reglas' },
      { icon: 'ri-flask-line', label: 'Simulador', i18nKey: 'menu.omsSimulador', path: '/oms/simulador', permKey: 'oms.simulador' },
      { icon: 'ri-calendar-schedule-line', label: 'Rutas y Días', i18nKey: 'menu.omsRutas', path: '/oms/rutas-despacho', permKey: 'oms.rutas' },
      { icon: 'ri-history-line', label: 'Auditoría', i18nKey: 'menu.omsAuditoria', path: '/oms/auditoria', permKey: 'oms.auditoria' },
    ],
  },
  {
    type: 'group',
    icon: 'ri-book-2-line',
    label: 'Catálogos',
    i18nKey: 'menu.catalogos',
    children: [
      { icon: 'ri-global-line', label: 'Países', i18nKey: 'menu.paises', path: '/paises', permKey: 'paises' },
      { icon: 'ri-map-2-line', label: 'Zonas', i18nKey: 'menu.zonas', path: '/zonas', permKey: 'zonas' },
      { icon: 'ri-building-line', label: 'Transportistas', i18nKey: 'menu.transportistas', path: '/transportistas', permKey: 'transportistas' },
      { icon: 'ri-truck-line', label: 'Vehículos', i18nKey: 'menu.vehiculos', path: '/vehiculos', permKey: 'vehiculos' },
      { icon: 'ri-user-line', label: 'Conductores', i18nKey: 'menu.conductores', path: '/conductores', permKey: 'conductores' },
      { icon: 'ri-bank-card-line', label: 'Licencias de Conducir', i18nKey: 'menu.licencias', path: '/licencias', permKey: 'licencias' },
      { icon: 'ri-group-line', label: 'Clientes', i18nKey: 'menu.clientes', path: '/clientes', permKey: 'clientes' },
      { icon: 'ri-store-line', label: 'Puntos de Entrega', i18nKey: 'menu.puntosEntrega', path: '/tiendas', permKey: 'puntos_entrega' },
    ],
  },
  { icon: 'ri-file-paper-line', label: 'Contratos', i18nKey: 'menu.contratos', path: '/contratos', comingSoon: true, permKey: 'contratos' },
  { icon: 'ri-bar-chart-line', label: 'Reportes', i18nKey: 'menu.reportes', path: '/reportes', comingSoon: true, permKey: 'reportes' },
  { icon: 'ri-settings-line', label: 'Configuración', i18nKey: 'menu.configuracion', path: '/configuracion', permKey: 'configuracion' },
];

export function isGroup(item: NavItem): item is MenuGroup {
  return (item as MenuGroup).type === 'group';
}
