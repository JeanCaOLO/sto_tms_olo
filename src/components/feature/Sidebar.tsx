import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface MenuItem {
  icon: string;
  label: string;
  path: string;
  badge?: number;
}

interface MenuGroup {
  type: 'group';
  icon: string;
  label: string;
  children: MenuItem[];
}

type NavItem = MenuItem | MenuGroup;

const navItems: NavItem[] = [
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

function isGroup(item: NavItem): item is MenuGroup {
  return (item as MenuGroup).type === 'group';
}

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const groups = navItems.filter(isGroup);
  const activeGroups = groups
    .filter((group) => group.children.some((child) => child.path === location.pathname))
    .map((group) => group.label);
  const [openGroups, setOpenGroups] = useState<string[]>(activeGroups);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-slate-900 text-white transition-all duration-300 z-40 ${collapsed ? 'w-20' : 'w-64'}`}>
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-teal-600 rounded-lg">
              <i className="ri-truck-line text-xl"></i>
            </div>
            <div>
              <h1 className="font-bold text-base">STO</h1>
              <p className="text-xs text-slate-400">Transportes OLO</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <i className={`ri-${collapsed ? 'menu-unfold' : 'menu-fold'}-line text-lg`}></i>
        </button>
      </div>

      <nav className="p-3 overflow-y-auto h-[calc(100vh-80px)]">
        {navItems.map((item) => {
          if (isGroup(item)) {
            const isGroupActive = item.children.some((child) => child.path === location.pathname);
            const isGroupOpen = openGroups.includes(item.label);
            return (
              <div key={item.label}>
                <button
                  onClick={() => { if (!collapsed) toggleGroup(item.label); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg transition-all cursor-pointer group ${
                    isGroupActive
                      ? 'bg-teal-600/20 text-teal-400'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                      <i className={`ri-arrow-${isGroupOpen ? 'up' : 'down'}-s-line text-sm transition-transform`}></i>
                    </>
                  )}
                </button>

                {!collapsed && isGroupOpen && (
                  <div className="ml-3 pl-3 border-l border-slate-700 mb-1">
                    {item.children.map((child) => {
                      const isActive = location.pathname === child.path;
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`flex items-center gap-3 px-3 py-2 mb-0.5 rounded-lg transition-all cursor-pointer ${
                            isActive
                              ? 'bg-teal-600 text-white'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <i className={`${child.icon} text-base w-4 h-4 flex items-center justify-center`}></i>
                          <span className="text-sm font-medium">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {collapsed && (
                  <div className="flex flex-col items-center gap-0.5 mb-1">
                    {item.children.map((child) => {
                      const isActive = location.pathname === child.path;
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          title={child.label}
                          className={`w-10 h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                            isActive
                              ? 'bg-teal-600 text-white'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <i className={`${child.icon} text-base`}></i>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg transition-all cursor-pointer group ${
                isActive
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
