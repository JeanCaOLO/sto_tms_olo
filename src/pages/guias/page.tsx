import { useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import Input from '../../components/base/Input';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import GuideDetailModal from './components/GuideDetailModal';
import { ESTADOS, planesToGuias, type Guia } from './guia-model';
import { useAuth } from '../../hooks/useAuth';
import { usePlanesList } from '../planificacion/use-planes-list';
import { useCatalogos } from '../planificacion/use-catalogos';
import { useZonasNombre } from '../planificacion/use-zonas-nombre';
import type { PlanStatus } from '../planificacion/planes-types';

// Módulo informativo + imprimible. Lista una guía por viaje de los planes
// confirmados/completados (ver guia-model.ts). Filtro por estado + fechas;
// abrir una guía muestra sus paradas (con artículos) y permite imprimir.
export default function GuiasPage() {
  const { appUser } = useAuth();
  const { planes, cargando } = usePlanesList();
  const { conductores } = useCatalogos(appUser);
  const { nombreDe } = useZonasNombre();
  const [filtro, setFiltro] = useState<'all' | 'confirmed' | 'completed'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detalle, setDetalle] = useState<Guia | null>(null);

  const conductorNombre = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conductores) m.set(c.id, c.full_name);
    return m;
  }, [conductores]);

  const guias = useMemo(
    () => planesToGuias(planes, nombreDe, conductorNombre),
    [planes, nombreDe, conductorNombre],
  );

  const filtradas = guias.filter((g) => {
    if (filtro !== 'all' && g.plan_status !== filtro) return false;
    if (startDate && g.plan_date < startDate) return false;
    if (endDate && g.plan_date > endDate) return false;
    return true;
  });

  const confirmadas = guias.filter((g) => g.plan_status === 'confirmed').length;
  const completadas = guias.filter((g) => g.plan_status === 'completed').length;
  const totalParadas = guias.reduce((a, g) => a + g.paradas, 0);

  const estadoBadge = (s: PlanStatus) =>
    s === 'completed' ? <Badge variant="success">Completada</Badge> : <Badge variant="info">Confirmada</Badge>;

  const columns: DataTableColumn<Guia>[] = [
    {
      key: 'guide_number',
      header: 'Número de Guía',
      accessor: (g) => g.guide_number,
      sortable: true,
      render: (g) => <span className="font-mono font-medium text-slate-800">{g.guide_number}</span>,
    },
    { key: 'zona', header: 'Ruta / Zona', accessor: (g) => g.zona, sortable: true, filterable: true },
    { key: 'conductor', header: 'Conductor', accessor: (g) => g.conductor, sortable: true, filterable: true },
    { key: 'vehiculo', header: 'Vehículo', accessor: (g) => g.vehiculo, sortable: true, filterable: true },
    {
      key: 'plan_date',
      header: 'Fecha',
      accessor: (g) => g.plan_date,
      sortable: true,
      render: (g) => new Date(`${g.plan_date}T12:00:00`).toLocaleDateString('es-ES'),
    },
    {
      key: 'paradas',
      header: 'Paradas',
      accessor: (g) => g.paradas,
      sortable: true,
      render: (g) => <span className="font-medium text-teal-600">{g.paradas}</span>,
    },
    { key: 'peso', header: 'Peso', accessor: (g) => g.peso ?? 0, sortable: true, render: (g) => (g.peso != null ? `${g.peso} kg` : '—') },
    { key: 'estado', header: 'Estado', accessor: (g) => g.plan_status, filterable: true, render: (g) => estadoBadge(g.plan_status) },
  ];

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Guías de Despacho</h1>
        <p className="text-sm text-slate-500 mt-1">
          Resultado de la planificación: una guía por viaje de los planes confirmados y completados. Abrí una para ver sus paradas e imprimirla.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Guías" value={guias.length} icon="ri-file-list-3-line" color="teal" />
        <StatCard title="Confirmadas" value={confirmadas} icon="ri-flag-line" color="blue" />
        <StatCard title="Completadas" value={completadas} icon="ri-checkbox-circle-line" color="emerald" />
        <StatCard title="Paradas" value={totalParadas} icon="ri-map-pin-line" color="red" />
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
          <div className="flex gap-1">
            {ESTADOS.map((e) => (
              <button
                key={e.key}
                onClick={() => setFiltro(e.key)}
                className={`px-3 py-2 text-sm font-medium rounded-lg cursor-pointer ${
                  filtro === e.key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} label="Fecha inicio" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} label="Fecha fin" />
        </div>
      </Card>

      <DataTable
        data={filtradas}
        columns={columns}
        getRowId={(g) => g.id}
        searchPlaceholder="Buscar por guía, conductor, vehículo o zona..."
        exportFileName="guias_de_despacho"
        emptyMessage="No hay guías (generá y confirmá un plan en Planificación)."
        actions={(g) => (
          <button
            onClick={() => setDetalle(g)}
            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer"
            title="Ver detalle / imprimir"
          >
            <i className="ri-eye-line text-base"></i>
          </button>
        )}
      />

      {detalle && <GuideDetailModal guia={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}
