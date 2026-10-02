import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MenuItem } from './sidebar-nav-items';

interface Props {
  item: MenuItem;
  isActive: boolean;
  collapsed: boolean;
}

export default function SidebarNavLink({ item, isActive, collapsed }: Props) {
  const { t } = useTranslation();

  // Módulo "Coming Soon": apagado, no navegable (div en vez de Link).
  if (item.comingSoon) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-slate-500 cursor-not-allowed select-none"
        title={collapsed ? `${item.label} · ${t('common.comingSoon')}` : undefined}
      >
        <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
        {!collapsed && (
          <>
            <span className="text-sm font-medium flex-1">{t(item.i18nKey)}</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-700 text-slate-300 rounded-full whitespace-nowrap">
              {t('common.comingSoon')}
            </span>
          </>
        )}
      </div>
    );
  }

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
          <span className="text-sm font-medium flex-1">{t(item.i18nKey)}</span>
          {item.badge && (
            <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">{item.badge}</span>
          )}
        </>
      )}
    </Link>
  );
}
