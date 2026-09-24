import { useTranslation } from 'react-i18next';

// Se muestra cuando el usuario entra por URL a un módulo para el que su rol no
// tiene `view`. El menú ya no lo lista, pero la ruta directa debe frenarse acá.
export default function NoAccess() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
      <div className="w-16 h-16 flex items-center justify-center bg-red-50 rounded-2xl mb-5">
        <i className="ri-lock-2-line text-3xl text-red-500"></i>
      </div>
      <h1 className="text-2xl font-bold text-slate-800">{t('common.noAccessTitle')}</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-md">{t('common.noAccessBody')}</p>
    </div>
  );
}
