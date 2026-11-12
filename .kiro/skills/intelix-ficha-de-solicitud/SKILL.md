---
name: intelix-ficha-de-solicitud
description: >-
  Construye una Ficha de Solicitud a partir de la clasificación Mantenimiento
  Menor, Intermedio o Mayor. Menor cierra con tres respuestas. Intermedio usa un
  cuestionario medio. La estimación se hace en las tres clases, con los elementos de cada una.
---

# Skill: Ficha de Solicitud

## Propósito

Construir una ficha de trabajo trazable desde la solicitud hasta el cierre. La estimación se hace siempre. `Estimación/SKILL Estimación.md` aporta los elementos que corresponden a la clase: el plan corto en Menor, el plan medio en Intermedio y el plan completo en Mayor.

## Cuándo usarla

Usar esta habilidad cuando se solicite crear, completar, actualizar o estimar una ficha de solicitud, mantenimiento o plan de trabajo.

## Inicio: tres respuestas y después la clase

La primera interacción pide el cambio. No pide la clasificación como primera pregunta.

Crear un archivo de preguntas según las reglas IA-DLC aplicables, por ejemplo `aidlc-docs/inception/requirements/ficha-solicitud-alcance-questions.md`, con este contenido:

```markdown
# Alcance de la solicitud

## Question 1
¿Qué se cambia y para qué?

[Answer]:

## Question 2
¿Dónde vive el cambio? Indica el lugar en el sistema: pantalla, módulo, flujo, integración, dato o permiso.

[Answer]:

## Question 3
¿Cómo se sabe que quedó resuelto? Responde en una frase comprobable.

[Answer]:
```

Esperar las tres respuestas. Con ellas, proponer la clase según el esfuerzo tradicional y el impacto:

| Clase | Esfuerzo tradicional |
|---|---|
| Menor | < 40 HH |
| Intermedio | 40–240 HH |
| Mayor | > 240 HH |

La velocidad del agente no baja la clase. No proponer Menor cuando el lugar abarca varios frentes, cuando hay que crear un objeto o una columna, cuando aparece una regla de negocio nueva, o cuando el cambio toca más de un flujo.

El líder confirma la clase. Esa declaración prevalece solo después de quedar escrita la clase que indica el esfuerzo.

Si el esfuerzo tradicional o el impacto indican Intermedio o Mayor y la declaración recibida es Menor, no cerrar el recorrido corto. Anotar en la ficha, y conservar esa anotación:

- Clase que indica el esfuerzo.
- Clase declarada.
- Motivo: horas tradicionales, impacto, o ambos.

La anotación no se omite ni se borra para usar el cuestionario breve. El cuestionario que sigue es el de la clase que indica el esfuerzo. Si, con esa anotación a la vista, el líder mantiene Menor, la declaración prevalece y la anotación permanece en la ficha.

El arranque de un proyecto nuevo conserva Gate 0 y `Product-Definition`. Las tres respuestas inician cualquier cambio. El cuestionario que sigue depende de la clase confirmada.

### Si la clase confirmada es Menor

El cuestionario termina. No pedir país, feriados, dedicación, modalidad de agrupación, colaboradores, sesiones de entendimiento, prototipos, modelo de solución ni arquitectura.

La respuesta 1, redactada con las reglas de objetivos, es el único objetivo general. No generar objetivos específicos. Las tres respuestas son la fuente suficiente: no bloquear la ficha por falta de artefactos de Discovery o de Concepción.

Los estándares de desarrollo, arquitectura, seguridad y base de datos se cumplen en la construcción. El sí del líder de desarrollo y del líder funcional, al integrar a desarrollo, no forma parte de este cuestionario y sigue siendo obligatorio.

Emitir la ficha corta en este orden:

1. Clase que indica el esfuerzo y clase confirmada. Si no coinciden, la observación de clasificación va en este punto y no se elimina.
2. Objetivo general.
3. Dónde vive el cambio.
4. Criterio de término, tomado de la respuesta 3.
5. Estándares que la construcción debe cumplir: desarrollo, arquitectura, seguridad y base de datos.

Al emitir la ficha corta, **escribir también** el archivo que alimenta la construcción de la estimación, porque un cambio Menor no tiene task-tracker:

```
<scripts-de-estimacion>/construccion-menor.json
```

