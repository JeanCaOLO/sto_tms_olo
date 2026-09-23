import { useState, type FormEvent } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import { resetPassword, type AdminUser } from '../admin/admin-api';
import AdminModal from './AdminModal';

const MIN_PASSWORD = 8;

interface PasswordModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function PasswordModal({ user, onClose, onSaved }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setSaving(true);
    setError('');
    try {
      await resetPassword(user.id, password);
      onSaved(`Contraseña de ${user.full_name} actualizada`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title="Cambiar contraseña" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <p className="text-sm text-slate-600">
          Nueva contraseña para <strong>{user.full_name}</strong> ({user.email}).
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input label="Nueva contraseña *" type="password" value={password} minLength={MIN_PASSWORD}
          onChange={(e) => setPassword(e.target.value)} placeholder={`Mínimo ${MIN_PASSWORD} caracteres`} required />
        <Input label="Confirmar contraseña *" type="password" value={confirm} minLength={MIN_PASSWORD}
          onChange={(e) => setConfirm(e.target.value)} required />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" disabled={saving} className="flex-1">
            <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-lock-password-line'}></i>
            <span>{saving ? 'Guardando...' : 'Guardar'}</span>
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
