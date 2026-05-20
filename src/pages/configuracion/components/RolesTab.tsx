import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Badge from '../../../components/base/Badge';
import RoleModal from './RoleModal';

interface Role {
  id: string;
  name: string;
  description: string;
  user_count?: number;
}

export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setLoading(true);
    
    // Obtener roles
    const { data: rolesData, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .order('name');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      setLoading(false);
      return;
    }

    // Obtener conteo de usuarios por rol
    const { data: usersData } = await supabase
      .from('app_users')
      .select('role_id');

    const userCountByRole: Record<string, number> = {};
    usersData?.forEach((user) => {
      if (user.role_id) {
        userCountByRole[user.role_id] = (userCountByRole[user.role_id] || 0) + 1;
      }
    });

    const rolesWithCount = rolesData.map((role) => ({
      ...role,
      user_count: userCountByRole[role.id] || 0
    }));

    setRoles(rolesWithCount);
    setLoading(false);
  };

  const handleEdit = (role: Role) => {
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const handleDelete = async (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    
    if (role && role.user_count && role.user_count > 0) {
      setMessage({
        type: 'error',
        text: `No se puede eliminar el rol "${role.name}" porque tiene ${role.user_count} usuario(s) asignado(s)`
      });
      setTimeout(() => setMessage(null), 4000);
      setDeleteConfirm(null);
      return;
    }

    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);

    if (error) {
      setMessage({ type: 'error', text: 'Error al eliminar el rol' });
    } else {
      setMessage({ type: 'success', text: 'Rol eliminado correctamente' });
      fetchRoles();
    }

    setTimeout(() => setMessage(null), 3000);
    setDeleteConfirm(null);
  };

  const getRoleBadgeColor = (roleName: string) => {
    const name = roleName.toLowerCase();
    if (name.includes('super') || name.includes('administrador')) return 'bg-purple-100 text-purple-700';
    if (name.includes('admin')) return 'bg-blue-100 text-blue-700';
    if (name.includes('operacion') || name.includes('supervisor')) return 'bg-teal-100 text-teal-700';
    if (name.includes('chofer') || name.includes('conductor')) return 'bg-orange-100 text-orange-700';
    if (name.includes('cliente')) return 'bg-slate-100 text-slate-700';
    return 'bg-slate-100 text-slate-700';
  };

  const totalRoles = roles.length;
  const totalUsers = roles.reduce((sum, role) => sum + (role.user_count || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'
        }`}>
          <i className={`${message.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} text-xl`}></i>
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-teal-100 rounded-lg">
              <i className="ri-shield-user-line text-xl text-teal-600"></i>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total de Roles</p>
              <p className="text-2xl font-semibold text-slate-800">{totalRoles}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
              <i className="ri-user-line text-xl text-blue-600"></i>
            </div>
            <div>
              <p className="text-sm text-slate-500">Usuarios Totales</p>
              <p className="text-2xl font-semibold text-slate-800">{totalUsers}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-lg">
              <i className="ri-user-settings-line text-xl text-purple-600"></i>
            </div>
            <div>
              <p className="text-sm text-slate-500">Promedio por Rol</p>
              <p className="text-2xl font-semibold text-slate-800">
                {totalRoles > 0 ? Math.round(totalUsers / totalRoles) : 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Gestión de Roles</h2>
            <p className="text-sm text-slate-500 mt-1">Administra los roles del sistema</p>
          </div>
          <Button
            onClick={() => {
              setSelectedRole(null);
              setIsModalOpen(true);
            }}
            className="cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            <span>Nuevo Rol</span>
          </Button>
        </div>
      </Card>

      {/* Roles Grid */}
      {roles.length === 0 ? (
        <Card className="p-12">
          <div className="text-center text-slate-400">
            <i className="ri-shield-user-line text-5xl mb-3"></i>
            <p className="text-sm">No hay roles registrados</p>
            <p className="text-xs mt-1">Crea el primer rol para comenzar</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {roles.map((role) => (
            <Card key={role.id} className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg">
                    <i className="ri-shield-user-line text-xl text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{role.name}</h3>
                    <Badge className={`text-xs mt-1 ${getRoleBadgeColor(role.name)}`}>
                      {role.user_count || 0} usuario{role.user_count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(role)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all cursor-pointer"
                    title="Editar"
                  >
                    <i className="ri-edit-line text-lg"></i>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(role.id)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                    title="Eliminar"
                  >
                    <i className="ri-delete-bin-line text-lg"></i>
                  </button>
                </div>
              </div>

              {role.description && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  {role.description}
                </p>
              )}

              {!role.description && (
                <p className="text-sm text-slate-400 italic">
                  Sin descripción
                </p>
              )}

              {/* Delete Confirmation */}
              {deleteConfirm === role.id && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 mb-3">
                    ¿Estás seguro de eliminar este rol?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 px-3 py-2 bg-white text-slate-700 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <RoleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedRole(null);
        }}
        onSuccess={fetchRoles}
        role={selectedRole}
      />
    </div>
  );
}