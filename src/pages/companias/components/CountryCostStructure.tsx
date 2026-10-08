// «Estructura del país»: la estructura de costos por defecto de la flota propia. Es la base de lo que
// se liquida por un viaje de flota propia cuando la compañía no tiene estructura propia (la que manda
// sobre ella se edita desde la fila de la compañía). Los terceros no tienen costos propios.

import { useState } from 'react';
import Card from '../../../components/base/Card';
import CostTemplateModal from '../../../components/tarifas/CostTemplateModal';
import HelpButton from '../../reglas-tarifa/components/HelpButton';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { useCountryCostStructure } from '../hooks/useCountryCostStructure';
import { CostStructureCard } from './CostStructureCard';

interface Props {
  country: { id: string; name: string; local_currency?: string } | null;
}

export default function CountryCostStructure({ country }: Props) {
  const { canEdit } = useModulePermissions('tarifas.config');
  const countryId = country?.id ?? '';
  const { loading, structure, rows, summary, error, reload } = useCountryCostStructure(countryId);
  const [templateOpen, setTemplateOpen] = useState(false);

  if (loading) {
    return <Card><div className="text-center py-10 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div></Card>;
  }

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-800">Estructura del país</h2>
        <HelpButton
          title="Estructura del país"
          steps={[
            'Es la estructura de costos de la flota propia por defecto en este país: la BASE de lo que se paga por un viaje de flota propia. Es costo interno: nunca se le muestra a un tercero.',
            'Se carga con la plantilla de Excel (variables por km, fijos mensuales y parámetros). Una compañía puede tener la suya desde su fila (icono de estructura de costos) y esa manda sobre la del país.',
            'Las reglas y los tarifarios solo ajustan encima de esta base (recargos, descuentos, topes).',
          ]}
        />
      </div>
      <CostStructureCard
        structure={structure}
        structureRows={rows}
        summary={summary}
        countryId={countryId}
        countryName={country?.name}
        currency={country?.local_currency ?? 'moneda local'}
        canEdit={canEdit}
        onUpload={() => setTemplateOpen(true)}
      />
      <CostTemplateModal
        isOpen={templateOpen}
        partyId={null}
        countryId={countryId}
        structureName={structure?.name ?? `Flota propia ${country?.name ?? ''}`.trim()}
        scopeLabel={`la estructura de la flota propia de ${country?.name ?? 'este país'}`}
        currency={country?.local_currency}
        onClose={() => setTemplateOpen(false)}
        onApplied={reload}
      />
    </div>
  );
}
