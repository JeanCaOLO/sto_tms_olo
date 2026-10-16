import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Select from '../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import ZonaModal from './components/ZonaModal';
import ZoneMap, { type GeoJSONGeometry, type ZoneShape } from './components/ZoneMap';
import DeleteConfirmModal from '../paises/components/DeleteConfirmModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

interface Zona {
  id: string;
  code: string | null;
  name: string;
  country_id: string | null;
  status: string;
  color: string | null;
  geofence: GeoJSONGeometry | null;
  country?: { name: string };
}

// Catálogo de Zonas con MAPA. Tabla `zones` (sql/09 + geocerca sql/34). Cada
// zona pertenece a un país y tiene una geocerca (polígono) que se dibuja sobre
// el mapa; los puntos de entrega caen solos en la zona que los contiene (lo
// resuelven triggers de la BD). `routes` = VIAJES sigue viva, no se gestiona acá.
export default function ZonasPage() {
  const { appUser } = useAuth();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [pointCounts, setPointCounts] = useState<Record<string, number>>({});
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Zona | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Zona | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  // Las zonas dadas de baja (p. ej. GAM/RURAL, sql/36) no se borran por el histórico: se ocultan por defecto.
  const [showInactive, setShowInactive] = useState(false);
  const { canCreate, canEdit, canDelete } = useModulePermissions('zonas');
  const { t } = useTranslation();

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
      if (data) {
        setZonas(data);
        loadPointCounts(data as Zona[]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Conteo de puntos por zona: un head-count por zona.
  // ponytail: O(nº de zonas) queries (hoy ~17 CR + pocas VE). Si crece mucho,
  // pedir a Claude un endpoint de conteo por país (ofrecido en el canal).
  const loadPointCounts = async (zs: Zona[]) => {
    const entries = await Promise.all(
      zs.map(async (z) => {
        const { count } = await supabase
          .from('delivery_points')
          .select('id', { count: 'exact', head: true })
          .eq('zone_id', z.id);
        return [z.id, count ?? 0] as const;
      }),
    );
    setPointCounts(Object.fromEntries(entries));
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleteError('');
    const { error } = await supabase.from('zones').delete().eq('id', toDelete.id);
    if (error) {
      if (error.code === '23503' || (error as { status?: number }).status === 409) {
        setDeleteError(t('zones.errInUse'));
        return;
      }
      setDeleteError(t('zones.errSave'));
      return;
    }
    await load();
    setIsDeleteOpen(false);
    setToDelete(null);
  };

  // País elegido para el mapa; por defecto el primero con zonas.
  const countries = useMemo(() => {
    const map = new Map<string, string>();
    zonas.forEach((z) => { if (z.country_id) map.set(z.country_id, z.country?.name ?? z.country_id); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [zonas]);

  const effectiveCountry = countryFilter || countries[0]?.id || '';
  const countryName = countries.find((c) => c.id === effectiveCountry)?.name ?? null;

  const visibleZonas = useMemo(
    () => zonas.filter((z) => (!effectiveCountry || z.country_id === effectiveCountry)
      && (showInactive || z.status === 'active')),
    [zonas, effectiveCountry, showInactive],
  );

  const mapShapes: ZoneShape[] = useMemo(
    () => visibleZonas.filter((z) => z.status === 'active').map((z) => ({ id: z.id, name: z.name, color: z.color, geofence: z.geofence })),
    [visibleZonas],
  );

  const activas = zonas.filter((z) => z.status === 'active').length;
  const withFence = zonas.filter((z) => z.geofence).length;

  const columns: DataTableColumn<Zona>[] = [
    {
      key: 'name',
      header: t('zones.colZone'),
      accessor: (z) => z.name,
      sortable: true,
      render: (z) => (
        <div className="flex items-center">
          <span className="w-4 h-4 rounded mr-3 border border-slate-200" style={{ backgroundColor: z.color || '#cbd5e1' }} />
          <div>
            <div className="font-medium text-slate-900">{z.name}</div>
            {z.code && <div className="text-xs text-slate-400 font-mono">{z.code}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'country',
      header: t('zones.colCountry'),
      accessor: (z) => z.country?.name ?? '',
      sortable: true,
      render: (z) => <span className="text-sm text-slate-700">{z.country?.name || '—'}</span>,
    },
    {
      key: 'fence',
      header: t('zones.colFence'),
      accessor: (z) => (z.geofence ? t('zones.hasFence') : t('zones.noFence')),
      render: (z) => (
        <Badge variant={z.geofence ? 'success' : 'default'}>{z.geofence ? t('zones.hasFence') : t('zones.noFence')}</Badge>
      ),
    },
    {
      key: 'points',
      header: t('zones.colPoints'),
      accessor: (z) => pointCounts[z.id] ?? 0,
      sortable: true,
      align: 'right',
      render: (z) => <span className="text-sm text-slate-700 tabular-nums">{pointCounts[z.id] ?? '—'}</span>,
    },
    {
      key: 'status',
      header: t('zones.colStatus'),
      accessor: (z) => (z.status === 'active' ? t('zones.active') : t('zones.inactive')),
      render: (z) => <Badge variant={z.status === 'active' ? 'success' : 'default'}>{z.status === 'active' ? t('zones.active') : t('zones.inactive')}</Badge>,
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
          <h1 className="text-2xl font-bold text-slate-900">{t('zones.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('zones.subtitle')}</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setSelected(null); setIsModalOpen(true); }} icon={<i className="ri-add-line"></i>}>
            {t('zones.new')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('zones.kpiTotal'), value: zonas.length, icon: 'ri-map-2-line', color: 'bg-teal-50 text-teal-600' },
          { label: t('zones.kpiActive'), value: activas, icon: 'ri-checkbox-circle-line', color: 'bg-emerald-50 text-emerald-600' },
          { label: t('zones.kpiWithFence'), value: withFence, icon: 'ri-shape-line', color: 'bg-sky-50 text-sky-600' },
          { label: t('zones.kpiInactive'), value: zonas.length - activas, icon: 'ri-close-circle-line', color: 'bg-red-50 text-red-600' },
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

      {/* Mapa panorámico de las zonas del país seleccionado (colapsable) */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            aria-expanded={mapOpen}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-teal-700 cursor-pointer"
          >
            <i className={`${mapOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-base`}></i>
            {t('zones.mapCaption')}
          </button>
          {mapOpen && (
            <div className="w-48">
              <Select
                label=""
                value={effectiveCountry}
                onChange={(e) => setCountryFilter(e.target.value)}
                options={countries.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          )}
        </div>
        {mapOpen && (
          effectiveCountry ? (
            <ZoneMap shapes={mapShapes} countryName={countryName} highlightId={highlightId} className="h-[420px] w-full rounded-lg border border-slate-200" />
          ) : (
            <div className="h-[420px] flex items-center justify-center text-slate-400 text-sm">{t('zones.empty')}</div>
          )
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        {t('zones.showInactive')}
      </label>

      <DataTable
        data={visibleZonas}
        columns={columns}
        getRowId={(z) => z.id}
        searchPlaceholder={t('zones.search')}
        exportFileName="zonas"
        emptyMessage={t('zones.empty')}
        onRowClick={(z) => setHighlightId(z.id)}
        actions={(canEdit || canDelete) ? (z) => (
          <>
            {canEdit && (
              <button
                onClick={() => { setSelected(z); setIsModalOpen(true); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                title="Editar"
              >
                <i className="ri-edit-line"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { setToDelete(z); setDeleteError(''); setIsDeleteOpen(true); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            )}
          </>
        ) : undefined}
      />

      <ZonaModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelected(null); }}
        onSuccess={load}
        zona={selected}
        siblings={zonas
          .filter((z) => z.country_id === (selected?.country_id ?? effectiveCountry))
          .map((z) => ({ id: z.id, name: z.name, color: z.color, geofence: z.geofence }))}
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