Es el mismo directorio donde viven `project-config.json` y `estimacion-fases.json` (junto al generador `generate_estimacion_v3.py`). Contenido:

- `recorrido_corto`: `objetivo` (respuesta 1, redactada con las reglas de objetivos), `donde_vive` (respuesta 2) y `criterio_termino` (respuesta 3).
- `paquetes`: uno o varios entregables de construcción con sus `tareas` (1..N según la dimensión del cambio). Como mínimo, el paquete del cambio con su tarea de implementación y una tarea `Verificacion tecnica de <entregable>`. Si el cambio y sus pruebas son frentes distintos, usar un paquete por cada uno.

La skill de `Estimación` lee este archivo con la precedencia **task-tracker → ficha corta → vacía** (ver *Fuente de construcción sin task-tracker* en `Estimación/SKILL.md`). Los entregables fijos de la clase Menor (Implementación y Acta de Cierre) los agrega el generador; no van en el JSON. El corrector ortográfico del generador normaliza los nombres al generar el plan, de modo que el JSON puede volcar los textos de la ficha tal cual.

### Si la clase confirmada es Intermedio

Pedir, además de las tres respuestas, estas cuatro. No abrir el paquete completo de Concepción.

1. Qué sistemas, contratos o datos cambia.
2. De uno a tres objetivos específicos, redactados con las reglas de objetivos.
3. Cómo se prueba y cómo se acepta.
4. Si toca acceso, datos personales, secretos o el esquema de base de datos.

Con eso actúa la puerta de Concepción: Arquitectura y Seguridad revisan el diseño. La estimación de Intermedio incluye construcción, prueba y aceptación, certificación acotada a lo que el cambio toca, implementación, estabilización y acta de cierre. Para fecharla se piden país, calendario y dedicación. No incluye sesiones de entendimiento, prototipos, modelo de solución, arquitectura completa ni Mob Elaboration.

Las cuatro respuestas y las tres del inicio son la fuente suficiente. No bloquear la ficha por falta del paquete de Discovery o de Concepción. Los estándares de desarrollo, arquitectura, seguridad y base de datos se cumplen en la construcción. El sí del líder de desarrollo y del líder funcional al integrar a desarrollo sigue siendo obligatorio.

Emitir la ficha media en este orden:

1. Clase que indica el esfuerzo y clase confirmada. Si no coinciden, la observación de clasificación va en este punto y no se elimina.
2. Objetivo general y de uno a tres objetivos específicos.
3. Dónde vive el cambio, y qué sistemas, contratos o datos cambia.
4. Cómo se prueba y cómo se acepta.
5. Si toca acceso, datos personales, secretos o el esquema de base de datos.
6. Estándares que la construcción debe cumplir: desarrollo, arquitectura, seguridad y base de datos.

### Si la clase confirmada es Mayor

Continuar con las reglas de objetivos y con los insumos de más abajo. Aplicar Estimación y, si la metodología es `ai-dlc`, incluir Mob Elaboration. Corresponden ideación, Concepción, el plan, la puerta previa al despliegue y la de operación.

## Reglas de objetivos por clasificación

| Clasificación confirmada | Objetivo general | Objetivos específicos |
|---|---:|---:|
| Mantenimiento Menor | Exactamente uno | No generar objetivos específicos. |
| Mantenimiento Intermedio | Exactamente uno | Generar de uno a tres objetivos específicos. |
| Mantenimiento Mayor | Exactamente uno | Generar entre uno y cinco objetivos específicos, sin exceder cinco. |

La clasificación declarada prevalece cuando la clase que indica el esfuerzo ya quedó anotada. Si el alcance indica Intermedio o Mayor y la declaración es Menor, la observación permanece en la ficha y el cuestionario que sigue es el de la clase que indica el esfuerzo, hasta que el líder mantenga Menor con esa anotación a la vista.

### Redacción y validación de objetivos

Cada objetivo debe cumplir todas las reglas siguientes:

1. Iniciar con un único verbo en infinitivo.
2. Expresar en una sola oración el qué se realizará y el para qué de negocio.
3. Evitar otros verbos en infinitivo en el resto de la oración; después de `para`, usar sustantivos o expresiones nominales.
4. Mantener un resultado observable y trazable a uno o más entregables.
5. Evitar detalles atómicos de tecnología, tablas o componentes, salvo que sean indispensables para delimitar el alcance.

Plantilla:

