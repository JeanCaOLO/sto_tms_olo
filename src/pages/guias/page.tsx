import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import GuideModal from './components/GuideModal';
import GuideDetailModal from './components/GuideDetailModal';
import { useModulePermissions } from '../../hooks/use-module-permissions';

// dispatch_guides es una guía POR PARADA (una fila = un pedido de una ruta,
// con sequence_number, recipient_name, planned/actual_*_time - ver
// sql/01_*.sql). driver_id/vehicle_id/fecha/total de paradas viven en la RUTA
// (routes), no en la guía misma - por eso se leen vía el embed `routes(...)`.
interface DispatchGuide {
  id: string;
  guide_number: string;
  route_id: string;
  order_id: string;
  sequence_number: number;
  planned_arrival_time: string | null;
  actual_arrival_time: string | null;
  status: string;
  delivery_status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  recipient_name: string | null;
  notes: string | null;
  routes?: {
    route_number: string;
    route_date: string;
    total_stops: number;
    completed_stops: number;
    drivers?: { full_name: string };
    vehicles?: { plate: string };
  };
}

export default function GuiasPage() {
  const [guides, setGuides] = useState<DispatchGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<DispatchGuide | null>(null);
  const [detailGuide, setDetailGuide] = useState<DispatchGuide | null>(null);
  const { canCreate, canEdit } = useModulePermissions('guias');

  useEffect(() => {
    fetchGuides();
  }, []);

  const fetchGuides = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('dispatch_guides')
        .select(`
          *,
          routes (route_number, route_date, total_stops, completed_stops, drivers (full_name), vehicles (plate))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGuides(data || []);
    } catch (error) {
      console.error('Error al cargar guías:', error);
    } finally {
      setLoading(false);
    }
  };

  const dateFilteredGuides = guides.filter((g) => {
    const fecha = g.routes?.route_date;
    if (!fecha) return true;
    if (startDate && fecha < startDate) return false;
    if (endDate && fecha > endDate) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Pendiente', variant: 'warning' as const },
      in_transit: { label: 'En Tránsito', variant: 'info' as const },
      delivered: { label: 'Entregada', variant: 'success' as const },
      failed: { label: 'Con Incidencias', variant: 'danger' as const }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const statusLabel = (status: string) =>
    ({ pending: 'Pendiente', in_transit: 'En Tránsito', delivered: 'Entregada', failed: 'Con Incidencias' }[status] ?? status);

  const handleEdit = (guide: DispatchGuide) => {
    setSelectedGuide(guide);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedGuide(null);
    fetchGuides();
  };

  const totalGuides = guides.length;
  const inTransit = guides.filter((g) => g.delivery_status === 'in_transit').length;
  const delivered = guides.filter((g) => g.delivery_status === 'delivered').length;
  const withIssues = guides.filter((g) => g.delivery_status === 'failed').length;

  const columns: DataTableColumn<DispatchGuide>[] = [
    {
      key: 'guide_number',
      header: 'Número de Guía',
      accessor: (g) => g.guide_number,
      sortable: true,
      render: (g) => <span className="font-medium text-slate-800">{g.guide_number}</span>,
    },
    { key: 'route', header: 'Ruta', accessor: (g) => g.routes?.route_number ?? '', sortable: true, filterable: true },
    { key: 'driver', header: 'Conductor', accessor: (g) => g.routes?.drivers?.full_name ?? '', sortable: true, filterable: true },
    { key: 'vehicle', header: 'Vehículo', accessor: (g) => g.routes?.vehicles?.plate ?? '', sortable: true, filterable: true },
    { key: 'recipient', header: 'Destinatario', accessor: (g) => g.recipient_name ?? '', sortable: true, filterable: true },
    {
      key: 'route_date',
      header: 'Fecha',
      accessor: (g) => g.routes?.route_date ?? '',
      sortable: true,
      render: (g) => (g.routes?.route_date ? new Date(g.routes.route_date).toLocaleDateString('es-ES') : '—'),
    },
    {
      key: 'sequence_number',
      header: 'Parada',
      accessor: (g) => g.sequence_number,
      sortable: true,
      render: (g) => (
        <>
          <span className="font-medium text-teal-600">{g.sequence_number}</span>
          <span className="text-slate-400"> / {g.routes?.total_stops ?? '—'}</span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (g) => statusLabel(g.delivery_status),
      filterable: true,
      render: (g) => getStatusBadge(g.delivery_status),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Guías de Despacho</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona y monitorea todas las guías de despacho
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowModal(true)}>
            <i className="ri-add-line mr-2"></i>
            Nueva Guía
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Guías" value={totalGuides} icon="ri-file-list-3-line" color="teal" />
        <StatCard title="En Tránsito" value={inTransit} icon="ri-truck-line" color="blue" />
        <StatCard title="Entregadas" value={delivered} icon="ri-checkbox-circle-line" color="emerald" />
        <StatCard title="Con Incidencias" value={withIssues} icon="ri-error-warning-line" color="red" />
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            label="Fecha inicio"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            label="Fecha fin"
          />
        </div>
      </Card>

      <DataTable
        data={dateFilteredGuides}
        columns={columns}
        getRowId={(g) => g.id}
        searchPlaceholder="Buscar por número de guía, conductor o vehículo..."
        exportFileName="guias_de_despacho"
        emptyMessage="No hay guías registradas"
        actions={(guide) => (
          <>
            <button
              onClick={() => setDetailGuide(guide)}
              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer"
              title="Ver detalle"
            >
              <i className="ri-eye-line text-base"></i>
            </button>
            {canEdit && (
              <button
                onClick={() => handleEdit(guide)}
                className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                title="Editar"
              >
                <i className="ri-edit-line text-base"></i>
              </button>
            )}
          </>
        )}
      />

      {detailGuide && (
        <GuideDetailModal guide={detailGuide} onClose={() => setDetailGuide(null)} />
      )}

      {showModal && (
        <GuideModal guide={selectedGuide} onClose={handleCloseModal} />
      )}
    </div>
  );
}
