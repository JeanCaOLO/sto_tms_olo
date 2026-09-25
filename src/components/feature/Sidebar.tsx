import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSidebar } from '../../hooks/useSidebar';
import { usePermissions } from '../../hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import { isGroup, isSection, navItems, type NavItem } from './sidebar-nav-items';
import SidebarNavGroup from './SidebarNavGroup';
import SidebarNavLink from './SidebarNavLink';

export default function Sidebar() {
  const location = useLocation();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const { can } = usePermissions();
  const { t } = useTranslation();

  // Solo se muestran los módulos con `view` (los "Coming Soon" quedan visibles
  // pero apagados; se controla en el render, no acá). Un grupo aparece si al
  // menos un hijo es visible.
  const canSee = (permKey?: string) => !permKey || can(permKey, 'view');
  const filtered: NavItem[] = navItems
    .map((item) =>
      isGroup(item) ? { ...item, children: item.children.filter((c) => canSee(c.permKey)) } : item,
    )
    .filter((item) =>
      isSection(item) ? true : isGroup(item) ? item.children.length > 0 : canSee(item.permKey),
    );

  // Quitar encabezados de sección que quedaron sin ningún ítem visible debajo
  // (hasta la próxima sección): una sección vacía no debe mostrarse.
  const visibleItems: NavItem[] = filtered.filter((item, i) => {
    if (!isSection(item)) return true;
    const next = filtered.slice(i + 1);
    const end = next.findIndex(isSection);
    const between = end === -1 ? next : next.slice(0, end);
    return between.length > 0;
  });

  // Grupos abiertos por label; arranca con el grupo cuyo hijo coincide con la ruta actual.
  const initialOpen = visibleItems
    .filter(isGroup)
    .filter((group) => group.children.some((child) => child.path === location.pathname))
    .map((group) => group.label);
  const [openGroups, setOpenGroups] = useState<string[]>(initialOpen);
  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`fixed left-0 top-0 h-screen bg-slate-900 text-white transition-all duration-300 z-40 ${
          collapsed ? 'lg:w-20' : 'lg:w-64'
        } w-64 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-teal-600 rounded-lg">
                <i className="ri-truck-line text-xl"></i>
              </div>
              <div>
                <h1 className="font-bold text-base">TMS</h1>
                <p className="text-xs text-slate-400">Transportes OLO</p>
              </div>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden lg:flex w-8 h-8 items-center justify-center hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <i className={`ri-${collapsed ? 'menu-unfold' : 'menu-fold'}-line text-lg`}></i>
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden w-8 h-8 flex items-center justify-center hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <nav className="p-3 overflow-y-auto overflow-x-hidden h-[calc(100vh-80px)] scrollbar-dark">
          {visibleItems.map((item) =>
            isSection(item) ? (
              !collapsed ? (
                <p
                  key={`section-${item.i18nKey}`}
                  className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none"
                >
                  {t(item.i18nKey)}
                </p>
              ) : (
                <div key={`section-${item.i18nKey}`} className="my-2 border-t border-slate-800" />
              )
            ) : isGroup(item) ? (
              <SidebarNavGroup
                key={item.label}
                item={item}
                isActive={item.children.some((child) => child.path === location.pathname)}
                collapsed={collapsed}
                open={openGroups.includes(item.label)}
                onToggle={() => toggleGroup(item.label)}
              />
            ) : (
              <SidebarNavLink key={item.path} item={item} isActive={location.pathname === item.path} collapsed={collapsed} />
            ),
          )}
        </nav>
      </aside>
    </>
  );
}