> **[Verbo en infinitivo]** [resultado o transformación] mediante [alcance o mecanismo], para [resultado de negocio expresado como sustantivo].

Ejemplo válido:

### Ortografía y acentuación (Reglas RAE)

Toda la redacción de la ficha — objetivos, nombres de entregables y de tareas — debe cumplir las reglas ortográficas y de acentuación de la Real Academia Española (RAE). Esta regla es coherente con el corrector automático de la habilidad `Estimación` (`corrector_ortografico.py`), que se aplica al generar el plan.

Reglas de redacción obligatorias:

1. **Acentuación correcta:** aplicar tildes según las reglas de acentuación (agudas, graves, esdrújulas y sobresdrújulas), incluidas las palabras terminadas en `-ción`, `-sión`, `-ía` y los esdrújulos (`código`, `módulo`, `parámetro`, `análisis`, `técnico`, `específico`, `automático`, `núcleo`, `agnóstico`, `catálogo`).
2. **Mayúscula inicial:** cada objetivo, nombre de entregable y nombre de tarea inicia con mayúscula. El resto sigue el uso normal (no capitalizar todas las palabras).
3. **Conectores en minúscula:** preposiciones, artículos y conjunciones (`de`, `del`, `en`, `con`, `para`, `por`, `y`, `e`, `o`, `la`, `las`, `el`, `los`) van en minúscula salvo cuando abren la oración.
4. **Términos técnicos protegidos:** las siglas y términos técnicos en inglés se respetan tal cual (`API`, `REST`, `AWS`, `Lambda`, `JWT`, `SQL`, `PWA`, `IAM`, `WAF`, `UDF`, etc.); no se acentúan ni se pasan a minúscula.
5. **Puntuación:** los objetivos terminan con punto final y no contienen espacios dobles.

Al emitir la ficha, revisar cada texto contra estas reglas. Si la ficha desemboca en la generación del plan con `Estimación`, el corrector ortográfico se encarga de normalizar los nombres de tareas y entregables automáticamente; la ficha, no obstante, debe entregarse ya corregida.

Antes de emitir la ficha, validar:

- [ ] Existe exactamente un objetivo general.
- [ ] La cantidad de objetivos específicos corresponde a la clasificación.
- [ ] Cada objetivo inicia con un único verbo en infinitivo.
- [ ] Cada objetivo expresa qué y para qué.
- [ ] La redacción cumple las reglas ortográficas y de acentuación RAE (tildes, mayúscula inicial, conectores en minúscula, siglas técnicas intactas y punto final en objetivos).
- [ ] Los objetivos no se duplican entre sí.
- [ ] Los objetivos no dependen de decisiones externas no confirmadas sin reflejarlas como supuesto o riesgo.

## Insumos del plan completo: solo Mayor

País, calendario, dedicación y colaboradores se piden en Intermedio para fechar su estimación, y en Mayor para el plan completo. No se piden en Menor.

Después de confirmar la clase, cargar y aplicar `Estimación/SKILL Estimación.md` con los elementos de esa clase.

**Regla de procedencia:** En Mayor, los artefactos del plan completo provienen de discovery, inception o requerimientos validados. Si no existen, registrarlos como bloqueador y no generar ese plan hasta obtenerlos. En Menor bastan las tres respuestas. En Intermedio bastan las tres respuestas y las cuatro del cuestionario medio.

1. Nombre y código de la solicitud o proyecto.
2. Alcance funcional, técnico y no funcional confirmado, con sus artefactos fuente.
3. Modalidad de agrupación: `by_deliverable` o `by_layer`.
4. Cantidad de colaboradores y porcentaje de dedicación individual.
5. Metodología: `ai-dlc` o `traditional`, si no está definida.
6. Fecha de inicio.
7. **País y jurisdicción del calendario laboral nacional**, incluidos días laborables y feriados oficiales aplicables.
8. **Líder del proyecto**, identificado como un recurso del plan, para asignar las tareas de seguimiento.

No inventar estos datos. Si solo se requiere una ficha preliminar, registrar país, calendario y líder como bloqueadores; no publicar fechas finales calculadas con un calendario genérico.

## Unidad de medida, capacidad y calendario

