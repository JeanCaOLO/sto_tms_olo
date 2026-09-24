import { useTranslation } from 'react-i18next';

interface Props {
  title?: string;
}

// Placeholder para módulos aún no disponibles. Se usa tanto en el menú (item
// apagado) como en la ruta directa, por si alguien entra por URL.
export default function ComingSoon({ title }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
      <div className="w-16 h-16 flex items-center justify-center bg-teal-50 rounded-2xl mb-5">
        <i className="ri-rocket-2-line text-3xl text-teal-600"></i>
      </div>
      <span className="px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-500 rounded-full mb-3">
        {t('common.comingSoon')}
      </span>
      <h1 className="text-2xl font-bold text-slate-800">{title ?? t('common.comingSoonTitle')}</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-md">{t('common.comingSoonBody')}</p>
    </div>
  );
}
