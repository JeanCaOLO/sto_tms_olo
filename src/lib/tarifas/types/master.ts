// Maestros de referencia: flota, transportistas, clientes, conductores.

export interface TruckType {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Carrier {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Customer {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Driver {
  id: string;
  countryId: string;
  code: string;
  name: string;
  /** null = conductor de flota propia; si no, transportista al que pertenece. */
  carrierId: string | null;
}
