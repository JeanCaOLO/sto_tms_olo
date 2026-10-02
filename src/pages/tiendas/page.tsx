import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, apiFetch } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import DeliveryPointModal, { type DeliveryPointForm } from './components/DeliveryPointModal';
import { buildDeliveryPointRequest } from './delivery-point-payload';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

interface DeliveryPoint {
  id: string;
  external_code: string;
  name: string;
  route_code: string | null;
  wms_zone_code: string | null;
  active: boolean;
  is_default: boolean;
  delivery_instructions: string | null;
  final_customer: {
    external_code: string;
    name: string;
    customer: { id: string; code: string; name: string } | null;
  } | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
    geocoding_status: string | null;
  } | null;
  zone: { id: string; code: string; name: string } | null;
}

const GEO_CONFIG: Record<string, { key: string; variant: 'success' | 'warning' | 'danger' }> = {
  OK: { key: 'deliveryPoints.geoOk', variant: 'success' },
  PENDING: { key: 'deliveryPoints.geoPending', variant: 'warning' },
  FAILED: { key: 'deliveryPoints.geoFailed', variant: 'danger' },
};

const LIST_SELECT =
  'id,external_code,name,route_code,wms_zone_code,active,is_default,delivery_instructions,' +
  'final_customer:final_customers(external_code,name,customer:customers(id,code,name)),' +
  'address:addresses(line1,line2,city,state,latitude,longitude,geocoding_status),' +
  'zone:zones(id,code,name)';

