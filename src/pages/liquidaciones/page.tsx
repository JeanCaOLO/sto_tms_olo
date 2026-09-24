import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import SettlementModal from './components/SettlementModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import {
  deleteSnapshot, listSnapshots, type SettlementSnapshot,
} from '../../lib/tarifas/localData/settlementSnapshots';

const MARGIN_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  OK: 'success', WARN: 'warning', CRITICAL: 'danger', LOSS: 'danger',
};
const MARGIN_STATUS_LABEL: Record<string, string> = {
  OK: 'OK', WARN: 'Atención', CRITICAL: 'Crítico', LOSS: 'Pérdida',
};

const APPROVAL_STATUSES = ['Aprobado', 'Pagado'];

// Mismo mapeo de color que usan los badges del resto de la app, pero como clases para un
// `<select>` inline — permite cambiar el estado directo desde la fila (sin abrir "Editar"), igual
// que la columna de estado de `ProformaTable.tsx` en prototipoTarifador.
const STATUS_SELECT_CLASSES: Record<string, string> = {
  'Borrador': 'bg-slate-100 text-slate-700',
  'En Revisión': 'bg-amber-100 text-amber-700',
  'Aprobado': 'bg-emerald-100 text-emerald-700',
  'Pagado': 'bg-teal-100 text-teal-700',
  'Rechazado': 'bg-red-100 text-red-700',
};

