import { Link } from 'react-router-dom';
import type { MenuItem } from './sidebar-nav-items';

interface Props {
  item: MenuItem;
  isActive: boolean;
  collapsed: boolean;
}

export default function SidebarNavLink({ item, isActive, collapsed }: Props) {
  return (
    <Link
      to={item.path}
      className={`flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg transition-all cursor-pointer group ${
        isActive ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
      title={collapsed ? item.label : undefined}
    >
      <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
      {!collapsed && (
        <>
          <span className="text-sm font-medium flex-1">{item.label}</span>
          {item.badge && (
            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">{item.badge}</span>
          )}
        </>
      )}
    </Link>
  );
}
