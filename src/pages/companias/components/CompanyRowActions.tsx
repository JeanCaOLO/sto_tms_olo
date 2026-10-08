import Button from '../../../components/base/Button';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

interface Props {
  profile: CarrierProfile;
  canEdit: boolean;
  onCostsClick: (profile: CarrierProfile) => void;
  onRatesClick: (profile: CarrierProfile) => void;
  onVariablesClick: (profile: CarrierProfile) => void;
  onToggleStatus: (profile: CarrierProfile) => void;
}

/** Costos, tarifarios, variables y activar/desactivar el cálculo de una compañía. */
export function CompanyRowActions({
  profile, canEdit, onCostsClick, onRatesClick, onVariablesClick, onToggleStatus,
}: Props) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCostsClick(profile)}
        title="Estructura de costos de esta compañía"
      >
        <i className="ri-table-line"></i>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRatesClick(profile)}
        title="Tarifarios: el precio de cada ruta"
      >
        <i className="ri-price-tag-3-line"></i>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onVariablesClick(profile)}
        title="Variables propias de esta compañía"
      >
        <i className="ri-code-box-line"></i>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onToggleStatus(profile)}
        disabled={!canEdit || !profile.partyId}
        title={!canEdit
          ? 'Tu rol no puede desactivar compañías'
          : !profile.partyId
          ? 'Sin cálculo configurado: no hay nada que desactivar'
          : profile.profileStatus === 'inactive' ? 'Reactivar cálculo' : 'Desactivar cálculo'}
      >
        <i className={profile.profileStatus === 'inactive' ? 'ri-refresh-line' : 'ri-forbid-line'}></i>
      </Button>
    </>
  );
}
