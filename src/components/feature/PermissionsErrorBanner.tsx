import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../hooks/usePermissions';

// Cuando /v1/me/permissions falla, el gating es fail-closed (menú vacío). En vez
// de dejar al usuario con un menú mudo, avisamos y ofrecemos reintentar.
export default function PermissionsErrorBanner() {
  const { error, loading, reload } = usePermissions();
  const { t } = useTranslation();

  if (loading || !error) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
      <span className="flex items-center gap-2">
        <i className="ri-error-warning-line text-lg"></i>{t('common.permError')}
      </span>
      <button
        onClick={reload}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
      >
        <i className="ri-refresh-line"></i>{t('common.retry')}
      </button>
    </div>
  );
}
