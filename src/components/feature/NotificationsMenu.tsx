import { useNotifications } from '../../hooks/use-notifications';

const ICON_BG: Record<string, string> = {
  teal: 'bg-teal-100 text-teal-600',
  green: 'bg-green-100 text-green-600',
  amber: 'bg-amber-100 text-amber-600',
  blue: 'bg-blue-100 text-blue-600',
  red: 'bg-red-100 text-red-600',
};

interface Props {
  open: boolean;
  onToggle: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

export default function NotificationsMenu({ open, onToggle, buttonRef }: Props) {
  const { items, unreadCount, markAllRead, markRead } = useNotifications();

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onToggle}
        className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer relative"
      >
        <i className="ri-notification-3-line text-xl text-slate-600"></i>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-800">Notificaciones</h3>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="text-xs text-teal-600 font-medium cursor-pointer hover:text-teal-700 disabled:text-slate-300 disabled:cursor-default"
            >
              Marcar todas
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Sin notificaciones</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 ${n.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 mt-0.5 ${ICON_BG[n.iconColor] ?? ICON_BG.teal}`}>
                      <i className={`${n.icon} text-sm`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        {n.title}
                        {!n.read && <span className="w-1.5 h-1.5 bg-teal-500 rounded-full shrink-0"></span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.detail}</p>
                      <p className="text-xs text-slate-400 mt-1">{n.time}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
