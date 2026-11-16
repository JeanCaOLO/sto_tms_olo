// Diálogo para rechazar o cancelar una devolución que no llegó o no procede.
import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Modal from '../../../components/base/Modal';

interface Props {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function RejectModal({ isOpen, title, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setError(null);
  }, [isOpen]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('El motivo de rechazo es obligatorio.');
      return;
    }
    if (trimmed.length > 500) {
      setError('El motivo admite hasta 500 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rechazar la devolución.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => undefined : onClose} title={title} widthClass="max-w-md" closeOnBackdrop={false}>
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">
          Al rechazar esta devolución no contará como pendiente y dejará de bloquear la liquidación del viaje.
        </p>
        <div>
          <label htmlFor="reject-reason" className="block text-sm font-medium text-slate-700 mb-1">
            Motivo del rechazo *
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="Ejemplo: Mercadería nunca llegó al camión o no fue entregada por el cliente"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="danger" onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : 'Confirmar rechazo'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
