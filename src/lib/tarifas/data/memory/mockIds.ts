// Ids de los países del modo mock. Son uuid porque en Aurora `countries.id` lo es: la semilla demo
// (`scripts/build-demo-seed.ts`), el contexto operativo mock (`lib/mock-auth.ts`) y el selector de país
// tienen que usar los mismos valores.

export const MOCK_COUNTRY_IDS = {
  CR: '22222222-2222-4222-8222-222222222221',
  VE: '22222222-2222-4222-8222-222222222222',
  CO: '22222222-2222-4222-8222-222222222223',
} as const;
