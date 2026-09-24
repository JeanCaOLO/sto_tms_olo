import { useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import StatCard from '../../../components/feature/StatCard';
import { deleteRole, type AdminRole } from '../admin/admin-api';
import { useAdminRoles } from '../admin/use-admin-roles';
import Notice, { type NoticeMessage } from './Notice';
import RoleModal from './RoleModal';
import PermissionsModal from './PermissionsModal';
import RowActions from './RowActions';

const NOTICE_MS = 3000;

type Dialog = { role: AdminRole | null } | null;

const COLUMNS: DataTableColumn<AdminRole>[] = [
  {
    key: 'name', header: 'Rol', accessor: (r) => r.name, sortable: true,
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
    key: 'description', header: 'Descripción', accessor: (r) => r.description ?? '',
    render: (r) => (r.description
      ? <span className="text-slate-600">{r.description}</span>
      : <span className="text-slate-400 italic">Sin descripción</span>),
  },
  {
    key: 'user_count', header: 'Usuarios', accessor: (r) => r.user_count, sortable: true,
    render: (r) => <Badge variant={r.user_count ? 'info' : 'default'}>{r.user_count} usuario{r.user_count === 1 ? '' : 's'}</Badge>,
  },
];

export default function RolesTab() {
  const { roles, loading, error, reload } = useAdminRoles();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [permsRole, setPermsRole] = useState<AdminRole | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const totalUsers = roles.reduce((sum, role) => sum + role.user_count, 0);

  const flash = (message: NoticeMessage) => {
    setNotice(message);
    setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const handleSaved = (text: string) => {
    setDialog(null);
    flash({ type: 'success', text });
    void reload();
  };

  const handleDelete = async (role: AdminRole) => {
    try {
      await deleteRole(role.id);
      handleSaved(`Rol ${role.name} eliminado`);
    } catch (err) {
      flash({ type: 'error', text: (err as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <Notice message={notice ?? (error ? { type: 'error', text: error } : null)} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total de Roles" value={roles.length} icon="ri-shield-user-line" color="teal" />
        <StatCard title="Usuarios con rol" value={totalUsers} icon="ri-user-line" color="blue" />
        <StatCard title="Roles sin usuarios" value={roles.filter((r) => !r.user_count).length} icon="ri-user-unfollow-line" color="amber" />
      </div>
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Gestión de Roles</h2>
            <p className="text-sm text-slate-500 mt-1">Un rol asignado a usuarios no se puede eliminar</p>
          </div>
          <Button onClick={() => setDialog({ role: null })}>
            <i className="ri-add-line"></i>
            <span>Nuevo Rol</span>
          </Button>
        </div>
      </Card>
      <DataTable
        data={roles}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        loading={loading}
        searchPlaceholder="Buscar rol..."
        exportFileName="roles"
        emptyMessage="No hay roles registrados"
        actions={(role) => (
          <RowActions
            onEdit={() => setDialog({ role })}
            onDelete={() => void handleDelete(role)}
            canDelete={role.user_count === 0}
            extra={[{ icon: 'ri-shield-keyhole-line', title: 'Permisos', onClick: () => setPermsRole(role) }]}
          />
        )}
      />
      {dialog && <RoleModal role={dialog.role} onClose={() => setDialog(null)} onSaved={handleSaved} />}
      {permsRole && (
        <PermissionsModal
          role={permsRole}
          onClose={() => setPermsRole(null)}
          onSaved={(text) => { setPermsRole(null); flash({ type: 'success', text }); }}
        />
      )}
    </div>
  );
}
