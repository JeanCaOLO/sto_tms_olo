// El usuario Transportista pertenece a una empresa: solo aprueba o rechaza lo suyo. No liquida, no edita
// liquidaciones ni envía correos. Espejo de `CARRIER_ROLE` del backend (admin_payload.py): el servidor
// filtra por empresa, esto solo oculta lo que no le corresponde.

export function isCarrierRole(roleName: string | null | undefined): boolean {
  return (roleName ?? '').trim().toLowerCase() === 'transportista';
}
