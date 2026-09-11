# Security Test Instructions — FR16

Revisión desde la óptica de `aidlc-devsecops-agent` (soporte de esta etapa).

## Superficie de cambio

- Sin endpoints nuevos, sin autenticación/autorización tocada, sin
  dependencias de producción nuevas (solo devDependencies de testing: vitest,
  @vitest/coverage-v8, @testing-library/react — no llegan al bundle).
- `Pedido.tipo` es un discriminador de string cerrado (`'entrega' |
  'devolucion'`), sin entrada de usuario libre.
- Las llamadas a OSRM (`/route?steps=true`) usan las mismas coordenadas que ya
  se enviaban antes (delivery_latitude/longitude de pedidos existentes); no se
  agrega ningún dato nuevo a una URL externa.
- `NFR-2` (requirements.md): sin cambios de seguridad — mismos datos, mismo
  Supabase/RLS.

## Checklist

- [x] Sin secretos ni credenciales nuevas en el código.
- [x] Sin inputs de usuario sin validar que lleguen a una URL/consulta.
- [x] Sin bypass de autenticación/autorización.
- [x] `eslint` (incluye reglas de buenas prácticas) limpio en los archivos
      cambiados.

## Resultado

Sin hallazgos de seguridad. FR16 no cambia el perfil de riesgo del módulo.
