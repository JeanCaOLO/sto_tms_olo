import Button from '../../../components/base/Button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  errorMessage?: string;
}

export default function DeleteConfirmModal({ isOpen, onClose, onConfirm, title, description, errorMessage }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <i className="ri-error-warning-line text-2xl text-red-600"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500 mt-1">{description}</p>
            </div>
          </div>
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <i className="ri-close-circle-line text-red-500 mt-0.5 flex-shrink-0"></i>
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {!errorMessage && (
              <Button type="button" variant="danger" onClick={onConfirm}>
                <i className="ri-delete-bin-line"></i>
                Eliminar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}