export default function TiendasPage() {
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<DeliveryPoint | null>(null);
  const [pointToDelete, setPointToDelete] = useState<DeliveryPoint | null>(null);
  const [saveError, setSaveError] = useState<string>('');
  const { canCreate, canEdit, canDelete } = useModulePermissions('puntos_entrega');
  const { t } = useTranslation();

  useEffect(() => { fetchPoints(); }, []);

  const fetchPoints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('delivery_points')
      .select(LIST_SELECT)
      .order('name', { ascending: true });
    if (!error) setPoints((data as DeliveryPoint[]) || []);
    setLoading(false);
  };

  const handleSavePoint = async (form: DeliveryPointForm) => {
    setSaveError('');
    const { method, path, body: payload } = buildDeliveryPointRequest(form);
    const { ok, body } = await apiFetch(path, { method, body: JSON.stringify(payload) });
    if (!ok) {
      setSaveError(body?.error?.message ?? 'No se pudo guardar el punto de entrega');
      return;
    }
    await fetchPoints();
    setIsModalOpen(false);
    setSelectedPoint(null);
  };

  const handleDeletePoint = async () => {
    if (!pointToDelete) return;
    const { ok, body } = await apiFetch(`/v1/delivery-points/${pointToDelete.id}`, { method: 'DELETE' });
    if (!ok) {
      setSaveError(body?.error?.message ?? 'No se pudo eliminar el punto de entrega');
      return;
    }
    await fetchPoints();
    setIsDeleteModalOpen(false);
    setPointToDelete(null);
  };

  const openNew = () => { setSelectedPoint(null); setSaveError(''); setIsModalOpen(true); };
  const openEdit = (p: DeliveryPoint) => { setSelectedPoint(p); setSaveError(''); setIsModalOpen(true); };
  const openDelete = (p: DeliveryPoint) => { setPointToDelete(p); setIsDeleteModalOpen(true); };

  const customerNames = new Set(points.map(p => p.final_customer?.customer?.name).filter(Boolean));
  const activeCount = points.filter(p => p.active).length;
  const geocodedCount = points.filter(p => p.address?.geocoding_status === 'OK').length;

  const columns: DataTableColumn<DeliveryPoint>[] = [
    {
      key: 'name',
      header: t('deliveryPoints.colPoint'),
      accessor: (p) => p.name,
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50">
            <i className="ri-map-pin-2-line text-lg text-teal-600"></i>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-900 text-sm">{p.name}</span>
              {p.is_default && (
                <span className="inline-flex items-center gap-0.5 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                  <i className="ri-star-fill text-xs"></i> {t('deliveryPoints.default')}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono">{p.external_code}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: t('deliveryPoints.colCustomer'),
      accessor: (p) => p.final_customer?.customer?.name ?? '',
      sortable: true,
      filterable: true,
      render: (p) => {
        const customer = p.final_customer?.customer;
        return customer ? (
          <div>
            <div className="text-sm font-medium text-slate-700">{customer.name}</div>
            <div className="text-xs text-slate-400 font-mono">{customer.code}</div>
          </div>
        ) : <span className="text-slate-300 text-sm">—</span>;
      },
    },
    {
      key: 'zone',
      header: t('deliveryPoints.colZone'),
      accessor: (p) => p.zone?.name ?? '',
      sortable: true,
      filterable: true,
      render: (p) => (
        <>
          <div className="text-sm text-slate-700">{p.zone?.name ?? <span className="text-slate-300">—</span>}</div>
          {p.route_code && <div className="text-xs text-slate-400">{p.route_code}</div>}
        </>
      ),
    },
    {
      key: 'address',
      header: t('deliveryPoints.colAddress'),
      accessor: (p) => p.address?.line1 ?? '',
      render: (p) => (
        <>
          <div className="text-sm text-slate-700 truncate max-w-[220px]">
            {p.address?.line1 || <span className="text-slate-300">—</span>}
          </div>
          {(p.address?.city || p.address?.state) && (
            <div className="text-xs text-slate-400">{[p.address?.city, p.address?.state].filter(Boolean).join(', ')}</div>
          )}
        </>
      ),
    },
    {
      key: 'geocoding',
      header: t('deliveryPoints.colGeocoding'),
      accessor: (p) => p.address?.geocoding_status ?? '',
      filterable: true,
      render: (p) => {
        const status = p.address?.geocoding_status ?? '';
        const conf = GEO_CONFIG[status];
        return conf
          ? <Badge variant={conf.variant} size="sm">{t(conf.key)}</Badge>
          : <span className="text-slate-300 text-sm">—</span>;
      },
    },
    {
      key: 'active',
      header: t('deliveryPoints.colStatus'),
      accessor: (p) => (p.active ? t('deliveryPoints.active') : t('deliveryPoints.inactive')),
      filterable: true,
      render: (p) => (
        <Badge variant={p.active ? 'success' : 'danger'} size="sm">
          {p.active ? t('deliveryPoints.active') : t('deliveryPoints.inactive')}
        </Badge>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-2 text-slate-600 text-sm">{t('deliveryPoints.title')}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('deliveryPoints.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('deliveryPoints.subtitle')}</p>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={openNew} icon={<i className="ri-add-line"></i>}>
            {t('deliveryPoints.new')}
          </Button>
        )}
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <i className="ri-error-warning-line"></i>{saveError}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('deliveryPoints.kpiTotal'), value: points.length, icon: 'ri-map-pin-2-line', color: 'bg-teal-50 text-teal-600', border: 'border-teal-100' },
          { label: t('deliveryPoints.kpiActive'), value: activeCount, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
          { label: t('deliveryPoints.kpiCustomers'), value: customerNames.size, icon: 'ri-building-line', color: 'bg-violet-50 text-violet-600', border: 'border-violet-100' },
          { label: t('deliveryPoints.kpiGeocoded'), value: geocodedCount, icon: 'ri-map-pin-user-line', color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
        ].map((kpi) => (
          <div key={kpi.label} className={`bg-white rounded-xl border ${kpi.border} p-4 flex items-center gap-4`}>
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
        data={points}
        columns={columns}
        getRowId={(p) => p.id}
        searchPlaceholder={t('deliveryPoints.search')}
        exportFileName="puntos_de_entrega"
        emptyMessage={t('deliveryPoints.empty')}
        pageSize={25}
        actions={(canEdit || canDelete) ? (p) => (
          <>
            {canEdit && (
              <button
                onClick={() => openEdit(p)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                title="Editar"
              >
                <i className="ri-edit-line"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => openDelete(p)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            )}
          </>
        ) : undefined}
      />

      <DeliveryPointModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedPoint(null); }}
        onSave={handleSavePoint}
        point={selectedPoint}
        error={saveError}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setPointToDelete(null); }}
        onConfirm={handleDeletePoint}
        title="Eliminar Punto de Entrega"
        description={`¿Estás seguro de que deseas eliminar el punto de entrega "${pointToDelete?.name}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
