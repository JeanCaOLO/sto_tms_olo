import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, apiFetch } from '../../lib/supabase';
import { useOperationalContext } from '../../hooks/useOperationalContext';
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
  contact_phone: string | null;
  zone_source: string | null;
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

// Origen de la zona del punto (delivery_points.zone_source, sql/34).
const ZONE_SOURCE_CONFIG: Record<string, { key: string; variant: 'default' | 'info' | 'warning' }> = {
  map: { key: 'deliveryPoints.zoneAuto', variant: 'info' },
  manual: { key: 'deliveryPoints.zoneManual', variant: 'warning' },
  wms: { key: 'deliveryPoints.zoneWms', variant: 'default' },
};

const LIST_SELECT =
  'id,external_code,name,route_code,wms_zone_code,active,is_default,delivery_instructions,contact_phone,zone_source,' +
  'final_customer:final_customers(external_code,name,customer:customers(id,code,name)),' +
  'address:addresses(line1,line2,city,state,latitude,longitude,geocoding_status),' +
  'zone:zones(id,code,name)';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function TiendasPage() {
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); // 1-based
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<DeliveryPoint | null>(null);
  const [pointToDelete, setPointToDelete] = useState<DeliveryPoint | null>(null);
  const [saveError, setSaveError] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [zones, setZones] = useState<{ id: string; code: string | null; name: string }[]>([]);
  const { canCreate, canEdit, canDelete } = useModulePermissions('puntos_entrega');
  const { selectedCountryId, selectedWarehouseId, selectedCustomerId } = useOperationalContext();
  const { t } = useTranslation();

  // Zonas para el filtro (se recargan al cambiar de país del contexto).
  useEffect(() => {
    let q = supabase.from('zones').select('id,code,name').eq('status', 'active').order('name');
    if (selectedCountryId) q = q.eq('country_id', selectedCountryId);
    q.then(({ data }) => setZones(data || []));
  }, [selectedCountryId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Búsqueda server-side con debounce (300ms): no busca en memoria sobre la
  // página, manda ilike("name|external_code") al backend.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Cualquier cambio de filtro/contexto/búsqueda vuelve a la página 1.
  useEffect(() => {
    setPage(1);
  }, [selectedCountryId, selectedWarehouseId, selectedCustomerId, zoneFilter, debouncedSearch, pageSize]);

  // Paginación + filtros SERVIDOR: trae solo la página pedida (offset+limit) ya
  // filtrada por país → almacén → cliente (contexto global) y búsqueda. Antes
  // traía los ~10k puntos de una vez y filtraba/paginaba en memoria.
  // `count: 'exact'` da el total (ya filtrado) sin paginar para pintar "X de N".
  useEffect(() => { fetchPoints(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize, selectedCountryId, selectedWarehouseId, selectedCustomerId, zoneFilter, debouncedSearch]);

  // Cada pedido lleva un número: si llega una respuesta vieja (p. ej. la de la página anterior
  // al cambiar un filtro), se descarta para no pisar la más reciente.
  const lastRequest = useRef(0);

  const fetchPoints = async () => {
    const request = ++lastRequest.current;
    setLoading(true);
    const from = (page - 1) * pageSize;
    // Columnas de filtro por tabla padre (contrato de Claude, canal 2026-10-12):
    // usan el NOMBRE de la tabla, no el alias del embed.
    let q = supabase
      .from('delivery_points')
      .select(LIST_SELECT, { count: 'exact' })
      .order('name', { ascending: true });
    if (selectedCountryId) q = q.eq('final_customers.customers.country_id', selectedCountryId);
    if (selectedWarehouseId) q = q.eq('final_customers.customers.warehouse_id', selectedWarehouseId);
    if (selectedCustomerId) q = q.eq('final_customers.customer_id', selectedCustomerId);
    if (zoneFilter) q = q.eq('zone_id', zoneFilter);
    if (debouncedSearch) q = q.ilike('name|external_code', `%${debouncedSearch}%`);
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (request !== lastRequest.current) return;
    if (!error) {
      setPoints((data as DeliveryPoint[]) || []);
      if (typeof count === 'number') setTotal(count);
    }
    setLoading(false);
  };

  const goToPage = (p: number) => {
    if (Number.isNaN(p)) return;
    setPage(Math.min(Math.max(1, Math.trunc(p)), totalPages));
  };
  const changePageSize = (n: number) => { setPageSize(n); setPage(1); };

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

  // Con paginación servidor, `points` es solo la página actual. El total real
  // viene de `count`; los demás conteos se muestran "en esta página" para no
  // mentir (un total server-side de activos/geocodificados exige endpoints de
  // conteo que hoy no existen — ver canal 2026-10-12).
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
      render: (p) => {
        const src = p.zone_source;
        const srcConf = src && ZONE_SOURCE_CONFIG[src];
        return (
          <>
            <div className="text-sm text-slate-700">{p.zone?.name ?? <span className="text-slate-300">—</span>}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {srcConf && <Badge variant={srcConf.variant} size="sm">{t(srcConf.key)}</Badge>}
              {p.route_code && <span className="text-xs text-slate-400">{p.route_code}</span>}
            </div>
          </>
        );
      },
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
      render: (p) => (
        <Badge variant={p.active ? 'success' : 'danger'} size="sm">
          {p.active ? t('deliveryPoints.active') : t('deliveryPoints.inactive')}
        </Badge>
      ),
    },
  ];

  // Spinner de pantalla completa solo en la primera carga; al cambiar de página
  // el DataTable muestra su propio loading sin hacer parpadear KPIs y controles.
  if (loading && points.length === 0 && total === 0) {
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
        <div className="flex items-center gap-3">
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            aria-label={t('deliveryPoints.filterZone')}
          >
            <option value="">{t('deliveryPoints.allZones')}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}{z.code ? ` (${z.code})` : ''}</option>
            ))}
          </select>
          <div className="relative min-w-[240px]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400">
              <i className="ri-search-line text-sm"></i>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('deliveryPoints.search')}
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          {canCreate && (
            <Button variant="primary" onClick={openNew} icon={<i className="ri-add-line"></i>}>
              {t('deliveryPoints.new')}
            </Button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <i className="ri-error-warning-line"></i>{saveError}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('deliveryPoints.kpiTotal'), value: total, icon: 'ri-map-pin-2-line', color: 'bg-teal-50 text-teal-600', border: 'border-teal-100' },
          { label: `${t('deliveryPoints.kpiActive')} (${t('deliveryPoints.inThisPage')})`, value: activeCount, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
          { label: `${t('deliveryPoints.kpiCustomers')} (${t('deliveryPoints.inThisPage')})`, value: customerNames.size, icon: 'ri-building-line', color: 'bg-violet-50 text-violet-600', border: 'border-violet-100' },
          { label: `${t('deliveryPoints.kpiGeocoded')} (${t('deliveryPoints.inThisPage')})`, value: geocodedCount, icon: 'ri-map-pin-user-line', color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
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
        hideSearch
        exportFileName="puntos_de_entrega"
        emptyMessage={t('deliveryPoints.empty')}
        loading={loading}
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

      {/* Paginación servidor: navega por páginas pidiendo cada una al backend. */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 px-1 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>{t('table.rowsPerPage')}</span>
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
              aria-label={t('table.rowsPerPage')}
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-slate-400">· {t('table.records', { count: total })}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {t('table.of')} {total}
            </span>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label={t('table.page') + ' anterior'}
            >
              <i className="ri-arrow-left-s-line"></i>
            </button>
            <div className="flex items-center gap-1.5">
              <span>{t('table.page')}</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={page}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="w-14 px-2 py-1 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label={t('table.page')}
              />
              <span>{t('table.of')} {totalPages}</span>
            </div>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label={t('table.page') + ' siguiente'}
            >
              <i className="ri-arrow-right-s-line"></i>
            </button>
          </div>
        </div>
      )}

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
