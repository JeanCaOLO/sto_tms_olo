import { useState, type FormEvent } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import {
  createUser, updateUser, type AdminRole, type AdminUser, type ScopeInput, type UserPayload, type UserStatus,
} from '../admin/admin-api';
import AdminModal from './AdminModal';
import ScopeEditor from './ScopeEditor';

const MIN_PASSWORD = 8;

interface UserModalProps {
  user: AdminUser | null;
  roles: AdminRole[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface FormState {
  full_name: string;
  email: string;
  password: string;
  role_id: string;
  status: UserStatus;
  scopes: ScopeInput[];
}

function initialForm(user: AdminUser | null, roles: AdminRole[]): FormState {
  if (!user) return { full_name: '', email: '', password: '', role_id: roles[0]?.id ?? '', status: 'active', scopes: [{}] };
  const scopes = user.scopes.map(({ country_id, warehouse_id, customer_id }) => ({ country_id, warehouse_id, customer_id }));
  return { full_name: user.full_name, email: user.email, password: '', role_id: user.role_id ?? '', status: user.status, scopes };
}

function payloadOf(form: FormState, isNew: boolean): UserPayload {
  const base = { full_name: form.full_name.trim(), role_id: form.role_id, status: form.status, scopes: form.scopes };
  return isNew ? { ...base, email: form.email.trim(), password: form.password } : base;
}

export default function UserModal({ user, roles, onClose, onSaved }: UserModalProps) {
  const isNew = user === null;
  const [form, setForm] = useState<FormState>(() => initialForm(user, roles));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await (isNew ? createUser(payloadOf(form, true)) : updateUser(user.id, payloadOf(form, false)));
      onSaved(isNew ? 'Usuario creado correctamente' : 'Usuario actualizado correctamente');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={isNew ? 'Nuevo Usuario' : 'Editar Usuario'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <i className="ri-error-warning-line text-lg"></i>
            <span>{error}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nombre completo *" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} required />
          <Input
            label="Correo *"
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            disabled={!isNew}
            required
          />
          {isNew && (
            <Input
              label="Contraseña temporal *"
              type="password"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              minLength={MIN_PASSWORD}
              placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
              required
            />
          )}
          <Select
            label="Rol *"
            value={form.role_id}
            onChange={(e) => set({ role_id: e.target.value })}
            options={[{ value: '', label: 'Seleccionar rol' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
            required
          />
          <Select
            label="Estado *"
            value={form.status}
            onChange={(e) => set({ status: e.target.value as UserStatus })}
            options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }]}
          />
        </div>
        <div>
          <p className="block text-sm font-medium text-slate-700 mb-2">Alcance *</p>
          <ScopeEditor scopes={form.scopes} onChange={(scopes) => set({ scopes })} />
        </div>
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" disabled={saving} className="flex-1">
            <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}></i>
            <span>{saving ? 'Guardando...' : isNew ? 'Crear Usuario' : 'Actualizar'}</span>
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
