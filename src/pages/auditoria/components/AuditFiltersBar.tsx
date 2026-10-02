import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import type { AuditFilters, AuditAction, ActorType } from '../audit-api';
import { ACTION_META, ACTOR_KEY } from '../audit-labels';

interface Props {
  value: AuditFilters;
  onApply: (filters: AuditFilters) => void;
}

const ACTIONS = Object.keys(ACTION_META) as AuditAction[];
const ACTOR_TYPES: ActorType[] = ['user', 'system', 'anonymous'];

export default function AuditFiltersBar({ value, onApply }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AuditFilters>(value);

  const set = (patch: Partial<AuditFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const clear = () => {
    const reset: AuditFilters = { from: new Date().toISOString().slice(0, 10) };
    setDraft(reset);
    onApply(reset);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('audit.filterFrom')}</label>
        <Input type="date" value={draft.from ?? ''} onChange={(e) => set({ from: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('audit.filterTo')}</label>
        <Input type="date" value={draft.to ?? ''} onChange={(e) => set({ to: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('audit.filterEmail')}</label>
        <Input type="text" value={draft.email ?? ''} onChange={(e) => set({ email: e.target.value })} placeholder="@" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('audit.filterAction')}</label>
        <Select
          value={draft.action ?? ''}
          onChange={(e) => set({ action: (e.target.value || undefined) as AuditAction | undefined })}
          options={[{ value: '', label: t('audit.filterAll') }, ...ACTIONS.map((a) => ({ value: a, label: t(ACTION_META[a].key) }))]}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('audit.filterTable')}</label>
        <Input type="text" value={draft.table ?? ''} onChange={(e) => set({ table: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('audit.filterActorType')}</label>
        <Select
          value={draft.actor_type ?? ''}
          onChange={(e) => set({ actor_type: (e.target.value || undefined) as ActorType | undefined })}
          options={[{ value: '', label: t('audit.filterAll') }, ...ACTOR_TYPES.map((a) => ({ value: a, label: t(ACTOR_KEY[a]) }))]}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onApply(draft)} className="flex-1">{t('audit.apply')}</Button>
        <Button variant="secondary" onClick={clear}>{t('audit.clear')}</Button>
      </div>
    </div>
  );
}
