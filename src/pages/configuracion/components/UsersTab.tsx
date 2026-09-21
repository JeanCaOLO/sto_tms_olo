import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Badge from '../../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import UserModal from './UserModal';

interface User {
  id: string;
  full_name: string;
  email: string;
  role_id: string;
  role_name: string;
  status: string;
  created_at: string;
}

interface UsersTabProps {
  organizationId: string;
}

export default function UsersTab({ organizationId }: UsersTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // KPIs
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0
  });

  useEffect(() => {
    fetchUsers();
  }, [organizationId]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_users')
      .select(`
        id,
        full_name,
        email,
        role_id,
        status,
        created_at,
        roles (
          name
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (data && !error) {
      const formattedUsers = data.map((user: any) => ({
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role_id: user.role_id,
        role_name: user.roles?.name || 'Sin rol',
        status: user.status,
        created_at: user.created_at
      }));

      setUsers(formattedUsers);
      calculateStats(formattedUsers);
    }
    setLoading(false);
  };

  const calculateStats = (usersList: User[]) => {
    setStats({
      total: usersList.length,
      active: usersList.filter(u => u.status === 'active').length,
      inactive: usersList.filter(u => u.status === 'inactive').length
    });
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleDelete = async (userId: string) => {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (!error) {
      fetchUsers();
      setDeleteConfirm(null);
    }
  };

  const handleModalSuccess = () => {
    fetchUsers();
  };

  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return <Badge variant="success">Activo</Badge>;
    }
    return <Badge variant="default">Inactivo</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const columns: DataTableColumn<User>[] = [
    {
      key: 'full_name',
      header: 'Usuario',
      accessor: (u) => u.full_name,
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-full text-white font-semibold">
            {u.full_name.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-slate-800">{u.full_name}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', accessor: (u) => u.email, sortable: true },
    { key: 'role_name', header: 'Rol', accessor: (u) => u.role_name, filterable: true, render: (u) => <Badge variant="default">{u.role_name}</Badge> },
    {
      key: 'status',
      header: 'Estado',
      accessor: (u) => (u.status === 'active' ? 'Activo' : 'Inactivo'),
      filterable: true,
      render: (u) => getStatusBadge(u.status),
    },
    { key: 'created_at', header: 'Fecha Creación', accessor: (u) => u.created_at, sortable: true, render: (u) => formatDate(u.created_at) },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
              <i className="ri-user-line text-2xl text-blue-600"></i>
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Usuarios</p>
              <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-lg">
              <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
            </div>
            <div>
              <p className="text-sm text-slate-600">Usuarios Activos</p>
              <p className="text-2xl font-bold text-slate-800">{stats.active}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-lg">
              <i className="ri-close-circle-line text-2xl text-slate-600"></i>
            </div>
            <div>
              <p className="text-sm text-slate-600">Usuarios Inactivos</p>
              <p className="text-2xl font-bold text-slate-800">{stats.inactive}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setSelectedUser(null);
            setIsModalOpen(true);
          }}
          className="whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line"></i>
          <span>Nuevo Usuario</span>
        </Button>
      </div>

      <DataTable
        data={users}
        columns={columns}
        getRowId={(u) => u.id}
        loading={loading}
        searchPlaceholder="Buscar por nombre o email..."
        exportFileName="usuarios"
        emptyMessage="No se encontraron usuarios"
        actions={(user) => (
          <>
            <button
              onClick={() => handleEdit(user)}
              className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
              title="Editar"
            >
              <i className="ri-edit-line"></i>
            </button>
            {deleteConfirm === user.id ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDelete(user.id)}
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
              <button
                onClick={() => setDeleteConfirm(user.id)}
                className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            )}
          </>
        )}
      />

      {/* Modal */}
      <UserModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={handleModalSuccess}
        user={selectedUser}
        organizationId={organizationId}
      />
    </div>
  );
}