export default function LiquidacionesPage() {
  const { appUser } = useAuth();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas');

  // Filtros que no calzan bien en el filtro de columna estilo Excel (rangos / fuente externa)
  const [marginFilter, setMarginFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Snapshot de margen/costo por liquidación — ver src/lib/tarifas/localData/settlementSnapshots.ts
  const [snapshotsBySettlementId, setSnapshotsBySettlementId] = useState<Record<string, SettlementSnapshot>>({});

  // KPIs
  const [kpis, setKpis] = useState({
    totalLiquidado: 0,
    pendiente: 0,
    aprobado: 0,
    enRevision: 0
  });

  useEffect(() => {
    if (appUser?.organization_id) {
      loadSettlements();
    }
  }, [appUser, dateFrom, dateTo]);

  const loadSettlements = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('settlements')
        .select(`
          *,
          routes(route_number, route_date, stores(name)),
          carriers(name),
          drivers(full_name, document)
        `)
        .eq('organization_id', appUser?.organization_id)
        .order('created_at', { ascending: false });

      if (dateFrom) {
        query = query.gte('settlement_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('settlement_date', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      setSettlements(data || []);
      calculateKPIs(data || []);

      const snapshots = listSnapshots();
      setSnapshotsBySettlementId(
        Object.fromEntries(snapshots.map((s) => [s.settlement_id, s])),
      );
    } catch (error) {
      console.error('Error loading settlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateKPIs = (data: any[]) => {
    const totalLiquidado = data.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const pendiente = data
      .filter(s => s.status === 'Borrador' || s.status === 'En Revisión')
      .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const aprobado = data
      .filter(s => s.status === 'Aprobado' || s.status === 'Pagado')
      .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const enRevision = data
      .filter(s => s.status === 'En Revisión')
      .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);

    setKpis({ totalLiquidado, pendiente, aprobado, enRevision });
  };

  const handleEdit = (settlement: any) => {
    setSelectedSettlement(settlement);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta tarifa?')) return;

    try {
      const { error } = await supabase
        .from('settlements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      deleteSnapshot(id);
      loadSettlements();
    } catch (error) {
      console.error('Error deleting settlement:', error);
      alert('Error al eliminar la tarifa');
    }
  };

  // Cambio de estado directo desde la fila, sin abrir el modal — replica la protección de margen
  // que ya existe en SettlementModal: si el snapshot de esta liquidación quedó en pérdida, no se
  // puede pasar a Aprobado/Pagado desde acá (hay que abrir "Editar", donde se pide el motivo o se
  // bloquea según la política del país).
  const handleStatusChange = async (settlement: any, newStatus: string) => {
    if (APPROVAL_STATUSES.includes(newStatus) && snapshotsBySettlementId[settlement.id]?.margin_status === 'LOSS') {
      alert(
        'Esta liquidación está en pérdida — no se puede aprobar/pagar desde la lista. Abrí "Editar" ' +
        'para revisar el margen y, si corresponde, completar el motivo.',
      );
      return;
    }
    try {
      const { error } = await supabase
        .from('settlements')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', settlement.id);

      if (error) throw error;
      loadSettlements();
    } catch (error) {
      console.error('Error updating settlement status:', error);
      alert('Error al actualizar el estado de la tarifa');
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedSettlement(null);
  };

  const handleModalSuccess = () => {
    loadSettlements();
  };

  const clearRangeFilters = () => {
    setMarginFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const getMarginBadge = (settlementId: string) => {
    const snapshot = snapshotsBySettlementId[settlementId];
    if (!snapshot) return <span className="text-slate-400 text-sm">—</span>;
    return (
      <Badge variant={MARGIN_BADGE_VARIANT[snapshot.margin_status] || 'default'}>
        {MARGIN_STATUS_LABEL[snapshot.margin_status] || snapshot.margin_status}
      </Badge>
    );
  };

  const marginFilteredSettlements = settlements.filter((settlement) =>
    !marginFilter || snapshotsBySettlementId[settlement.id]?.margin_status === marginFilter
  );

  const hasActiveRangeFilters = marginFilter || dateFrom || dateTo;

  const columns: DataTableColumn<any>[] = [
    {
      key: 'settlement_number',
      header: 'Número',
      accessor: (s) => s.settlement_number,
      sortable: true,
      render: (s) => (
        <div className="flex items-center gap-2">
          <i className="ri-file-text-line text-teal-600"></i>
          <span className="text-sm font-medium text-slate-800">{s.settlement_number}</span>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Ruta',
      accessor: (s) => s.routes?.route_number ?? '',
      sortable: true,
      render: (s) => (
        <>
          <div className="text-sm text-slate-800">{s.routes?.route_number}</div>
          <div className="text-xs text-slate-500">{s.routes?.stores?.name}</div>
        </>
      ),
    },
    {
      key: 'settlement_date',
      header: 'Fecha',
      accessor: (s) => s.settlement_date,
      sortable: true,
      render: (s) => new Date(s.settlement_date).toLocaleDateString('es-CL'),
    },
    { key: 'carrier', header: 'Transportista', accessor: (s) => s.carriers?.name ?? '', sortable: true, filterable: true },
    {
      key: 'driver',
      header: 'Conductor',
      accessor: (s) => s.drivers?.full_name ?? '',
      sortable: true,
      filterable: true,
      render: (s) => (
        <>
          <div className="text-sm text-slate-800">{s.drivers?.full_name}</div>
          <div className="text-xs text-slate-500">{s.drivers?.document}</div>
        </>
      ),
    },
    {
      key: 'details',
      header: 'Detalles',
      accessor: (s) => s.total_distance ?? 0,
      render: (s) => (
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1"><i className="ri-map-pin-line"></i><span>{s.total_distance} km</span></div>
          <div className="flex items-center gap-1"><i className="ri-checkbox-circle-line"></i><span>{s.total_deliveries}</span></div>
          <div className="flex items-center gap-1"><i className="ri-arrow-go-back-line"></i><span>{s.total_returns}</span></div>
        </div>
      ),
    },
    {
      key: 'total_amount',
      header: 'Monto Total',
      accessor: (s) => parseFloat(s.total_amount) || 0,
      sortable: true,
      render: (s) => (
        <span className="text-sm font-semibold text-teal-600">
          ${parseFloat(s.total_amount).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Margen',
      accessor: (s) => snapshotsBySettlementId[s.id]?.margin_status ?? '',
      filterable: true,
      render: (s) => getMarginBadge(s.id),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (s) => s.status,
      filterable: true,
      render: (s) => (
        <select
          value={s.status}
          onChange={(e) => handleStatusChange(s, e.target.value)}
          disabled={!canEdit}
          className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-teal-500 disabled:opacity-60 disabled:cursor-not-allowed ${STATUS_SELECT_CLASSES[s.status] || 'bg-slate-100 text-slate-700'}`}
        >
          <option value="Borrador">Borrador</option>
          <option value="En Revisión">En Revisión</option>
          <option value="Aprobado">Aprobado</option>
          <option value="Pagado">Pagado</option>
          <option value="Rechazado">Rechazado</option>
        </select>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tarifas</h1>
          <p className="text-sm text-slate-500 mt-1">Gestión de tarifas de viajes</p>
        </div>
        {canCreate && (
          <Button onClick={() => setIsModalOpen(true)}>
            <i className="ri-add-line mr-2"></i>
            Nueva Tarifa
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Liquidado" value={`$${kpis.totalLiquidado.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`} icon="ri-money-dollar-circle-line" color="teal" />
        <StatCard title="Pendiente" value={`$${kpis.pendiente.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`} icon="ri-time-line" color="amber" />
        <StatCard title="Aprobado" value={`$${kpis.aprobado.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`} icon="ri-checkbox-circle-line" color="emerald" />
        <StatCard title="En Revisión" value={`$${kpis.enRevision.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`} icon="ri-file-list-3-line" color="blue" />
      </div>

      {/* Filtros de rango (no calzan en el filtro de columna estilo Excel) */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <i className="ri-filter-3-line text-teal-600"></i>
            Filtros de fecha y margen
          </h2>
          {hasActiveRangeFilters && (
            <button
              onClick={clearRangeFilters}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 whitespace-nowrap"
            >
              <i className="ri-close-circle-line"></i>
              Limpiar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Margen"
            value={marginFilter}
            onChange={(e) => setMarginFilter(e.target.value)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'OK', label: 'OK' },
              { value: 'WARN', label: 'Atención' },
              { value: 'CRITICAL', label: 'Crítico' },
              { value: 'LOSS', label: 'Pérdida' },
            ]}
          />
          <Input label="Desde" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label="Hasta" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </Card>

      <DataTable
        data={marginFilteredSettlements}
        columns={columns}
        getRowId={(s) => s.id}
        loading={loading}
        searchPlaceholder="Buscar por número, ruta, conductor..."
        exportFileName="liquidaciones"
        emptyMessage="No hay tarifas"
        actions={(canEdit || canDelete) ? (settlement) => (
          <>
            {canEdit && (
              <button
                onClick={() => handleEdit(settlement)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Editar"
              >
                <i className="ri-edit-line text-base"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(settlement.id)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line text-base"></i>
              </button>
            )}
          </>
        ) : undefined}
      />

      <SettlementModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        settlement={selectedSettlement}
      />
    </div>
  );
}
