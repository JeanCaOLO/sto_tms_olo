import { useMemo } from 'react';
import { CompanyRowActions } from './CompanyRowActions';
import Badge from '../../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import type { CarrierProfile, PartyClassification } from '../../../lib/tarifas/parties';

interface Props {
  classification: PartyClassification;
  data: CarrierProfile[];
  loading: boolean;
  countries: Array<{ id: string; name: string; local_currency: string }>;
  canEdit: boolean;
  showInactive: boolean;
  onShowInactiveChange: (show: boolean) => void;
  onToggleStatus: (profile: CarrierProfile) => void;
  onCostsClick: (profile: CarrierProfile) => void;
  onRatesClick: (profile: CarrierProfile) => void;
  onVariablesClick: (profile: CarrierProfile) => void;
}

const isInactive = (p: CarrierProfile) =>
  p.carrierStatus === 'inactive' || p.profileStatus === 'inactive';

export function CompaniasTable({
  classification, data, loading, countries, canEdit, showInactive, onShowInactiveChange,
  onToggleStatus, onCostsClick, onRatesClick, onVariablesClick,
}: Props) {
  const isOutsourced = classification === 'OUTSOURCED';

  const countryLabel = (profile: CarrierProfile) => {
    const country = countries.find((c) => c.id === profile.countryId);
    return country ? `${country.name} (${country.local_currency})` : 'País no configurado';
  };

  const visible = useMemo(
    () => data.filter((p) => showInactive || !isInactive(p)),
    [data, showInactive],
  );

  const columns: DataTableColumn<CarrierProfile>[] = [
    {
      key: 'code',
      header: 'Código',
      accessor: (p) => p.code,
      sortable: true,
      render: (p) => <span className="font-mono text-slate-600">{p.code}</span>,
    },
    {
      key: 'name',
      header: 'Nombre',
      accessor: (p) => p.name,
      sortable: true,
      render: (p) => <span className="font-medium text-slate-800">{p.name}</span>,
    },
    ...(isOutsourced
      ? [{
        key: 'taxId',
        header: 'Identificación fiscal',
        accessor: (p: CarrierProfile) => p.taxId ?? '',
        sortable: true,
        render: (p: CarrierProfile) => (p.taxId
          ? <span className="text-slate-600">{p.taxId}</span>
          : <span className="text-amber-600 text-xs">Falta — se necesita para pagarle</span>),
      } satisfies DataTableColumn<CarrierProfile>]
      : []),
    {
      key: 'country',
      header: 'País / Moneda',
      accessor: (p) => countryLabel(p),
      sortable: true,
      filterable: true,
    },
    {
      key: 'profile',
      header: 'Cálculo',
      accessor: (p) => (p.partyId ? 'Configurado' : 'Sin configurar'),
      filterable: true,
      render: (p) => (p.partyId
        ? <Badge variant="success" size="sm">Configurado</Badge>
        : <span className="text-xs text-slate-400">Sin configurar</span>),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (p) => (isInactive(p) ? 'Desactivada' : 'Activa'),
      sortable: true,
      filterable: true,
      render: (p) => (
        <Badge variant={isInactive(p) ? 'default' : 'success'} size="sm">
          {isInactive(p) ? 'Desactivada' : 'Activa'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => onShowInactiveChange(e.target.checked)}
          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        Ver desactivadas
      </label>

      <DataTable
        maxVisibleRows={5}
        data={visible}
        columns={columns}
        getRowId={(p) => p.carrierId}
        loading={loading}
        searchPlaceholder="Buscar por nombre, código o identificación fiscal..."
        exportFileName={isOutsourced ? 'transportistas_a_liquidar' : 'flota_propia'}
        columnsKey={`tarifas.${isOutsourced ? 'transportistas_a_liquidar' : 'flota_propia'}`}
        emptyMessage={isOutsourced
          ? 'Todavía no hay transportistas cargados. Se dan de alta en Catálogos → Transportistas, como terceros.'
          : 'Todavía no hay compañías propias. Se dan de alta en Catálogos → Transportistas, como flota propia.'}
        actions={(profile) => (
          <CompanyRowActions
            profile={profile} canEdit={canEdit} onCostsClick={onCostsClick} onRatesClick={onRatesClick}
            onVariablesClick={onVariablesClick} onToggleStatus={onToggleStatus}
          />
        )}
      />
    </div>
  );
}
