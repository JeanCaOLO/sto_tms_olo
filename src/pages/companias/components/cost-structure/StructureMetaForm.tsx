import Button from '../../../../components/base/Button';
import Input from '../../../../components/base/Input';

interface Meta { name: string; operatingDaysPerMonth: number }

interface Props {
  canEdit: boolean;
  meta: Meta;
  setMeta: (meta: Meta) => void;
  onSave: () => void;
}

/** Nombre y días operativos por mes de la estructura. */
export function StructureMetaForm({ canEdit, meta, setMeta, onSave }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <Input
          label="Nombre"
          value={meta.name}
          onChange={(e) => setMeta({ ...meta, name: e.target.value })}
        />
        <Input
          label="Días operativos por mes"
          type="number"
          value={String(meta.operatingDaysPerMonth)}
          onChange={(e) => setMeta({ ...meta, operatingDaysPerMonth: Number(e.target.value) })}
        />
        <Button variant="secondary" onClick={onSave} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar costos' : undefined}>
          <i className="ri-save-line mr-1"></i> Guardar parámetros
        </Button>
      </div>
      <p className="text-xs text-slate-500 -mt-3">
        Los días operativos son el divisor de los conceptos <strong>mensuales</strong>: un salario
        mensual se reparte entre ellos y se cobran los días que dura el viaje.
      </p>
    </>
  );
}
