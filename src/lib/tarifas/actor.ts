// Rol REAL del usuario para la bitácora de configuración de tarifas. src/lib no puede usar hooks,
// así que el hook `useTarifasActor` (src/hooks) publica acá el nombre del rol del usuario activo
// y las capas de datos lo leen con `getActorRole()`.
let actorRole: string | null = null;

export function setActorRole(name: string | null): void {
  actorRole = name && name.trim() ? name : null;
}

export function getActorRole(): string {
  return actorRole ?? 'desconocido';
}
