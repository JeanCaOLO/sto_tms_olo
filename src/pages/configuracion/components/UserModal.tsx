import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

interface Role {
  id: string;
  name: string;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: {
    id: string;
    full_name: string;
    email: string;
    role_id: string;
    status: string;
  } | null;
  organizationId: string;
}

export default function UserModal({ isOpen, onClose, onSuccess, user, organizationId }: UserModalProps) {
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role_id: '',
    status: 'active'
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchRoles();
      if (user) {
        setFormData({
          full_name: user.full_name,
          email: user.email,
          password: '',
          role_id: user.role_id,
          status: user.status
        });
      } else {
        setFormData({
          full_name: '',
          email: '',
          password: '',
          role_id: '',
          status: 'active'
        });
      }
      setError('');
    }
  }, [isOpen, user]);

  const fetchRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('id, name')
      .order('name');

    if (data) {
      setRoles(data);
      if (!user && data.length > 0) {
        setFormData(prev => ({ ...prev, role_id: data[0].id }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (user) {
        // Editar usuario existente
        const { error: updateError } = await supabase
          .from('app_users')
          .update({
            full_name: formData.full_name,
            role_id: formData.role_id,
            status: formData.status
          })
          .eq('id', user.id);

        if (updateError) throw updateError;
      } else {
        // Crear nuevo usuario
        if (!formData.password || formData.password.length < 6) {
          setError('La contraseña debe tener al menos 6 caracteres');
          setLoading(false);
          return;
        }

        // 1. Crear usuario en auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // 2. Crear registro en app_users
          const { error: insertError } = await supabase
            .from('app_users')
            .insert({
              auth_user_id: authData.user.id,
              organization_id: organizationId,
              full_name: formData.full_name,
              email: formData.email,
              role_id: formData.role_id,
              status: formData.status
            });

          if (insertError) throw insertError;
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar el usuario');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {user ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <i className="ri-error-warning-line text-red-600 text-lg mt-0.5"></i>
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nombre Completo *
            </label>
            <Input
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Ej: Juan Pérez"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email *
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Ej: juan@empresa.com"
              required
              disabled={!!user}
            />
            {user && (
              <p className="text-xs text-slate-500 mt-1">El email no se puede modificar</p>
            )}
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Contraseña Temporal *
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
              <p className="text-xs text-slate-500 mt-1">
                El usuario podrá cambiarla después del primer inicio de sesión
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Rol *
            </label>
            <Select
              value={formData.role_id}
              onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
              required
            >
              <option value="">Seleccionar rol</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Estado *
            </label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <i className="ri-save-line"></i>
                  <span>{user ? 'Actualizar' : 'Crear Usuario'}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}