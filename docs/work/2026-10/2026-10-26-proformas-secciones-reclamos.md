# Proformas: secciones por rol, indicador de irregularidad y reclamos

Fecha: 2026-10-26. Alcance: solo tarifador. Sin despliegue, sin push. La migración `sql/51_proforma_reclamos.sql` queda **sin ejecutar**.

## Qué se pidió
Separar Proformas en cinco secciones, avisar qué liquidaciones son irregulares para acelerar la aprobación, y un flujo de reclamos cuando una fase rechaza.

## Secciones
| Sección | Quién la ve | Contenido |
|---|---|---|
| Por aprobar | Todo aprobador | Lo que espera SU turno, agrupado por transportista. Se aprueba o rechaza el transportista completo, o se abre una por una. Sin filtro de fecha: un pendiente de ayer no se oculta. |
| En proceso | Liquidador y administradores | Proformas en revisión de todos, solo lectura: línea de fases con quién aprobó y quién falta. |
| Reclamos | Liquidador y administradores | Proformas rechazadas por una fase. Acciones: Reiniciar liquidación o Apelar. |
| Completadas | Liquidador y administradores | Ya pasaron todas las fases (Aprobado). Se abren para enviarlas por correo. |
| Bitácora | Como antes | Todos los eventos; las acciones del backend (`reject`, `appeal`, `restart`…) ahora salen traducidas. |

"Todas" desaparece: las anuladas quedan en la Bitácora. Quien solo aprueba ve únicamente Por aprobar y Bitácora, y el contador de su turno.

**Rol.** Liquidador = el rol `Liquidador` (Configuración → Roles, comparado por nombre sin mayúsculas) o un administrador (`SuperAdministrador`, `SuperUsuario`, `Administrador`, `Admin`). Frontend: `canManageProformas`; servidor: `can_manage` en `backend/tarifas/src/proformas_flow.py`. Decide el servidor; la interfaz solo oculta.

**Filtro de fecha** (`DateRangeFilter`): Hoy (por defecto), Semana (lunes a domingo), Mes, Rango propio y Todo. Aplica a En proceso (fecha de creación), Reclamos (fecha del reclamo), Completadas (fecha de la última aprobación) y Bitácora (fecha del evento). "Todo" se agregó para no perder pendientes antiguos con el filtro en Hoy.

## Reclamos
Rechazar una fase ahora abre un **reclamo** (`tarifas_proforma_claims`) con el motivo. El motivo se guarda aparte porque la fase lo borra al reiniciarse.

- **Reiniciar liquidación** (solo Liquidador/admin): anula la proforma y sus liquidaciones (`void_kind = 'reclamo'`, `void_reason` = motivo del reclamo). Los viajes vuelven a Liquidaciones → Por liquidar con la etiqueta **Anulada por reclamo** y el reclamo como indicación (tooltip y aviso dentro de Liquidar). Al re-liquidar, la liquidación nueva queda con `from_claim_id` y la proforma la marca como "Viene de un reclamo".
- **Apelar** (solo Liquidador/admin, con explicación obligatoria): devuelve la proforma a la fase que reclamó. Las fases ya aprobadas se conservan. Esa fase decide: aprobar acepta el reclamo y sigue el flujo; rechazar de nuevo cierra el reclamo como `rechazado` y abre otro en Reclamos.
- Estados del reclamo: `abierto` (espera al liquidador), `apelado` (espera a la fase), `aceptado`, `rechazado`, `reiniciado`.
- "Reenviar a revisión" ya no aparece en el detalle de la proforma: lo reemplazan Apelar y Reiniciar. La acción `resubmit` sigue en el servidor.
- La API genérica no escribe reclamos (405); cambian solo con la decisión de la proforma.

## Indicador de irregularidad
Círculo con un signo de exclamación amarillo, a la derecha, en el transportista, en cada proforma y en cada liquidación del detalle. El tooltip dice qué revisar. Sin alertas se lee "Sin alertas" en verde y se puede aprobar en lote; con alertas el lote avisa cuántas proformas las traen, sin bloquear.

Señales (`src/lib/tarifas/proformas/irregularity.ts`):
- **Pedidas:** pago por incidentes, averiados o mermas (variables cargadas a mano), devoluciones, notas o comentarios, antes anulada o re-liquidada, viene de un reclamo.
- **Las que faltaban (investigadas):** margen negativo o crítico; pedidos anulados, diferidos o sin entregar; entrega parcial; tarifa de respaldo, variable tomada como 0, tramos que no cubren, empates (avisos del motor clasificados por texto); montos corregidos a mano, reglas puntuales, líneas excluidas; base de cálculo cambiada y contrato vencido a la fecha del viaje; recargos o extras cargados a mano; reglas descartadas por rotas o fuera de vigencia; transportista sin perfil de cálculo; estuvo en otra proforma anulada o de la que se excluyó; su proforma ya tuvo un reclamo.

Carga: `loadIrregularities` trae solo de las proformas visibles las liquidaciones completas y, en una consulta cada una, las otras anuladas del mismo viaje, las exclusiones previas y los reclamos.

## Piezas
| Capa | Archivos |
|---|---|
| Datos | `sql/51_proforma_reclamos.sql`; `proformaClaim` y columnas `void_kind`, `void_reason`, `claim_id`, `from_claim_id` en `src/lib/tarifas/data/schema.ts`; `sql/04_tarifas.sql` y `schema_manifest.json` regenerados |
| Backend | `proformas_flow.py` (`appeal`, `can_manage`), `proformas_api.py` (reclamos, `restart`), `app.py` |
| Lógica pura | `src/lib/tarifas/proformas/` (`canManageProformas`, `dateRange`, `irregularity`, `loadIrregularities`, `claims`, `claimOrigin`, `groupProformasByCarrier`, `decideProformas`) |
| Frontend | `src/pages/proformas/` (`page.tsx`, `parts/CarrierGroupsTable`, `parts/ClaimsTable`, `components/IrregularBadge`), `src/components/feature/DateRangeFilter.tsx`, `pages/liquidaciones/` (etiqueta y aviso del reclamo) |

## Verificado
Front: `tsc` 0, `eslint` sin errores, vitest de `lib/tarifas` y `pages` verde. Backend: `test_tarifas.py` y `test_tarifas_proformas.py` verdes (99), con casos nuevos de reclamo, apelación y reinicio. En el resto de `backend/tests` fallan solo `test_planning.py` (2) y los que necesitan `boto3`/`botocore`, que no están en el entorno.

## NO verificado
- No se corrió la migración 51 (sin BD) ni se probó contra Aurora.
- No se revisó la interfaz en un navegador.
- Sin desplegar el backend.

## Límites conocidos
- Los avisos del motor son texto libre: se clasifican por patrón, y los que no calzan caen en "Avisos del cálculo". Un código y una severidad en cada aviso es trabajo futuro.
- No existe una tabla de siniestros, incidentes o mermas: se detectan por las variables cargadas a mano (`incidencias`, `averiado`, `siniestro`, `merma`…).
- Tres avisos que se calculan al liquidar (contrato vencido, mercancía no leída, vehículo sin capacidad) no se guardan en la liquidación; el contrato vencido solo se detecta si hubo base de catálogo.
- No se comparan km, peso o tiempo reales contra lo planificado: la vista de viajes no expone esos campos.
- Un reclamo anterior a la migración (proforma rechazada sin fila de reclamo) no aparece en Reclamos.
