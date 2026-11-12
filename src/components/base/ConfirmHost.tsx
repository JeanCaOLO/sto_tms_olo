import { useCallback, useEffect, useRef, useState } from 'react';
import { onConfirm, type ConfirmOptions } from '../../lib/confirm';
import Modal from './Modal';
import Button from './Button';

interface Pending extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

/** Muestra las confirmaciones pedidas con `confirmAction` (`lib/confirm.ts`). Se monta una sola vez. */
export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);

  const open = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    current.current?.resolve(false); // una nueva pregunta cancela la anterior
    const next = { ...options, resolve };
    current.current = next;
    setPending(next);
  }), []);

  useEffect(() => onConfirm(open), [open]);

  const close = (accepted: boolean) => {
    current.current?.resolve(accepted);
    current.current = null;
    setPending(null);
  };

  const danger = (pending?.variant ?? 'danger') === 'danger';
  return (
    <Modal isOpen={!!pending} onClose={() => close(false)} title={pending?.title ?? 'Confirmar'} widthClass="max-w-md" zClass="z-[70]">
      <div className="p-6">
        <div className="mb-4 flex items-start gap-4">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-100' : 'bg-teal-100'}`}>
            <i className={`ri-error-warning-line text-2xl ${danger ? 'text-red-600' : 'text-teal-600'}`}></i>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{pending?.title ?? 'Confirmar'}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{pending?.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={() => close(false)}>Cancelar</Button>
          <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {pending?.confirmLabel ?? 'Aceptar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
