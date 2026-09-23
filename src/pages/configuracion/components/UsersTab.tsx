import { useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import StatCard from '../../../components/feature/StatCard';
import { useAuth } from '../../../hooks/useAuth';
import { deleteUser, describeScope, type AdminUser } from '../admin/admin-api';
import { useAdminRoles } from '../admin/use-admin-roles';
import { useAdminUsers } from '../admin/use-admin-users';
import Notice, { type NoticeMessage } from './Notice';
import PasswordModal from './PasswordModal';
import RowActions from './RowActions';
import UserModal from './UserModal';

const NOTICE_MS = 3000;

type Dialog = { kind: 'user'; user: AdminUser | null } | { kind: 'password'; user: AdminUser } | null;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const COLUMNS: DataTableColumn<AdminUser>[] = [
  {
    key: 'full_name', header: 'Usuario', accessor: (u) => u.full_name, sortable: true,
    render: (u) => (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-full text-white font-semibold">
          {u.full_name.charAt(0).toUpperCase()}
        </div>
        <span className="font-medium text-slate-800">{u.full_name}</span>
      </div>
    ),
  },
  { key: 'email', header: 'Correo', accessor: (u) => u.email, sortable: true },
  { key: 'role_name', header: 'Rol', accessor: (u) => u.role_name ?? 'Sin rol', filterable: true,
    render: (u) => <Badge>{u.role_name ?? 'Sin rol'}</Badge> },
  { key: 'scopes', header: 'Alcance', accessor: (u) => u.scopes.map(describeScope).join(', ') || 'Sin alcance' },
  { key: 'status', header: 'Estado', accessor: (u) => (u.status === 'active' ? 'Activo' : 'Inactivo'), filterable: true,
    render: (u) => <Badge variant={u.status === 'active' ? 'success' : 'default'}>{u.status === 'active' ? 'Activo' : 'Inactivo'}</Badge> },
  { key: 'created_at', header: 'Creado', accessor: (u) => u.created_at, sortable: true, render: (u) => formatDate(u.created_at) },
];

export default function UsersTab() {
  const { appUser } = useAuth();
  const { users, stats, loading, error, reload } = useAdminUsers();
  const { roles } = useAdminRoles();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  const flash = (message: NoticeMessage) => {
    setNotice(message);
    setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const handleSaved = (text: string) => {
    setDialog(null);
    flash({ type: 'success', text });
    void reload();
  };

  const handleDelete = async (user: AdminUser) => {
    try {
      await deleteUser(user.id);
      handleSaved(`Usuario ${user.full_name} eliminado`);
    } catch (err) {
      flash({ type: 'error', text: (err as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <Notice message={notice ?? (error ? { type: 'error', text: error } : null)} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Usuarios" value={stats.total} icon="ri-user-line" color="blue" />
        <StatCard title="Usuarios Activos" value={stats.active} icon="ri-checkbox-circle-line" color="emerald" />
        <StatCard title="Usuarios Inactivos" value={stats.inactive} icon="ri-close-circle-line" color="amber" />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => setDialog({ kind: 'user', user: null })} disabled={roles.length === 0}>
          <i className="ri-add-line"></i>
          <span>Nuevo Usuario</span>
        </Button>
      </div>
      <DataTable
        data={users}
        columns={COLUMNS}
        getRowId={(u) => u.id}
        loading={loading}
        searchPlaceholder="Buscar por nombre o correo..."
        exportFileName="usuarios"
        emptyMessage="No se encontraron usuarios"
        actions={(user) => (
          <RowActions
            onEdit={() => setDialog({ kind: 'user', user })}
            onDelete={() => void handleDelete(user)}
            extra={[{ icon: 'ri-lock-password-line', title: 'Cambiar contraseña', onClick: () => setDialog({ kind: 'password', user }) }]}
            canDelete={user.id !== appUser?.id}
          />
        )}
      />
      {dialog?.kind === 'user' && (
        <UserModal user={dialog.user} roles={roles} onClose={() => setDialog(null)} onSaved={handleSaved} />
      )}
      {dialog?.kind === 'password' && (
        <PasswordModal user={dialog.user} onClose={() => setDialog(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
