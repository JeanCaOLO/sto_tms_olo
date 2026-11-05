// Confirma la recepción en bodega: de UNA devolución (cantidad + estado) o de TODAS las pendientes del viaje (estado).
import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Modal from '../../../components/base/Modal';
import Select from '../../../components/base/Select';
import { CONDITIONS, parseQuantity } from '../../../lib/devoluciones/trips';
import type { ReturnCondition } from '../../../lib/devoluciones/types';

interface Props {
  isOpen: boolean;
  title: string;
  description?: string;
  /** Cantidad inicial; null = no se pide cantidad (recibir todas: se toma la registrada de cada una). */
  initialQuantity: number | null;
  onClose: () => void;
  onConfirm: (quantity: number | null, condition: ReturnCondition) => Promise<void>;
}

export default function ReceiveModal({ isOpen, title, description, initialQuantity, onClose, onConfirm }: Props) {
  const [quantity, setQuantity] = useState('');
  const [condition, setCondition] = useState<ReturnCondition>('Bueno');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuantity(initialQuantity === null ? '' : String(initialQuantity));
    setCondition('Bueno');
    setError(null);
  }, [isOpen, initialQuantity]);

  const submit = async () => {
    const parsed = initialQuantity === null ? null : parseQuantity(quantity);
    if (initialQuantity !== null && parsed === null) {
      setError('La cantidad recibida debe ser un número entero mayor o igual a 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(parsed, condition);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la recepción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => undefined : onClose} title={title} widthClass="max-w-md" closeOnBackdrop={false}>
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-600">{description}</p>}
        {initialQuantity !== null && (
          <Input label="Cantidad recibida" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        )}
        <Select label="Estado de la mercadería" value={condition} onChange={(e) => setCondition(e.target.value as ReturnCondition)}
          options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="success" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Confirmar recibido'}</Button>
        </div>
      </div>
    </Modal>
  );
}
