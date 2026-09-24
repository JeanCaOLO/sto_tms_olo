import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import LicenciaModal from './components/LicenciaModal';
import DeleteConfirmModal from '../paises/components/DeleteConfirmModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

interface Licencia {
  id: string;
  code: string;
  name: string;
  orden: number;
  activo: boolean;
  country_id: string | null;
  country?: { name: string };
}

// Catálogo de Licencias de Conducir (`driver_license_types`). Es el catálogo
// que alimenta el select "Tipo de Licencia" del formulario de Conductores.
export default function LicenciasPage() {
  const { appUser } = useAuth();
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Licencia | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Licencia | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const { canCreate, canEdit, canDelete } = useModulePermissions('licencias');
  const { t } = useTranslation();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('driver_license_types')
        .select('*, country:countries(name)')
        .order('orden');
      if (data) setLicencias(data);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleteError('');
    const { error } = await supabase.from('driver_license_types').delete().eq('id', toDelete.id);
    if (error) {
      if (error.code === '23503') {
        setDeleteError('No se puede eliminar esta licencia porque hay conductores que la usan. Reasigná esos conductores primero.');
        return;
      }
      setDeleteError('Ocurrió un error al eliminar la licencia.');
      return;
    }
    await load();
    setIsDeleteOpen(false);
    setToDelete(null);
  };

  const activas = licencias.filter((l) => l.activo).length;

  const columns: DataTableColumn<Licencia>[] = [
    {
      key: 'code',
      header: t('licenses.colCode'),
      accessor: (l) => l.code,
      sortable: true,
      render: (l) => (
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center bg-teal-100 rounded-lg mr-3">
            <i className="ri-bank-card-line text-teal-600 text-lg"></i>
          </div>
          <span className="font-mono font-semibold text-slate-900">{l.code}</span>
        </div>
      ),
    },
    { key: 'name', header: t('licenses.colName'), accessor: (l) => l.name, sortable: true },
    {
      key: 'country',
      header: t('licenses.colCountry'),
      accessor: (l) => l.country?.name ?? '',
      sortable: true,
      filterable: true,
      render: (l) => <span className="text-sm text-slate-700">{l.country?.name || '—'}</span>,
    },
    {
      key: 'activo',
      header: t('licenses.colStatus'),
      accessor: (l) => (l.activo ? t('licenses.active') : t('licenses.inactive')),
      filterable: true,
      render: (l) => <Badge variant={l.activo ? 'success' : 'default'}>{l.activo ? t('licenses.active') : t('licenses.inactive')}</Badge>,
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
          <h1 className="text-2xl font-bold text-slate-900">{t('licenses.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('licenses.subtitle')}</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setSelected(null); setIsModalOpen(true); }} icon={<i className="ri-add-line"></i>}>
            {t('licenses.new')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: t('licenses.kpiTotal'), value: licencias.length, icon: 'ri-bank-card-line', color: 'bg-teal-50 text-teal-600' },
          { label: t('licenses.kpiActive'), value: activas, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600' },
          { label: t('licenses.kpiInactive'), value: licencias.length - activas, icon: 'ri-close-circle-line', color: 'bg-red-50 text-red-600' },
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
        data={licencias}
        columns={columns}
        getRowId={(l) => l.id}
        searchPlaceholder={t('licenses.search')}
        exportFileName="licencias"
        emptyMessage={t('licenses.empty')}
        actions={(canEdit || canDelete) ? (l) => (
          <>
            {canEdit && (
              <button
                onClick={() => { setSelected(l); setIsModalOpen(true); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                title="Editar"
              >
                <i className="ri-edit-line"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { setToDelete(l); setDeleteError(''); setIsDeleteOpen(true); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            )}
          </>
        ) : undefined}
      />

      <LicenciaModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelected(null); }}
        onSuccess={load}
        licencia={selected}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => { setIsDeleteOpen(false); setToDelete(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Eliminar Licencia"
        description={`¿Seguro que deseas eliminar la licencia "${toDelete?.name}"? Esta acción no se puede deshacer.`}
        errorMessage={deleteError}
      />
    </div>
  );
}
