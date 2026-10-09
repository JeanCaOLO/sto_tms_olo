import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Título accesible. Si se omite, el contenido debe traer su propio `aria-label` en `ariaLabel`. */
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
  /** Ancho máximo del panel (clase de Tailwind). */
  widthClass?: string;
  /** Cerrar con clic en el fondo. Desactivarlo en formularios con datos sin guardar. */
  closeOnBackdrop?: boolean;
  /** Capa; los modales apilados usan una mayor. */
  zClass?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Diálogo base accesible: `role="dialog"`, `aria-modal`, cierre con Esc, foco atrapado y devuelto
 * al elemento que lo abrió. Es el único contenedor de modales del módulo Tarifas.
 */
export default function Modal({
  isOpen, onClose, title, ariaLabel, children, widthClass = 'max-w-2xl', closeOnBackdrop = true, zClass = 'z-50',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/50 p-4`}
      onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        className={`flex w-full ${widthClass} max-h-[90vh] flex-col overflow-y-auto rounded-lg bg-white shadow-xl outline-none`}
      >
        {title && <h2 id={titleId} className="sr-only">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
