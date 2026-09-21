import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Badge from '../../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
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

  const columns: DataTableColumn<Role>[] = [
    {
      key: 'name',
      header: 'Rol',
      accessor: (r) => r.name,
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg">
            <i className="ri-shield-user-line text-white"></i>
          </div>
          <span className="font-semibold text-slate-800">{r.name}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Descripción',
      accessor: (r) => r.description || '',
      render: (r) => r.description
        ? <span className="text-slate-600">{r.description}</span>
        : <span className="text-slate-400 italic">Sin descripción</span>,
    },
    {
      key: 'user_count',
      header: 'Usuarios',
      accessor: (r) => r.user_count || 0,
      sortable: true,
      render: (r) => (
        <Badge className={`text-xs ${getRoleBadgeColor(r.name)}`}>
          {r.user_count || 0} usuario{r.user_count !== 1 ? 's' : ''}
        </Badge>
      ),
    },
  ];

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

      <DataTable
        data={roles}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder="Buscar rol..."
        exportFileName="roles"
        emptyMessage="No hay roles registrados"
        actions={(role) =>
          deleteConfirm === role.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDelete(role.id)}
                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Confirmar
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
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
            </>
          )
        }
      />

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