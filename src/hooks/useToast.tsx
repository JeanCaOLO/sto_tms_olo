import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { onAuditFailure } from '../lib/liquidador/auditLog';
import { onNotify } from '../lib/notify';
import ToastStack, { type Toast, type ToastVariant } from '../components/base/ToastStack';

interface ToastContextType {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  // Avisos que se piden desde código fuera de componentes (`lib/notify.ts`).
  useEffect(() => onNotify(showToast), [showToast]);

  // La bitácora puede fallar sin que falle el cambio (p. ej. 403 por rol): se avisa para que no quede sin rastro en silencio.
  useEffect(() => onAuditFailure((error) => {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
    showToast(`El cambio se guardó, pero no quedó registrado en la bitácora${detail}.`, 'warning');
  }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return context;
}
