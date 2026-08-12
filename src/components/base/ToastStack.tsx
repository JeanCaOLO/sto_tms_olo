export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const STYLES: Record<ToastVariant, { box: string; icon: string }> = {
  success: { box: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: 'ri-checkbox-circle-line text-emerald-600' },
  error: { box: 'bg-red-50 border-red-200 text-red-800', icon: 'ri-close-circle-line text-red-600' },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-800', icon: 'ri-alert-line text-amber-600' },
  info: { box: 'bg-slate-50 border-slate-200 text-slate-800', icon: 'ri-information-line text-slate-500' },
};

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export default function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
      {toasts.map((toast) => {
        const style = STYLES[toast.variant];
        return (
          <div key={toast.id} className={`flex items-start gap-2 border rounded-lg shadow-lg px-4 py-3 text-sm ${style.box}`}>
            <i className={`${style.icon} text-lg flex-shrink-0`}></i>
            <p className="flex-1">{toast.message}</p>
            <button onClick={() => onDismiss(toast.id)} className="flex-shrink-0 text-current opacity-60 hover:opacity-100 cursor-pointer">
              <i className="ri-close-line"></i>
            </button>
          </div>
        );
      })}
    </div>
  );
}
