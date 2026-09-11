import { ReactNode } from 'react';
import CountrySelector from './CountrySelector';
import type { Country } from '../types';

interface OmsPageHeaderProps {
  title: string;
  subtitle: string;
  country: Country;
  onCountryChange: (c: Country) => void;
  actions?: ReactNode;
}

// Header consistente con el resto de la app (mismo patrón que Dashboard):
// título text-2xl + subtítulo, con el selector de país del OMS a la derecha.
export default function OmsPageHeader({ title, subtitle, country, onCountryChange, actions }: OmsPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <CountrySelector value={country} onChange={onCountryChange} />
      </div>
    </div>
  );
}
