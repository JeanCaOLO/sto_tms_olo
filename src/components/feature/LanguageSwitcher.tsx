import { useTranslation } from 'react-i18next';

// Alterna ES/EN. i18next-browser-languagedetector persiste la elección en
// localStorage, así que se recuerda entre recargas sin código extra.
const LANGS = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden" role="group" aria-label="Language">
      {LANGS.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => i18n.changeLanguage(lang.code)}
          aria-pressed={current === lang.code}
          className={`px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
            current === lang.code ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
