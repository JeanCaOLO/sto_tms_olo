import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Ruta inexistente. Mismo diseño que NoAccess y con salida: antes mostraba un texto de plantilla en inglés y nada más.
export default function NotFound() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
      <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-2xl mb-5">
        <i className="ri-compass-3-line text-3xl text-slate-500"></i>
      </div>
      <h1 className="text-2xl font-bold text-slate-800">{t('common.notFoundTitle')}</h1>
      <p className="mt-2 text-sm font-mono text-slate-400 break-all">{location.pathname}</p>
      <p className="mt-2 text-sm text-slate-500 max-w-md">{t('common.notFoundBody')}</p>
      <Link
        to="/dashboard"
        className="mt-5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 cursor-pointer"
      >
        {t('common.backHome')}
      </Link>
    </div>
  );
}
