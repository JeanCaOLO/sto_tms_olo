import Input from '../../../../components/base/Input';
import type { CustomVarField } from '../../../../lib/tarifas/customVarFields';

interface Props {
  customFields: CustomVarField[];
  constantes: CustomVarField[];
  customRaw: Record<string, string>;
  setCustomRaw: (raw: Record<string, string>) => void;
}

/** Variables propias de la compañía: las que se prueban a mano, las fijas y la ayuda si no hay ninguna. */
export default function CompanyVariables({ customFields, constantes, customRaw, setCustomRaw }: Props) {
  return (
    <>
      {(customFields.length > 0 || constantes.length > 0) && (
        <div className="border-t border-slate-200 pt-3">
          <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">
            Variables de la compañía
          </p>
          {customFields.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {customFields.map((f) => (
                <Input
                  key={f.key}
                  label={f.unit ? `${f.label} (${f.unit})` : f.label}
                  type={f.kind === 'NUMBER' ? 'number' : 'text'}
                  value={customRaw[f.key] ?? ''}
                  onChange={(e) => setCustomRaw({ ...customRaw, [f.key]: e.target.value })}
                />
              ))}
            </div>
          )}
          {constantes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {constantes.map((c) => (
                <span key={c.key} className="px-2 py-1 text-xs bg-slate-100 rounded-full text-slate-600">
                  {c.label}: <strong>{c.defaultValue}</strong>
                  <span className="text-slate-400 ml-1">fija de la compañía</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {customFields.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Peajes, recolectas, atrasos e incidencias se prueban como variables propias de la
          compañía: se declaran en su ficha y aparecen acá como campos.
        </p>
      )}
    </>
  );
}
