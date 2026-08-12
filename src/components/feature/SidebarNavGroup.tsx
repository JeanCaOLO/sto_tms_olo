import { Link, useLocation } from 'react-router-dom';
import type { MenuGroup } from './sidebar-nav-items';

interface Props {
  item: MenuGroup;
  isActive: boolean;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
}

export default function SidebarNavGroup({ item, isActive, collapsed, open, onToggle }: Props) {
  const location = useLocation();

  return (
    <div>
      <button
        onClick={() => { if (!collapsed) onToggle(); }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg transition-all cursor-pointer group ${
          isActive ? 'bg-teal-600/20 text-teal-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
        title={collapsed ? item.label : undefined}
      >
        <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
        {!collapsed && (
          <>
            <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
            <i className={`ri-arrow-${open ? 'up' : 'down'}-s-line text-sm transition-transform`}></i>
          </>
        )}
      </button>

      {!collapsed && open && (
        <div className="ml-3 pl-3 border-l border-slate-700 mb-1">
          {item.children.map((child) => (
            <Link
              key={child.path}
              to={child.path}
              className={`flex items-center gap-3 px-3 py-2 mb-0.5 rounded-lg transition-all cursor-pointer ${
                location.pathname === child.path ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <i className={`${child.icon} text-base w-4 h-4 flex items-center justify-center`}></i>
              <span className="text-sm font-medium">{child.label}</span>
            </Link>
          ))}
        </div>
      )}

      {collapsed && (
        <div className="flex flex-col items-center gap-0.5 mb-1">
          {item.children.map((child) => (
            <Link
              key={child.path}
              to={child.path}
              title={child.label}
              className={`w-10 h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                location.pathname === child.path ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <i className={`${child.icon} text-base`}></i>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
