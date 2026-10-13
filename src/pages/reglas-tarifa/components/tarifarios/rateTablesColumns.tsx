import Badge from '../../../../components/base/Badge';
import type { DataTableColumn } from '../../../../components/base/DataTable';
import { VAR_KEY_LABELS } from '../../../../lib/tarifas/format';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';

const varLabelOf = (key: string) => VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? key;

/** Columnas de la lista de tarifarios; el alcance muestra el nombre de la compañía o "Todo el país". */
export function rateTablesColumns(parties: CarrierProfile[]): DataTableColumn<RateTable>[] {
  const partyName = (id: string | null) => parties.find((p) => p.partyId === id)?.name ?? id;

  return [
    {
      key: 'code',
      header: 'Código',
      accessor: (t) => t.code,
      sortable: true,
      render: (t) => <span className="font-mono text-teal-700">{t.code}</span>,
    },
    { key: 'name', header: 'Nombre', accessor: (t) => t.name, sortable: true },
    {
      key: 'values',
      header: 'Valores',
      accessor: (t) => ['principal', ...(t.valueColumns ?? [])].join(' · '),
      render: (t) => (
        <span className="text-xs text-slate-600">
          {(t.valueColumns ?? []).length === 0
            ? 'Uno por fila'
            : ['principal', ...(t.valueColumns ?? [])].join(' · ')}
        </span>
      ),
    },
    {
      key: 'key',
      header: 'Clave',
      accessor: (t) => t.keyColumns.map(varLabelOf).join(' · '),
      render: (t) => <span className="text-xs text-slate-600">{t.keyColumns.map(varLabelOf).join(' · ')}</span>,
    },
    {
      key: 'scope',
      header: 'Alcance',
      sortable: true,
      filterable: true,
      accessor: (t) => (t.partyId ? String(partyName(t.partyId)) : 'Todo el país'),
      render: (t) => (t.partyId
        ? <Badge variant="info">{partyName(t.partyId)}</Badge>
        : <Badge variant="default">Todo el país</Badge>),
    },
    {
      key: 'active',
      header: 'Estado',
      sortable: true,
      filterable: true,
      accessor: (t) => (t.active ? 'Activo' : 'Inactivo'),
      render: (t) => <Badge variant={t.active ? 'success' : 'default'}>{t.active ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ];
}
