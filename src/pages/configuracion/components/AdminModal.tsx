import type { ReactNode } from 'react';

interface AdminModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export default function AdminModal({ title, onClose, children, wide = false }: AdminModalProps) {
  return (
    // Click en el backdrop cierra; Escape también. El click dentro del panel no
    // propaga, para no cerrarlo al interactuar con el contenido.
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100] p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            aria-label="Cerrar"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
