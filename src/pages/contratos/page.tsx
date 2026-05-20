import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/base/Card';
import Button from '@/components/base/Button';
import Input from '@/components/base/Input';
import Select from '@/components/base/Select';
import Badge from '@/components/base/Badge';
import StatCard from '@/components/feature/StatCard';
import ContractModal from './components/ContractModal';
import DocumentsList from './components/DocumentsList';

export interface Contract {
  id: string;
  organization_id: string;
  contract_number: string;
  title: string;
  contract_type: string;
  status: 'draft' | 'active' | 'expired' | 'terminated' | 'suspended';
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  start_date: string;
  end_date: string | null;
  value: number | null;
  currency: string;
  description: string | null;
  terms: string | null;
  auto_renew: boolean;
  renewal_period_months: number;
  alert_days_before: number;
  signed_by: string | null;
  signed_date: string | null;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  active: { label: 'Activo', variant: 'success' },
  expired: { label: 'Vencido', variant: 'danger' },
  terminated: { label: 'Terminado', variant: 'danger' },
  suspended: { label: 'Suspendido', variant: 'warning' },
};

const typeLabels: Record<string, string> = {
  service: 'Servicio',
  transport: 'Transporte',
  carrier: 'Transportista',
  driver: 'Conductor',
  vehicle: 'Vehículo',
};

export default function ContratosPage() {
  const { appUser } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filtered, setFiltered] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const [selectedForDocs, setSelectedForDocs] = useState<Contract | null>(null);

  useEffect(() => {
    if (appUser?.organization_id) fetchContracts();
  }, [appUser]);

  useEffect(() => {
    filterContracts();
  }, [contracts, searchTerm, statusFilter, typeFilter]);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('organization_id', appUser!.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setContracts(data || []);
    } catch (err) {
      console.error('Error cargando contratos:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterContracts = () => {
    let result = [...contracts];
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.contract_number.toLowerCase().includes(t) ||
          c.title.toLowerCase().includes(t) ||
          (c.entity_name || '').toLowerCase().includes(t)
      );
    }
    if (statusFilter !== 'all') result = result.filter((c) => c.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter((c) => c.contract_type === typeFilter);
    setFiltered(result);
  };

  const handleEdit = (contract: Contract) => {
    setSelected(contract);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelected(null);
    fetchContracts();
  };

  const handleViewDocs = (contract: Contract) => {
    setSelectedForDocs(contract);
    setShowDocuments(true);
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const total = contracts.length;
  const active = contracts.filter((c) => c.status === 'active').length;
  const expiringSoon = contracts.filter((c) => {
    if (c.status !== 'active' || !c.end_date) return false;
    const days = getDaysRemaining(c.end_date);
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const expired = contracts.filter((c) => c.status === 'expired').length;

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
          <h1 className="text-2xl font-bold text-slate-800">Contratos y Documentos</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona contratos, vigencias y documentación legal</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <i className="ri-add-line mr-2"></i>
          Nuevo Contrato
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Contratos" value={total} icon="ri-file-paper-2-line" color="teal" />
        <StatCard title="Activos" value={active} icon="ri-check-double-line" color="green" />
        <StatCard title="Por Vencer (30d)" value={expiringSoon} icon="ri-alarm-warning-line" color="yellow" />
        <StatCard title="Vencidos" value={expired} icon="ri-time-line" color="red" />
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por número, título o entidad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon="ri-search-line"
              />
            </div>
            <div className="w-44">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos los estados</option>
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                <option value="expired">Vencido</option>
                <option value="terminated">Terminado</option>
                <option value="suspended">Suspendido</option>
              </Select>
            </div>
            <div className="w-44">
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">Todos los tipos</option>
                <option value="service">Servicio</option>
                <option value="transport">Transporte</option>
                <option value="carrier">Transportista</option>
                <option value="driver">Conductor</option>
                <option value="vehicle">Vehículo</option>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-full mx-auto mb-4">
                <i className="ri-file-paper-2-line text-2xl text-slate-400"></i>
              </div>
              <h3 className="text-lg font-medium text-slate-700 mb-1">
                {contracts.length === 0 ? 'No hay contratos registrados' : 'Sin resultados'}
              </h3>
              <p className="text-sm text-slate-500">
                {contracts.length === 0
                  ? 'Comienza creando tu primer contrato'
                  : 'Ajusta los filtros para encontrar lo que buscas'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">N° Contrato</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Título</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tipo</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Entidad</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Vigencia</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Valor</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contract) => {
                    const daysLeft = getDaysRemaining(contract.end_date);
                    const cfg = statusConfig[contract.status] || statusConfig.draft;
                    return (
                      <tr key={contract.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono font-semibold text-teal-700 text-sm">
                            {contract.contract_number}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800 text-sm">{contract.title}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-600">{typeLabels[contract.contract_type] || contract.contract_type}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-600">{contract.entity_name || '—'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <div className="text-sm text-slate-700">
                              {new Date(contract.start_date).toLocaleDateString('es-ES')}
                              {contract.end_date && (
                                <span className="text-slate-400">
                                  {' '}→ {new Date(contract.end_date).toLocaleDateString('es-ES')}
                                </span>
                              )}
                            </div>
                            {daysLeft !== null && contract.status === 'active' && (
                              <div
                                className={`text-xs mt-0.5 font-medium ${
                                  daysLeft < 0
                                    ? 'text-red-500'
                                    : daysLeft <= 30
                                    ? 'text-amber-500'
                                    : 'text-slate-400'
                                }`}
                              >
                                {daysLeft < 0
                                  ? `Venció hace ${Math.abs(daysLeft)} días`
                                  : daysLeft === 0
                                  ? 'Vence hoy'
                                  : `${daysLeft} días restantes`}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {contract.value != null ? (
                            <span className="text-sm font-medium text-slate-700">
                              {contract.currency}{' '}
                              {contract.value.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleViewDocs(contract)}
                              className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer"
                              title="Ver documentos"
                            >
                              <i className="ri-folder-open-line text-base"></i>
                            </button>
                            <button
                              onClick={() => handleEdit(contract)}
                              className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
                              title="Editar"
                            >
                              <i className="ri-edit-line text-base"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {showModal && (
        <ContractModal
          contract={selected}
          organizationId={appUser?.organization_id || ''}
          onClose={handleCloseModal}
        />
      )}

      {showDocuments && selectedForDocs && (
        <DocumentsList
          contract={selectedForDocs}
          organizationId={appUser?.organization_id || ''}
          onClose={() => {
            setShowDocuments(false);
            setSelectedForDocs(null);
          }}
        />
      )}
    </div>
  );
}