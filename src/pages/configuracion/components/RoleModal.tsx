import { useState, type FormEvent } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import { createRole, updateRole, type AdminRole } from '../admin/admin-api';
import AdminModal from './AdminModal';

interface RoleModalProps {
  role: AdminRole | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function RoleModal({ role, onClose, onSaved }: RoleModalProps) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = { name: name.trim(), description: description.trim() };
    try {
      await (role ? updateRole(role.id, payload) : createRole(payload));
      onSaved(role ? 'Rol actualizado correctamente' : 'Rol creado correctamente');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={role ? 'Editar Rol' : 'Nuevo Rol'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <i className="ri-error-warning-line text-lg"></i>
            <span>{error}</span>
          </div>
        )}
        <Input label="Nombre del rol *" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Supervisor de Operaciones" required />
        <div>
          <label htmlFor="role-description" className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
          <textarea
            id="role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe las responsabilidades de este rol..."
            rows={4}
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
          />
        </div>
        <div className="flex items-center gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" disabled={saving} className="flex-1">
            <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}></i>
            <span>{saving ? 'Guardando...' : role ? 'Actualizar' : 'Crear Rol'}</span>
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
