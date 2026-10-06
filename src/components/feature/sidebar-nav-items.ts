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

// Encabezado de sección: rótulo no navegable que agrupa el menú por etapa del
// ciclo de vida del pedido (demanda → ejecución → finanzas → administración).
export interface MenuSection {
  type: 'section';
  label: string;
  i18nKey: string;
}

export type NavItem = MenuItem | MenuGroup | MenuSection;

const OMS_GROUP: MenuGroup = {
  type: 'group',
  icon: 'ri-scales-3-line',
  label: 'OMS',
  i18nKey: 'menu.oms',
  children: [
    { icon: 'ri-dashboard-2-line', label: 'Panel OMS', i18nKey: 'menu.omsPanel', path: '/oms/panel', permKey: 'oms.panel' },
    { icon: 'ri-stack-line', label: 'Cola de Priorización', i18nKey: 'menu.omsCola', path: '/oms/cola', permKey: 'oms.cola' },
    { icon: 'ri-settings-3-line', label: 'Motor de Reglas', i18nKey: 'menu.omsReglas', path: '/oms/reglas', permKey: 'oms.reglas' },
    { icon: 'ri-flask-line', label: 'Simulador', i18nKey: 'menu.omsSimulador', path: '/oms/simulador', permKey: 'oms.simulador' },
    { icon: 'ri-history-line', label: 'Auditoría', i18nKey: 'menu.omsAuditoria', path: '/oms/auditoria', permKey: 'oms.auditoria' },
  ],
};

// Liquidaciones (liquidar/leer) cuelga del permiso 'tarifas'. Flota Propia, Flota Externa y
// Reglas de Tarifa son configuración (reglas, tarifarios, costos, variables, margen) y cuelgan de
// 'tarifas.config', el mismo módulo que exige el backend para escribir: un rol sin él no ve esas
// entradas ni entra por URL.
const TARIFAS_GROUP: MenuGroup = {
  type: 'group',
  icon: 'ri-money-dollar-circle-line',
  label: 'Tarifas',
  i18nKey: 'menu.tarifas',
  children: [
    { icon: 'ri-money-dollar-circle-line', label: 'Liquidaciones', i18nKey: 'menu.liquidaciones', path: '/liquidaciones', permKey: 'tarifas' },
    { icon: 'ri-home-gear-line', label: 'Flota Propia', i18nKey: 'menu.flotaPropia', path: '/tarifas/flota-propia', permKey: 'tarifas.config' },
    { icon: 'ri-truck-line', label: 'Flota Externa', i18nKey: 'menu.flotaExterna', path: '/tarifas/transportistas', permKey: 'tarifas.config' },
    { icon: 'ri-price-tag-3-line', label: 'Reglas de Tarifa', i18nKey: 'menu.reglasTarifa', path: '/reglas-tarifa', permKey: 'tarifas.config' },
  ],
};

const CATALOGOS_GROUP: MenuGroup = {
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
};

// Orden por ciclo de vida del pedido: visión general → qué mover (demanda) →
// cómo entregarlo (ejecución) → cobro (finanzas) → soporte (administración).
export const navItems: NavItem[] = [
  { icon: 'ri-dashboard-line', label: 'Dashboard', i18nKey: 'menu.dashboard', path: '/dashboard', permKey: 'dashboard' },

  { type: 'section', label: 'Gestión de la Demanda', i18nKey: 'menu.sectionDemand' },
  OMS_GROUP,
  { icon: 'ri-file-list-line', label: 'Pedidos', i18nKey: 'menu.pedidos', path: '/pedidos', permKey: 'pedidos' },

  { type: 'section', label: 'Ejecución Operativa', i18nKey: 'menu.sectionExecution' },
  { icon: 'ri-map-pin-add-line', label: 'Planificación', i18nKey: 'menu.planificacion', path: '/planificacion', permKey: 'planificacion' },
  { icon: 'ri-file-text-line', label: 'Guías de Despacho', i18nKey: 'menu.guias', path: '/guias', permKey: 'guias' },
  { icon: 'ri-map-pin-line', label: 'Tracking', i18nKey: 'menu.tracking', path: '/tracking', permKey: 'tracking' },
  { icon: 'ri-arrow-go-back-line', label: 'Devoluciones', i18nKey: 'menu.devoluciones', path: '/devoluciones', permKey: 'devoluciones' },

  { type: 'section', label: 'Gestión Financiera y Comercial', i18nKey: 'menu.sectionFinance' },
  TARIFAS_GROUP,
  { icon: 'ri-file-paper-line', label: 'Contratos', i18nKey: 'menu.contratos', path: '/contratos', comingSoon: true, permKey: 'contratos' },

  { type: 'section', label: 'Administración y Análisis', i18nKey: 'menu.sectionAdmin' },
  { icon: 'ri-bar-chart-line', label: 'Reportes', i18nKey: 'menu.reportes', path: '/reportes', comingSoon: true, permKey: 'reportes' },
  CATALOGOS_GROUP,
  { icon: 'ri-history-line', label: 'Auditoría del Sistema', i18nKey: 'menu.auditoria', path: '/auditoria', permKey: 'auditoria' },
  { icon: 'ri-settings-line', label: 'Configuración', i18nKey: 'menu.configuracion', path: '/configuracion', permKey: 'configuracion' },
];

export function isGroup(item: NavItem): item is MenuGroup {
  return (item as MenuGroup).type === 'group';
}

export function isSection(item: NavItem): item is MenuSection {
  return (item as MenuSection).type === 'section';
}
