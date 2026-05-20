import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
import GuideModal from './components/GuideModal';

interface DispatchGuide {
  id: string;
  guide_number: string;
  route_id: string;
  driver_id: string;
  vehicle_id: string;
  dispatch_date: string;
  total_stops: number;
  completed_stops: number;
  delivery_status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  routes?: {
    route_number: string;
  };
  drivers?: {
    name: string;
  };
  vehicles?: {
    plate: string;
  };
}

export default function GuiasPage() {
  const [guides, setGuides] = useState<DispatchGuide[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<DispatchGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<DispatchGuide | null>(null);

  useEffect(() => {
    fetchGuides();
  }, []);

  useEffect(() => {
    filterGuides();
  }, [guides, searchTerm, statusFilter, startDate, endDate]);

  const fetchGuides = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('dispatch_guides')
        .select(`
          *,
          routes (route_number),
          drivers (name),
          vehicles (plate)
        `)
        .order('dispatch_date', { ascending: false });

      if (error) throw error;
      setGuides(data || []);
    } catch (error) {
      console.error('Error al cargar guías:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterGuides = () => {
    let filtered = [...guides];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (guide) =>
          guide.guide_number.toLowerCase().includes(term) ||
          guide.drivers?.name.toLowerCase().includes(term) ||
          guide.vehicles?.plate.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((guide) => guide.delivery_status === statusFilter);
    }

    if (startDate) {
      filtered = filtered.filter((guide) => guide.dispatch_date >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((guide) => guide.dispatch_date <= endDate);
    }

    setFilteredGuides(filtered);
  };

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
        <Button onClick={() => setShowModal(true)}>
          <i className="ri-add-line mr-2"></i>
          Nueva Guía
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Guías"
          value={totalGuides}
          icon="ri-file-list-3-line"
          color="teal"
        />
        <StatCard
          title="En Tránsito"
          value={inTransit}
          icon="ri-truck-line"
          color="blue"
        />
        <StatCard
          title="Entregadas"
          value={delivered}
          icon="ri-checkbox-circle-line"
          color="green"
        />
        <StatCard
          title="Con Incidencias"
          value={withIssues}
          icon="ri-error-warning-line"
          color="red"
        />
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por número de guía, conductor o vehículo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon="ri-search-line"
              />
            </div>
            <div className="w-48">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendiente</option>
                <option value="in_transit">En Tránsito</option>
                <option value="delivered">Entregada</option>
                <option value="failed">Con Incidencias</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Fecha inicio"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Fecha fin"
              />
            </div>
          </div>

          {filteredGuides.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-full mx-auto mb-4">
                <i className="ri-file-list-3-line text-2xl text-slate-400"></i>
              </div>
              <h3 className="text-lg font-medium text-slate-700 mb-2">
                {guides.length === 0 ? 'No hay guías registradas' : 'No se encontraron resultados'}
              </h3>
              <p className="text-sm text-slate-500">
                {guides.length === 0
                  ? 'Comienza creando tu primera guía de despacho'
                  : 'Intenta ajustar los filtros de búsqueda'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Número de Guía
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Ruta
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Conductor
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Vehículo
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Fecha
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Paradas
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Estado
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGuides.map((guide) => (
                    <tr key={guide.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{guide.guide_number}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {guide.routes?.route_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {guide.drivers?.name || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {guide.vehicles?.plate || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {new Date(guide.dispatch_date).toLocaleDateString('es-ES')}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        <span className="font-medium text-teal-600">
                          {guide.completed_stops}
                        </span>
                        <span className="text-slate-400"> / {guide.total_stops}</span>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(guide.delivery_status)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(guide)}
                            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer"
                            title="Ver detalle"
                          >
                            <i className="ri-eye-line text-base"></i>
                          </button>
                          <button
                            onClick={() => handleEdit(guide)}
                            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-edit-line text-base"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {showModal && (
        <GuideModal guide={selectedGuide} onClose={handleCloseModal} />
      )}
    </div>
  );
}