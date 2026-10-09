import Card from '../../../../components/base/Card';
import Button from '../../../../components/base/Button';
import Select from '../../../../components/base/Select';
import type { CustomVarField } from '../../../../lib/tarifas/customVarFields';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { TripRecord, Zone } from '../../../../lib/tarifas/types';
import type { TruckTypeOption } from '../../../../lib/tarifas/vehiclesDataSource';
import CompanyVariables from './CompanyVariables';
import FreeTripPanel from './FreeTripPanel';
import TripPanel from './TripPanel';
import type { TesterForm } from './useTesterForm';

interface Props {
  form: TesterForm;
  templates: Record<string, unknown>[];
  countries: { id: string; name: string }[];
  carriers: CarrierProfile[];
  trips: TripRecord[];
  trip: TripRecord | null;
  loadingTrips: boolean;
  truckTypes: TruckTypeOption[];
  zones: Zone[];
  catalogError: string;
  libreCarrier: CarrierProfile | null;
  customFields: CustomVarField[];
  constantes: CustomVarField[];
  calculando: boolean;
  onReload: () => void;
  onApplyScenario: (id: string) => void;
}

const MODOS = [['viaje', 'Desde un viaje'], ['libre', 'Viaje libre']] as const;

/** Tarjeta "El viaje de prueba": escenario, país, modo, viaje (real o libre) y variables de la compañía. */
export default function TesterLeftCard(p: Props) {
  const { form } = p;
  const { modo, countryId, escenarioId } = form;
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <i className="ri-flask-line text-teal-600"></i>
          El viaje de prueba
        </h3>
        <Button variant="secondary" size="sm" onClick={p.onReload}>
          <i className="ri-refresh-line"></i>
          Recargar
        </Button>
      </div>

      <div className="space-y-3">
        {p.templates.length > 0 && (
          <Select
            label="Escenario guardado"
            value={escenarioId}
            onChange={(e) => (e.target.value ? p.onApplyScenario(e.target.value) : form.setEscenarioId(''))}
            options={[
              { value: '', label: 'Ninguno — armar el viaje a mano' },
              ...p.templates.map((t) => ({ value: String(t.id), label: String(t.name) })),
            ]}
          />
        )}

        <Select
          label="País"
          value={countryId}
          onChange={(e) => { form.setCountryId(e.target.value); form.setTripId(''); form.setViajePartyId(null); form.setEscenarioId(''); }}
          options={p.countries.map((c) => ({ value: c.id, label: c.name }))}
        />

        {/* Los dos modos ───────────────────────────────────────────────────────────── */}
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          {MODOS.map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => form.setModo(valor)}
              className={`flex-1 text-xs py-1.5 rounded-md cursor-pointer transition ${
                modo === valor ? 'bg-white shadow-sm font-medium text-slate-800' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 -mt-1">
          {modo === 'viaje'
            ? 'Igual que la liquidación: el viaje completado aporta zona, kilómetros, paradas, peso y vehículo.'
            : 'Para inventar combinaciones que ningún viaje produce y ver qué reglas se despiertan.'}
        </p>

        {p.catalogError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {p.catalogError}
          </p>
        )}

        {modo === 'viaje' ? (
          <TripPanel
            tripId={form.tripId} trips={p.trips} trip={p.trip} loadingTrips={p.loadingTrips}
            viajePartyId={form.viajePartyId} calculando={p.calculando}
            onTripChange={(id) => { form.setTripId(id); form.setViajePartyId(null); }}
          />
        ) : (
          <FreeTripPanel
            libre={form.libre} setLibre={form.setLibre} dia={form.dia} setDia={form.setDia}
            carriers={p.carriers} zones={p.zones} truckTypes={p.truckTypes} libreCarrier={p.libreCarrier}
          />
        )}

        <CompanyVariables
          customFields={p.customFields} constantes={p.constantes}
          customRaw={form.customRaw} setCustomRaw={form.setCustomRaw}
        />

        <p className="text-xs text-slate-400">
          Acá no se emite nada: es el mismo cálculo que hará la liquidación, con los mismos datos.
          La bifurcación nómina (flota propia) / cuentas por pagar (tercero) la deciden las reglas
          condicionadas por flota, no un cálculo aparte.
        </p>
      </div>
    </Card>
  );
}
