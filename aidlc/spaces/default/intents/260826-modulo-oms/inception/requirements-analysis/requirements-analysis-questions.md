# Requirements Analysis (re-corrida) — Preguntas de clarificación (Módulo OMS)

> Esta re-corrida CORRIGE el `requirements.md` con las decisiones firmes de
> `project.md` (`## Decided`) y de tres reuniones ya indexadas: funcional con
> Antonio (2026-09-08), datos/cruce con Calzadilla (2026-09-14) y diseño de
> solución (2026-09-14). Casi todo el alcance ya está DECIDIDO; estas preguntas
> solo fijan las pocas decisiones de redacción que aún quedan abiertas. Todas
> tienen valor por defecto; puedes decir "acepta los valores por defecto".
>
> Lo que ya se aplica como FIRME (no se pregunta): el OMS lee del WMS/EFLOW y
> escribe estado/situación (DISP→GENERADA) + prioridad a nivel WMS (no toca WMH,
> no lee intermedias, no hay "lago de datos", termina en "alistado"); prioridad
> numérica invertida atada a la fecha (T-1) con score ponderado; 5 macro-reglas
> con 2 en la primera entrega (fecha + cliente retira/observaciones vía IA
> Bedrock); motor = catálogo semi-configurable; multi-compañía con Lambda por
> compañía y selector de compañía en la UI; fuente = `expedición_cabecera` con
> `fecha_de_cierre IS NULL` + `DISP`.

---

## Q1. Alcance del ciclo de corrección

- A. **(por defecto)** Reescribir el `requirements.md` completo alineándolo a
  las decisiones firmes (posicionamiento WMS/EFLOW, prioridad numérica T-1 +
  score, 5 macro-reglas con 2 en 1ª entrega, motor catálogo, multi-compañía,
  fuente de datos), corrigiendo cada FR/NFR/rol/glosario afectado.
- B. Solo corregir los puntos que contradicen los hechos firmes (posicionamiento
  y prioridad), dejando el resto como está.
- X. Other (please specify)

[Answer]: A
## Q2. Score vs. filtro en el modelo de prioridad

Antonio dejó abierto si las reglas deben cumplirse TODAS (filtro) o cada una
suma peso (score). `project.md` decide **score ponderado desde la 1ª entrega**.

- A. **(por defecto)** Redactar el modelo como **score ponderado** (cada regla
  suma peso → prioridad; mayor peso = cliente retira, luego la fecha), y dejar
  "score vs. filtro puro" como Open Question a cerrar con el cliente.
- B. Redactarlo como filtro (todas las reglas deben cumplirse) — contradice
  `project.md`, no recomendado.
- X. Other (please specify)

[Answer]: A
## Q3. Roles del OMS

Los 4 roles de la Adenda (Operador de Despacho, Administrador de Módulo, Jefe de
Almacén, Responsable del OMS) siguen vigentes.

- A. **(por defecto)** Mantener los 4 roles, ajustando responsabilidades al
  alcance corregido (el "override manual" lo ejerce un rol autorizado; el
  Administrador de Módulo configura el catálogo de reglas por compañía; el
  calendario de rutas es CRUD del OMS pero su fuente de verdad es el TMS).
- B. Simplificar a 3 niveles de acceso sin nombrar roles de negocio.
- X. Other (please specify)

[Answer]: A
## Q4. Regla 4 (asignación de viaje/bajada) en el alcance

El viaje lo abre/asigna el TMS/Planificación; el OMS solo consume el viaje y
asigna la bajada. La 1ª entrega son 2 reglas (fecha + cliente retira).

- A. **(por defecto)** Incluir la Regla 4 como macro-regla del catálogo pero
  **fuera de la primera entrega** (documentada, inactiva), aclarando que la
  creación del viaje es de Planificación.
- B. Omitirla del documento por ahora.
- X. Other (please specify)

[Answer]: A
## Q5. NFR cuantitativos

Los umbrales previos (recálculo ≤60 s, cola ≤5 s, inserción al lago ≤5 s,
simulador ≤30 s) se inventaron sobre un modelo de "lago" que ya no aplica.

- A. **(por defecto)** Reemplazarlos por NFR alineados a lo real: el motor corre
  ≥ 1 vez/día y en las horas de corte; IA de observaciones < $1 USD/mes (~400
  pedidos/día); volumen de referencia ~400–500 pedidos/día (Cofersa); capacidad
  operativa ~80 pedidos simultáneos. Marcar todos como provisionales.
- B. Conservar los umbrales anteriores.
- X. Other (please specify)

[Answer]: A

---

## Consolidated Summary Confirmation

Re-corrida de Requirements Analysis del OMS. Decisiones (Q1–Q5 = A) + precisiones:

- **Q1 = A** — reescritura completa del `requirements.md` alineada a lo firme,
  tratando el actual como base a corregir.
- **Q2 = A** — modelo de prioridad = **score ponderado, desde la primera
  entrega**. Como Open Question queda SOLO el matiz score vs. filtro estricto
  (¿toda regla suma peso o alguna es obligatoria?); el score en sí ya está
  decidido.
- **Q3 = A** — se mantienen los 4 roles de la Adenda, ajustados al alcance.
- **Q4 = A** — Regla 4 (asignación de viaje/bajada) incluida como macro-regla
  **fuera de la 1ª entrega**, explícita: el OMS NO crea ni asigna el viaje (eso
  es Planificación/TMS); el OMS consume el viaje ya abierto y termina en
  "alistado". La bajada se documenta como futura con esa nota de propiedad.
- **Q5 = A** — NFR reemplazados por los reales (motor ≥1/día + horas de corte;
  IA < $1/mes ~400 pedidos/día; volumen ~400–500/día Cofersa; capacidad ~80
  simultáneos), marcados provisionales.

Correcciones firmes que se incorporan (de `project.md` y las reuniones):
posicionamiento WMS/EFLOW (lee y escribe estado/situación DISP→GENERADA +
prioridad; no toca WMH ni intermedias; termina en "alistado"); prioridad
numérica invertida atada a T-1 (el OMS NO escribe fechas; usa la fecha de
expedición planificada como insumo); fuente = `expedición_cabecera` con
`fecha_de_cierre IS NULL` + `DISP` (anti-join con `almacén_movimiento_carcam`;
`Journey_Orders` opcional; réplica `EFLOW_OLO` por solicitar); 5 macro-reglas,
1ª entrega = 2 (fecha + cliente retira/observaciones vía IA Amazon Bedrock,
prompt en Lambda no editable); Motor de Reglas = catálogo semi-configurable con
selector de compañía; **Simulador = configurador de simulaciones** (entidad
persistida/bitácora, modal previo de reglas activas + filtro de situación,
aplicación manual/automática/mixta con hora de corte, una aplicada por
compañía); multi-compañía con Lambda por compañía y compañía como filtro/selector
en la UI (no perfil); Cola con default `DISP`, filtro de almacén, detalle en
modal, selección de columnas (User Preference JSON), nombre+selector de compañía;
Capa X (todas las tablas con compañía/país; nombre de compañía por maestro); BD
`logistica_olo` con esquemas `OMS` y `TMS`; stack oficial AWS serverless +
Python/Lambdas + React + PostgreSQL.

Supuestos / Open Questions: BD una-sola con columnas compañía/país (no oficial);
réplica `EFLOW_OLO` por solicitar (Alfredo); Cofersa no envía la fecha de
entrega (fallback regla por ruta); tabla de prioridades del cliente pendiente;
score vs. filtro estricto; umbral de inyección; duración de rutas y horas de
corte (equipo de transporte).

Does this all look correct before I rewrite the requirements artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
