import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import ZonaModal from './components/ZonaModal';
import DeleteConfirmModal from '../paises/components/DeleteConfirmModal';

interface Zona {
  id: string;
  code: string | null;
  name: string;
  country_id: string | null;
  status: string;
  country?: { name: string };
}

// Catálogo de Zonas. Tabla `zones` (antes `route_types`, renombrada por backend
// en sql/09); una zona pertenece a un país. Reemplaza al antiguo catálogo de
// "Rutas" (la entidad operativa `routes` = VIAJES sigue viva para planificación
// / tracking / liquidaciones / guías, pero no se gestiona desde este catálogo).
export default function ZonasPage() {
  const { appUser } = useAuth();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Zona | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Zona | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (appUser?.organization_id) load();
  }, [appUser?.organization_id]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('zones')
        .select('*, country:countries(name)')
        .eq('organization_id', appUser?.organization_id)
        .order('name');
      if (data) setZonas(data);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleteError('');
    const { error } = await supabase.from('zones').delete().eq('id', toDelete.id);
    if (error) {
      if (error.code === '23503' || (error as { status?: number }).status === 409) {
        setDeleteError('No se puede eliminar esta zona porque tiene registros asociados (pedidos o viajes). Reasigná esos registros primero.');
        return;
      }
      setDeleteError('Ocurrió un error al eliminar la zona.');
      return;
    }
    await load();
    setIsDeleteOpen(false);
    setToDelete(null);
  };

  const activas = zonas.filter((z) => z.status === 'active').length;

  const columns: DataTableColumn<Zona>[] = [
    {
      key: 'name',
      header: 'Zona',
      accessor: (z) => z.name,
      sortable: true,
      render: (z) => (
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg mr-3">
            <i className="ri-map-2-line text-teal-600 text-lg"></i>
          </div>
          <div>
            <div className="font-medium text-slate-900">{z.name}</div>
            {z.code && <div className="text-xs text-slate-400 font-mono">{z.code}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'País',
      accessor: (z) => z.country?.name ?? '',
      sortable: true,
      filterable: true,
      render: (z) => <span className="text-sm text-slate-700">{z.country?.name || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (z) => (z.status === 'active' ? 'Activo' : 'Inactivo'),
      filterable: true,
      render: (z) => <Badge variant={z.status === 'active' ? 'success' : 'default'}>{z.status === 'active' ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de Zonas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Zonas de entrega por país de tu red logística</p>
        </div>
        <Button onClick={() => { setSelected(null); setIsModalOpen(true); }} icon={<i className="ri-add-line"></i>}>
          Nueva Zona
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Zonas', value: zonas.length, icon: 'ri-map-2-line', color: 'bg-teal-50 text-teal-600' },
          { label: 'Activas', value: activas, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Inactivas', value: zonas.length - activas, icon: 'ri-close-circle-line', color: 'bg-red-50 text-red-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-4">
            <div className={`w-11 h-11 flex items-center justify-center rounded-lg ${kpi.color}`}>
              <i className={`${kpi.icon} text-xl`}></i>
            </div>
            <div>
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <DataTable
        data={zonas}
        columns={columns}
        getRowId={(z) => z.id}
        searchPlaceholder="Buscar zona..."
        exportFileName="zonas"
        emptyMessage="No hay zonas"
        actions={(z) => (
          <>
            <button
              onClick={() => { setSelected(z); setIsModalOpen(true); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
              title="Editar"
            >
              <i className="ri-edit-line"></i>
            </button>
            <button
              onClick={() => { setToDelete(z); setDeleteError(''); setIsDeleteOpen(true); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="Eliminar"
            >
              <i className="ri-delete-bin-line"></i>
            </button>
          </>
        )}
      />

      <ZonaModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelected(null); }}
        onSuccess={load}
        zona={selected}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => { setIsDeleteOpen(false); setToDelete(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Eliminar Zona"
        description={`¿Seguro que deseas eliminar la zona "${toDelete?.name}"? Esta acción no se puede deshacer.`}
        errorMessage={deleteError}
      />
    </div>
  );
}
