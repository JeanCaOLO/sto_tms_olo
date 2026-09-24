import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';
import StatCard from '@/components/feature/StatCard';
import DataTable, { type DataTableColumn } from '@/components/base/DataTable';
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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const [selectedForDocs, setSelectedForDocs] = useState<Contract | null>(null);

  useEffect(() => {
    if (appUser?.organization_id) fetchContracts();
  }, [appUser]);

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

  const columns: DataTableColumn<Contract>[] = [
    {
      key: 'contract_number',
      header: 'N° Contrato',
      accessor: (c) => c.contract_number,
      sortable: true,
      render: (c) => <span className="font-mono font-semibold text-teal-700 text-sm">{c.contract_number}</span>,
    },
    {
      key: 'title',
      header: 'Título',
      accessor: (c) => c.title,
      sortable: true,
      render: (c) => <span className="font-medium text-slate-800 text-sm">{c.title}</span>,
    },
    {
      key: 'contract_type',
      header: 'Tipo',
      accessor: (c) => typeLabels[c.contract_type] || c.contract_type,
      filterable: true,
    },
    { key: 'entity_name', header: 'Entidad', accessor: (c) => c.entity_name || '—', sortable: true, filterable: true },
    {
      key: 'start_date',
      header: 'Vigencia',
      accessor: (c) => c.start_date,
      sortable: true,
      render: (c) => {
        const daysLeft = getDaysRemaining(c.end_date);
        return (
          <div>
            <div className="text-sm text-slate-700">
              {new Date(c.start_date).toLocaleDateString('es-ES')}
              {c.end_date && (
                <span className="text-slate-400"> → {new Date(c.end_date).toLocaleDateString('es-ES')}</span>
              )}
            </div>
            {daysLeft !== null && c.status === 'active' && (
              <div
                className={`text-xs mt-0.5 font-medium ${
                  daysLeft < 0 ? 'text-red-500' : daysLeft <= 30 ? 'text-amber-500' : 'text-slate-400'
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
        );
      },
    },
    {
      key: 'value',
      header: 'Valor',
      accessor: (c) => c.value ?? 0,
      sortable: true,
      render: (c) =>
        c.value != null ? (
          <span className="text-sm font-medium text-slate-700">
            {c.currency} {c.value.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (c) => (statusConfig[c.status] || statusConfig.draft).label,
      filterable: true,
      render: (c) => {
        const cfg = statusConfig[c.status] || statusConfig.draft;
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
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
        <StatCard title="Activos" value={active} icon="ri-check-double-line" color="emerald" />
        <StatCard title="Por Vencer (30d)" value={expiringSoon} icon="ri-alarm-warning-line" color="amber" />
        <StatCard title="Vencidos" value={expired} icon="ri-time-line" color="red" />
      </div>

      <DataTable
        data={contracts}
        columns={columns}
        getRowId={(c) => c.id}
        searchPlaceholder="Buscar por número, título o entidad..."
        exportFileName="contratos"
        emptyMessage="No hay contratos registrados"
        actions={(contract) => (
          <>
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
          </>
        )}
      />

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