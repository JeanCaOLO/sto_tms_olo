export interface Stop {
  id: string;
  lat: number;
  lng: number;
  weightKg: number;
  volumeM3: number;
  windowStartMin?: number;
  windowEndMin?: number;
}

export interface PlanStop extends Stop {
  arrivalMin: number;
  overCapacity: boolean;
  outsideWindow: boolean;
}

export interface VehicleCapacity {
  maxWeightKg: number;
  maxVolumeM3: number;
}

export interface DistanceMatrices {
  distanceKm: number[][];
  durationMin: number[][];
  usedFallback: boolean;
}

export interface PlanResult {
  order: PlanStop[];
  totalDistanceKm: number;
  totalDurationMin: number;
  warnings: string[];
}
