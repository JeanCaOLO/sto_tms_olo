import Button from '../../../../components/base/Button';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { CostStructure, CostStructureRow } from '../../../../lib/tarifas/types';

interface Props {
  party: CarrierProfile;
  inherited: { structure: CostStructure; rows: CostStructureRow[] } | null;
  canEdit: boolean;
  copying: boolean;
  onCopy: () => void;
}

/** Aviso cuando la compañía no tiene estructura propia: usa la del país, o no hay ninguna. */
export function InheritedNotice({ party, inherited, canEdit, copying, onCopy }: Props) {
  if (!inherited) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
        <i className="ri-error-warning-line mr-1"></i>
        Ni esta compañía ni el país tienen estructura de costos cargada.
        {party.classification === 'OWN' && ' Hasta que se cargue una, no se puede liquidar a la flota propia.'}
      </div>
    );
  }
  return (
    <div className="bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
      <i className="ri-global-line text-lg"></i>
      <div className="flex-1 min-w-[260px]">
        <strong>
          {party.classification === 'OWN'
            ? 'Esta compañía usa la estructura de costos del país'
            : 'Estructura de costos del país (solo referencia)'}
        </strong>
        {` «${inherited.structure.name}», con ${inherited.rows.filter((r) => r.active).length} conceptos activos. `}
        {party.classification === 'OWN'
          ? 'Es la que se liquida hoy. Si esta compañía necesita otra, copiala y ajustala.'
          : 'Los terceros no se liquidan con ella.'}
      </div>
      {party.classification === 'OWN' && (
        <Button variant="secondary" onClick={onCopy} disabled={!canEdit || copying}
          title={!canEdit ? 'Tu rol no puede editar costos' : 'Crea una estructura propia con los mismos conceptos'}>
          <i className="ri-file-copy-line mr-1"></i>{copying ? 'Copiando…' : 'Crear una propia a partir de la del país'}
        </Button>
      )}
    </div>
  );
}
