# Requirements Analysis — Preguntas de clarificación (Módulo OMS)

> La mayor parte del alcance del OMS ya está resuelta en fuentes vigentes
> (Adenda del 2026-08-26, `business-overview.md`, `PLAN_MODULO_OMS.md`,
> `kiro-oms-requirements.md`). Estas preguntas NO re-preguntan hechos ya
> cerrados; solo fijan las decisiones de **alcance de este ciclo** antes de
> redactar los requerimientos. Los puntos que dependen de terceros
> (nº de niveles de prioridad, tablas del lago de datos, 3ª regla) NO se
> preguntan aquí: van como "Open Questions" del artefacto, para resolver más
> adelante con negocio/datos.
>
> Responde escribiendo tu elección tras cada `[Answer]:` (una letra A–E, o
> `X` con tu texto). Si prefieres, puedes decir "acepta los valores por
> defecto" y tomo la opción marcada como (por defecto) en cada una.

---

## Q1. Amplitud funcional de este ciclo de requerimientos

¿Qué conjunto de requerimientos debe cubrir el `requirements.md` de este ciclo?

- A. **(por defecto)** Los 10 requerimientos vigentes (los 11 del documento de
  Kiro menos el de aprobación humana, que se elimina), con el flujo de
  priorización 100 % automático y los 4 roles cerrados. Incluye motor de
  reglas, cola, panel, simulador, auditoría, inserción al lago, multi-país y
  seguridad.
- B. Solo el MVP marcado en `PLAN_MODULO_OMS.md` §5 (submódulos: mantenimiento
  de rutas/días de despacho, panel, cola, motor de reglas — Regla 1); simulador
  y auditoría quedan como requerimientos "fuera del MVP".
- C. Solo la Regla 1 (fecha de despacho + día de salida de la ruta) y su
  calendario de rutas, como corte mínimo para validar la lógica con datos mock.
- X. Other (please specify)

[Answer]: A

## Q2. Alcance del rol "Responsable del OMS" (única intervención humana)

La Adenda fija que la única intervención humana es alterar la prioridad de un
pedido puntual. ¿Cómo lo reflejo en los requerimientos?

- A. **(por defecto)** Un override manual por pedido individual, con motivo
  obligatorio y registro en auditoría, sin ningún paso de aprobación de lote.
  (Reescribe el antiguo REQ 3 y elimina el antiguo REQ 4.)
- B. Además del override por pedido, permitir "congelar/mantener en espera" un
  pedido (sin cambiar su tier), como acción operativa adicional.
- X. Other (please specify)

[Answer]: A

## Q3. Trigger de inserción al lago de datos (antes atado a la aprobación)

El antiguo REQ 9 insertaba el pedido "cuando la aprobación humana confirma".
Sin aprobación, ¿cuál es el disparador?

- A. **(por defecto)** El OMS inserta/actualiza el pedido en el lago de datos
  automáticamente en cuanto el motor calcula su prioridad (o cuando un override
  la altera), sin estado intermedio de aprobación.
- B. El OMS inserta al alcanzar el `ready_to_prep_date` (la fecha calculada de
  alistamiento), no en el momento del cálculo.
- X. Other (please specify)

[Answer]: A

## Q4. NFR: ¿fijamos objetivos cuantitativos ahora o los dejamos como marcador?

El documento de Kiro trae umbrales concretos (recálculo < 60 s, refresco de
cola < 5 s, inserción < 5 s, simulación ≤ 30 s / 10.000 pedidos). ¿Los adopto?

- A. **(por defecto)** Adoptar esos umbrales como NFR cuantitativos de partida,
  marcados como "provisionales, a validar con volumen real" (el volumen por país
  sigue abierto en `PLAN_MODULO_OMS.md` §7.2).
- B. Dejar los NFR como cualitativos ("cuasi-tiempo-real", "responsivo") y no
  comprometer números hasta conocer el volumen.
- X. Other (please specify)

[Answer]: A

## Q5. Autenticación / RLS

El sistema actual corre sobre Supabase; el OMS delega auth y aislamiento por
país a la capa RLS/seguridad transversal del TMS.

- A. **(por defecto)** Los requerimientos de seguridad se redactan delegando
  auth/tokens a la capa RLS transversal (como el antiguo REQ 11), sin diseñar
  aquí el mecanismo — es una dependencia externa declarada.
- B. Igual que A, pero además marcar como constraint explícito que el OMS NO
  gestiona identidades propias (usa las del TMS).
- X. Other (please specify)

[Answer]: A

---

## Consolidated Summary Confirmation

Resumen de las decisiones de alcance para el `requirements.md` del OMS:

- **Amplitud (Q1 = A)**: se redactan los 10 requerimientos vigentes (los 11 de
  Kiro menos el de aprobación humana, eliminado). Cubren motor de reglas, cola
  de priorización, panel, simulador, auditoría, inserción al lago, multi-país
  (CR/VE) y seguridad.
- **Responsable del OMS (Q2 = A)**: la única intervención humana es un override
  manual por pedido individual, con motivo obligatorio y registro en auditoría;
  sin ningún paso de aprobación de lote.
- **Trigger de inserción al lago (Q3 = A)**: automático en cuanto el motor
  calcula (o un override altera) la prioridad; sin estado intermedio de
  aprobación.
- **NFR (Q4 = A)**: se adoptan los umbrales cuantitativos de partida (recálculo
  < 60 s, refresco de cola < 5 s, inserción < 5 s, simulación ≤ 30 s / 10.000
  pedidos), marcados como provisionales a validar con volumen real.
- **Auth/RLS (Q5 = A)**: la seguridad se redacta delegando autenticación y
  tokens a la capa RLS/seguridad transversal del TMS; es dependencia externa
  declarada.

Hechos vigentes aplicados directamente (no preguntados): 4 roles cerrados
(Operador de Despacho, Administrador de Módulo, Jefe de Almacén, Responsable del
OMS), cálculo de prioridad 100 % automático y ausencia total de paso de
aprobación humana (Adenda del 2026-08-26). Se corrige la documentación
desactualizada en ese punto.

Puntos que quedan como Open Questions del artefacto (dependen de terceros):
número de niveles de prioridad a homologar (WMS/EPA/Cofersa/Mayoreo, con
Antonio), tablas exactas del lago de datos y sistema de origen (Ana/equipo de
datos), identidad de la 3ª regla, y contrato exacto de salida hacia
Planificación.

Does this all look correct before I generate the requirements artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
