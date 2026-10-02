import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import RuleParamsModal from './RuleParamsModal';
import { useReglasController } from './useReglasController';

// Pantalla Motor de Reglas (FR5) — catálogo semi-configurable por compañía.
// `active` en mockData.ts refleja si la regla YA tiene lógica en
// ../engine/priorityEngine.ts (no la aspiración de negocio); switch/peso/
// parámetros son de referencia (mock, no persisten). La lista cambia según
// la compañía seleccionada.
export default function OmsReglasPage() {
  const {
    rules, companies, company, setCompany, loading, error,
    toggleRule, setWeight,
    editingId, setEditingId, editingRule, saveParams,
  } = useReglasController();
  const { t } = useTranslation();

  // Edición local del peso por fila (buffer para el input numérico).
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('omsRules.title')}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {t('omsRules.subtitle')}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            label={t('omsRules.company')}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
        </div>
      )}
      {!loading && error && <Card><p className="text-sm text-red-600">{error}</p></Card>}

      {!loading && !error && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colRule')}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colDescription')}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colStatus')}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colWeight')}</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colParams')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 align-top ${r.active ? '' : 'opacity-60'}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-500">{r.order}.</span>
                        <span className="text-sm font-medium text-slate-900">{r.name}</span>
                      </div>
                      {r.firstDelivery && (
                        <Badge variant="info" size="sm">{t('omsRules.firstDelivery')}</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 max-w-md">{r.description}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleRule(r.id)}
                        className="cursor-pointer"
                        aria-label={r.active ? t('omsRules.deactivate') : t('omsRules.activate')}
                        aria-pressed={r.active}
                      >
                        <span className={`inline-flex items-center h-6 w-11 rounded-full transition-colors ${r.active ? 'bg-teal-600' : 'bg-slate-300'}`}>
                          <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${r.active ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                        </span>
                      </button>
                      <div className="text-xs text-slate-500 mt-1">{r.active ? t('omsRules.active') : t('omsRules.inactive')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={weightDraft[r.id] ?? String(r.weight)}
                        onChange={(e) => setWeightDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                        onBlur={(e) => setWeight(r.id, Number(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        aria-label={t('omsRules.weightAria', { name: r.name })}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm" icon={<i className="ri-settings-3-line"></i>} onClick={() => setEditingId(r.id)}>
                        {t('omsRules.params')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
            <i className="ri-lock-2-line mr-1"></i>
            {t('omsRules.footer')}
          </p>
        </Card>
      )}

      {editingRule && (
        <RuleParamsModal
          rule={editingRule}
          onSave={(params) => saveParams(editingRule.id, params)}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
