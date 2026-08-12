export interface MenuItem {
  icon: string;
  label: string;
  path: string;
  badge?: number;
}

export interface MenuGroup {
  type: 'group';
  icon: string;
  label: string;
  children: MenuItem[];
}

export type NavItem = MenuItem | MenuGroup;

export const navItems: NavItem[] = [
  { icon: 'ri-dashboard-line', label: 'Dashboard', path: '/dashboard' },
  { icon: 'ri-file-list-line', label: 'Pedidos', path: '/pedidos' },
  { icon: 'ri-arrow-go-back-line', label: 'Devoluciones', path: '/devoluciones' },
  { icon: 'ri-file-text-line', label: 'Guías de Despacho', path: '/guias' },
  { icon: 'ri-map-pin-add-line', label: 'Planificación', path: '/planificacion' },
  { icon: 'ri-map-pin-line', label: 'Tracking', path: '/tracking' },
  { icon: 'ri-money-dollar-circle-line', label: 'Tarifas', path: '/liquidaciones' },
  {
    type: 'group',
    icon: 'ri-book-2-line',
    label: 'Catálogos',
    children: [
      { icon: 'ri-global-line', label: 'Países', path: '/paises' },
      { icon: 'ri-route-line', label: 'Rutas', path: '/rutas' },
      { icon: 'ri-building-line', label: 'Transportistas', path: '/transportistas' },
      { icon: 'ri-truck-line', label: 'Vehículos', path: '/vehiculos' },
      { icon: 'ri-user-line', label: 'Conductores', path: '/conductores' },
      { icon: 'ri-group-line', label: 'Clientes', path: '/clientes' },
      { icon: 'ri-store-line', label: 'Puntos de Entrega', path: '/tiendas' },
    ],
  },
  { icon: 'ri-file-paper-line', label: 'Contratos', path: '/contratos' },
  { icon: 'ri-bar-chart-line', label: 'Reportes', path: '/reportes' },
  { icon: 'ri-settings-line', label: 'Configuración', path: '/configuracion' },
];

export function isGroup(item: NavItem): item is MenuGroup {
  return (item as MenuGroup).type === 'group';
}
