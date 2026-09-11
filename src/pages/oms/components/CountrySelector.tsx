import Select from '../../../components/base/Select';
import type { Country } from '../types';

interface CountrySelectorProps {
  value: Country;
  onChange: (c: Country) => void;
}

// FR9 — selector de país obligatorio en el OMS. En Construcción el país por
// defecto vendría del token RLS (FR4.4 -> FR10.3); aquí es un control local.
export default function CountrySelector({ value, onChange }: CountrySelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <i className="ri-global-line text-slate-400"></i>
      <Select
        aria-label="País"
        value={value}
        onChange={(e) => onChange(e.target.value as Country)}
        className="w-44"
        options={[
          { value: 'CR', label: 'Costa Rica' },
          { value: 'VE', label: 'Venezuela' },
        ]}
      />
    </div>
  );
}