- El esfuerzo del plan se expresa exclusivamente en **HH**.
- Un día hábil equivale a **8 HH únicamente para una dedicación de 100 %**. Para cada recurso, la capacidad productiva diaria es `8 × dedicación`; por ejemplo, 90 % = 7.2 HH/día y 50 % = 4 HH/día.
- Las fechas se calculan con los días hábiles y feriados nacionales del país seleccionado. No programar tareas en fines de semana ni feriados nacionales; feriados regionales o locales requieren confirmación explícita.
- Documentar en la ficha el país, jurisdicción, lista o fuente de feriados aplicada, fecha de inicio, fecha de fin y los supuestos de calendario.

## Regla de conformación del plan y entregables

Aplicar la homologación de `Estimación` y mantener trazabilidad entre alcance, objetivo, entregable, tarea, dependencia, recurso, HH y criterio de término.

Cuando se use `by_deliverable` en Mayor, organizar por entregables de negocio y conservar `MOB`, `MOD`, `ARQ`, `CTI`, `CF`, `IMP`, `EST` y `AC` cuando correspondan. `MOB` solo se incluye en Mayor con metodología `ai-dlc`. En Intermedio el plan lleva construcción, certificación acotada, aceptación, implementación, estabilización y acta. En Menor el plan lleva construcción, verificación, implementación y acta. Cuando se use `by_layer`, organizar por capas técnicas sin omitir los elementos de cierre que correspondan a la clase.

### Entregable obligatorio: MOB — Mob Elaboration (Mayor, AI-DLC)

Cuando la clase es Mayor y la metodología es `ai-dlc`, el plan **debe incluir** como primer entregable.

**Nombre homologado:** `MOB — Mob Elaboration`

**Condición:** No se incluye en Menor ni en Intermedio. Para metodología `traditional`, este entregable no existe.

**Tareas sugeridas (referencia del estándar de homologación):**

1. Realizar análisis preliminar del contexto de la solución
2. Preparar contexto para la Herramienta / fase de Inception
3. Ejecutar sesiones de entendimiento con el negocio
4. Diseñar y validar prototipos
5. Validar y refinar propuesta por el equipo técnico
6. Realizar el seguimiento y gestión

Las tareas se adaptan al alcance específico de la solicitud, pero deben cubrir los aspectos listados. La tarea de "Seguimiento y gestión" aplica según las reglas de este skill (2 HH, responsable = líder del proyecto). Este bloque de Mob Elaboration no se usa en Menor ni en Intermedio.

En los entregables que la clase incluye, cada uno debe tener tareas con descripción técnica, pasos de desarrollo, HH, responsable, dependencias duras y definición de terminado. Además, **cada entregable excepto `AC — Acta de Cierre` debe tener exactamente una tarea obligatoria**:

- **Nombre:** `Seguimiento y gestión — <entregable>`.
- **Esfuerzo:** `2 HH`, adicional al esfuerzo de ejecución salvo replanificación explícitamente aprobada.
- **Responsable:** el líder del proyecto confirmado.
- **Fechas:** mismo inicio y mismo fin de su entregable padre, de modo que cubra todo su intervalo calendario.
- **Excepción:** nunca agregar seguimiento y gestión a `AC — Acta de Cierre`.

Implementación, estabilización y acta se incluyen según la clase. En Menor no hay estabilización. En Intermedio y Mayor la secuencia de los elementos incluidos es:

1. **IMP — Implementación:** despliegue o puesta en operación de la solución aprobada.
2. **EST — Estabilización:** posterior a `IMP`, con monitoreo inicial, corrección de incidencias atribuibles a la implementación, validación de operación y evidencia de estabilidad.
3. **AC — Acta de Cierre:** posterior a `EST`, con aceptación o pendientes, evidencias, incidencias remanentes, lecciones aprendidas y cierre formal.

Dependencias obligatorias: `EST` depende de `IMP`; `AC` depende de `EST`. No cerrar una ficha con implementación sin `EST` y `AC`.

## Regla obligatoria: HH del Acta de Cierre (AC)

El entregable **AC — Acta de Cierre** tiene un esfuerzo fijo determinado por la clasificación de la solicitud. **No se calcula mediante fórmula ni se le aplica la regla de seguimiento y gestión.**

| Clasificación | HH del Acta de Cierre |
|---|---:|
| Mantenimiento Mayor | 1 HH |
| Mantenimiento Intermedio | 0.5 HH |
| Mantenimiento Menor | 0.5 HH |

