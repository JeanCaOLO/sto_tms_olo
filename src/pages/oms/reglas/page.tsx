import { useTranslation } from 'react-i18next';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import { useReglasController } from './useReglasController';

// Pantalla Motor de Reglas (FR5) — catálogo informativo de SOLO LECTURA
// (DECIDED 2026-11-05). El set de reglas es fijo en código: no hay toggle,
// peso ni parámetros editables. `active` indica si la lógica ya existe en código.
export default function OmsReglasPage() {
  const { rules, loading, error } = useReglasController();
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('omsRules.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {t('omsRules.subtitle')}
        </p>
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
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colScope')}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{t('omsRules.colStatus')}</th>
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
                      <Badge variant="default" size="sm">{t(`omsRules.scope.${r.scope}`)}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={r.active ? 'success' : 'default'} size="sm">
                        {r.active ? t('omsRules.implemented') : t('omsRules.notImplemented')}
                      </Badge>
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
    </div>
  );
}
