import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../hooks/useSidebar';
import ContextSelector from './ContextSelector';
import NotificationsMenu from './NotificationsMenu';
import LanguageSwitcher from './LanguageSwitcher';

const roleColors: Record<string, string> = {
  SuperUsuario: 'bg-teal-100 text-teal-700',
  Admin: 'bg-amber-100 text-amber-700',
  Operaciones: 'bg-blue-100 text-blue-700',
  Chofer: 'bg-green-100 text-green-700',
  Cliente: 'bg-slate-100 text-slate-700',
};

function getInitials(name: string): string {
  if (!name) return 'US';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Header() {
  const { appUser, signOut } = useAuth();
  const { collapsed, setMobileOpen } = useSidebar();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const roleName = appUser?.role?.name ?? '';
  const fullName = appUser?.full_name ?? appUser?.email ?? 'Usuario';
  const initials = getInitials(fullName);
  const roleClass = roleColors[roleName] ?? 'bg-slate-100 text-slate-700';

  return (
    <header
      className={`fixed top-0 right-0 left-0 ${collapsed ? 'lg:left-20' : 'lg:left-64'} h-16 bg-white border-b border-slate-200 z-20 px-4 lg:px-6 flex items-center justify-between transition-all duration-300`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden w-9 h-9 flex-shrink-0 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
        >
          <i className="ri-menu-line text-xl"></i>
        </button>
        <div className="hidden md:block">
          <ContextSelector />
        </div>
        <div className="relative flex-1 max-w-md hidden sm:block">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
            <i className="ri-search-line text-slate-400 text-base"></i>
          </div>
          <input
            type="text"
            placeholder="Buscar pedidos, rutas, clientes..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Selector de idioma */}
        <LanguageSwitcher />

        {/* Notificaciones */}
        <div className="relative" ref={notifRef}>
          <NotificationsMenu
            open={showNotifications}
            onToggle={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
            buttonRef={notifButtonRef}
          />
        </div>

        {/* Perfil */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-semibold text-slate-900 leading-tight">{fullName}</p>
              {roleName && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${roleClass}`}>
                  {roleName}
                </span>
              )}
            </div>
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-arrow-down-s-line text-slate-400 text-base"></i>
            </div>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
              {/* Info usuario */}
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{fullName}</p>
                    <p className="text-xs text-slate-500 truncate">{appUser?.email}</p>
                    {roleName && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full mt-1 inline-block ${roleClass}`}>
                        {roleName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="py-1">
                <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer text-left">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-user-line text-slate-500 text-base"></i>
                  </div>
                  <span className="text-sm text-slate-700">Mi Perfil</span>
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer text-left">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-settings-3-line text-slate-500 text-base"></i>
                  </div>
                  <span className="text-sm text-slate-700">Configuración</span>
                </button>
              </div>

              <div className="border-t border-slate-200 pt-1">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-red-50 cursor-pointer text-left group"
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-logout-box-line text-red-500 text-base"></i>
                  </div>
                  <span className="text-sm text-red-600 font-medium">Cerrar Sesión</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
