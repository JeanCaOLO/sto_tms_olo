import Badge from '../../../components/base/Badge';
import type { DataTableColumn } from '../../../components/base/DataTable';
import { todayLocalIso } from '../../../lib/tarifas/localDate';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type { RuleRow } from '../types';

export function getPartyName(id: string | null, parties: CarrierProfile[]): string {
  return parties.find((p) => p.partyId === id)?.name ?? id ?? '';
}

export function stackingBadge(stacking: string) {
  const variant = stacking === 'EXCLUSIVE' ? 'warning' : stacking === 'MAX' ? 'info' : 'default';
  return <Badge variant={variant}>{stacking}</Badge>;
}

export function vigenciaBadge(rule: RuleRow) {
  const desde: string | null = rule.effective_from || null;
  const hasta: string | null = rule.effective_to || null;
  if (!desde && !hasta) return <span className="text-xs text-slate-400">Sin límite</span>;

  const hoy = todayLocalIso();
  const estado = hasta && hoy > hasta ? 'vencida' : desde && hoy < desde ? 'futura' : 'vigente';

  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant={estado === 'vigente' ? 'success' : estado === 'vencida' ? 'default' : 'info'}>
        {estado === 'vigente' ? 'Vigente' : estado === 'vencida' ? 'Vencida' : 'Futura'}
      </Badge>
      <span className="text-[11px] text-slate-500 whitespace-nowrap">
        {desde ?? '…'} → {hasta ?? '…'}
      </span>
    </div>
  );
}

export function vigenciaEstado(rule: RuleRow): string {
  const desde: string | null = rule.effective_from || null;
  const hasta: string | null = rule.effective_to || null;
  if (!desde && !hasta) return 'Sin límite';
  const hoy = todayLocalIso();
  return hasta && hoy > hasta ? 'Vencida' : desde && hoy < desde ? 'Futura' : 'Vigente';
}

export function scopeBadge(rule: RuleRow, rules: RuleRow[], parties: CarrierProfile[]): React.ReactNode {
  const overriddenCountryCodes = new Set(
    rules.filter((r) => r.scope === 'PARTY').map((r) => r.code),
  );

  if (rule.scope !== 'PARTY') {
    return overriddenCountryCodes.has(rule.code)
      ? <Badge variant="warning">Heredada (sobrescrita)</Badge>
      : <Badge variant="default">Heredada</Badge>;
  }
  const sobrescribe = rules.some((r) => r.scope !== 'PARTY' && r.code === rule.code);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant={sobrescribe ? 'warning' : 'info'}>
        {sobrescribe ? 'Sobrescribe' : 'Propia'}
      </Badge>
      <span className="text-[11px] text-slate-500">{getPartyName(rule.party_id ?? null, parties)}</span>
    </div>
  );
}

export function getRuleTableColumns(parties: CarrierProfile[], rules: RuleRow[]): DataTableColumn<RuleRow>[] {
  return [
    {
      key: 'code',
      header: 'Código',
      accessor: (r) => r.code,
      sortable: true,
      render: (r) => <span className="font-mono text-sm text-teal-700">{r.code}</span>,
    },
    {
      key: 'name',
      header: 'Nombre',
      accessor: (r) => r.name,
      sortable: true,
      render: (r) => (
        <div>
          <div>{r.name}</div>
          {r.description && <div className="text-xs text-slate-500 mt-0.5 max-w-md">{r.description}</div>}
          {r.reason && <div className="text-[11px] text-slate-400 mt-0.5 italic">Motivo: {r.reason}</div>}
        </div>
      ),
      exportValue: (r) => r.name ?? '',
    },
    {
      key: 'scope',
      header: 'Alcance',
      sortable: true,
      filterable: true,
      accessor: (r) => (r.scope === 'PARTY' ? getPartyName(r.party_id ?? null, parties) : 'Todo el país'),
      render: (r) => scopeBadge(r, rules, parties),
    },
    {
      key: 'stage',
      header: 'Etapa',
      accessor: (r) => r.stage,
      sortable: true,
      filterable: true,
    },
    {
      key: 'stacking',
      header: 'Competencia',
      accessor: (r) => r.stacking,
      sortable: true,
      filterable: true,
      render: (r) => stackingBadge(r.stacking),
    },
    {
      key: 'priority',
      header: 'Prioridad',
      accessor: (r) => r.priority,
      sortable: true,
    },
    {
      key: 'vigencia',
      header: 'Vigencia',
      accessor: (r) => vigenciaEstado(r),
      sortable: true,
      filterable: true,
      render: (r) => vigenciaBadge(r),
    },
    {
      key: 'active',
      header: 'Estado',
      accessor: (r) => (r.active ? 'Activa' : 'Inactiva'),
      sortable: true,
      filterable: true,
      render: (r) => <Badge variant={r.active ? 'success' : 'default'}>{r.active ? 'Activa' : 'Inactiva'}</Badge>,
    },
  ];
}
