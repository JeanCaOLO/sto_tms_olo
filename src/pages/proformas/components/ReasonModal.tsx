// Pide un texto (motivo o comentario) antes de una acción delicada. Reemplaza a window.prompt/confirm.

import { useState } from 'react';
import Modal from '../../../components/base/Modal';
import Button from '../../../components/base/Button';

interface Props {
  title: string;
  label: string;
  confirmLabel: string;
  /** false = el texto es opcional (p. ej. un comentario al aprobar). */
  required?: boolean;
  danger?: boolean;
  busy?: boolean;
  /** Por qué falló la acción: se muestra dentro del modal (un aviso fuera de él queda tapado por el fondo). */
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export default function ReasonModal({ title, label, confirmLabel, required = true, danger = false, busy = false, error = null, onConfirm, onClose }: Props) {
  const [text, setText] = useState('');
  const missing = required && !text.trim();
  return (
    <Modal isOpen title={title} onClose={onClose} widthClass="max-w-md" zClass="z-[60]" closeOnBackdrop={false}>
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <label className="block text-sm font-medium text-slate-700">
          {label}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={missing || busy} onClick={() => onConfirm(text.trim())}>
            {busy ? 'Guardando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