Reglas:
1. El valor de HH del AC es fijo y no debe ser modificado por ningún cálculo de proporcionalidad, redondeo ni capacidad.
2. No se agrega tarea de "Seguimiento y gestión" al entregable AC.
3. La tarea única del AC es "Elaborar Acta de Cierre" con el esfuerzo indicado en la tabla anterior.
4. Para determinar la clasificación, usar la confirmada al inicio del flujo de la ficha de solicitud.

## Estimación y asignación

1. Calcular HH por tarea y consolidarlas por entregable, incluyendo los 2 HH de seguimiento en cada entregable elegible.
2. Asignar recursos declarados para esta solicitud; el líder debe existir en la tabla de recursos y recibir todas las tareas de seguimiento.
3. Aplicar la capacidad diaria `8 × dedicación` por recurso y paralelizar solo tareas sin dependencias duras ni conflicto de capacidad.
4. Calcular el cronograma desde la fecha de inicio con el calendario nacional confirmado; diferenciar esfuerzo de esperas externas.
5. Generar unidades `RF` del plan de trabajo únicamente desde requisitos confirmados.
6. Elaborar `plan.json` y Excel con Plan, Resumen y Colaboradores, con los elementos de la clase. En Intermedio y Mayor incluir país, feriados, HH/día, capacidad por recurso y seguimiento. En Menor el plan se limita al cambio, su verificación, la implementación y el acta.

## Formato de salida: Ficha de Solicitud

En Mantenimiento Menor usar la ficha corta. En Intermedio usar la ficha media. En Mayor, presentar la ficha en este orden:

1. **Identificación:** nombre, código, solicitante, fecha, clasificación, estado y líder del proyecto.
2. **Descripción y alcance:** problema, resultado esperado, inclusiones, exclusiones, supuestos y restricciones.
3. **Objetivo general:** uno, validado.
4. **Objetivos específicos:** según clasificación; omitir para Mantenimiento Menor.
5. **Artefactos y trazabilidad:** inventario de fuentes.
6. **Plan de trabajo:** código, entregable, tarea, descripción, HH, responsable, dependencia, inicio, fin y criterio de término.
7. **Resumen de estimación:** total de HH, capacidad por recurso, país/calendario/feriados, período y ruta crítica.
8. **Hitos de cierre:** `IMP`, `EST` y `AC`, con dependencias y criterios de aceptación.
9. **Riesgos y decisiones pendientes:** bloqueadores, responsables y próxima acción.

## Lista de control de entrega

- [ ] Las tres respuestas de alcance se recibieron antes de proponer la clase.
- [ ] En Mantenimiento Menor el cuestionario terminó en la ficha corta, sin Mob Elaboration ni insumos de calendario.
- [ ] En Intermedio la ficha media trae sistemas o datos, de uno a tres objetivos específicos, prueba y aceptación, y si toca acceso, datos personales, secretos o el esquema. Su estimación no incluye Mob Elaboration, modelo ni arquitectura.
- [ ] Los objetivos cumplen la regla de cantidad y redacción.
- [ ] La estimación usa los elementos de la clase confirmada.
- [ ] En Intermedio y Mayor, `hours_per_day` es 8 y cada capacidad diaria se calculó como `8 × dedicación`.
- [ ] En Intermedio y Mayor, país, jurisdicción, feriados nacionales y fecha de inicio están confirmados; las fechas no usan un calendario genérico.
- [ ] En Intermedio y Mayor, el líder del proyecto está definido como recurso del plan.
- [ ] Cada entregable elegible contiene exactamente una tarea de seguimiento de 2 HH, asignada al líder y con las mismas fechas del padre; `AC` no la contiene.
- [ ] Cada tarea está vinculada a un entregable y criterio de término.
- [ ] Si existe `IMP`, se incluyeron `EST` posterior a `IMP` y `AC` posterior a `EST`.
- [ ] Supuestos, riesgos y bloqueadores se distinguen de los hechos confirmados.

## Cumplimiento de extensiones IA-DLC

Para la creación de esta ficha y de esta habilidad, las reglas de seguridad, resiliencia y pruebas basadas en propiedades son **N/A**: no se define ni modifica una carga desplegable, infraestructura, endpoint, almacenamiento, lógica de negocio ni pruebas. Si la ficha da lugar a diseño o generación de código, evaluar dichas extensiones en la etapa IA-DLC correspondiente.
