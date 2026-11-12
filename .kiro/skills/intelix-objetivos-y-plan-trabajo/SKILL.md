---
name: intelix-objetivos-y-plan-trabajo
description: Define objetivos generales y específicos según la escala menor, intermedia o mayor de un proyecto, y genera planes de trabajo con estimaciones, entregables, dependencias y asignaciones para programadores senior asistidos por Kiro IA.
---

# Skill: Objetivos y Plan de Trabajo

## Propósito

Convertir el alcance confirmado de un proyecto en objetivos aptos para una ficha de plan de trabajo y en un plan ejecutable. El skill debe mantener trazabilidad entre alcance, objetivos, entregables, esfuerzo, dependencias y criterios de término.

## Cuándo usarlo

Usar este skill cuando se solicite definir objetivos de proyecto, clasificar una iniciativa como menor, intermedia o mayor, estimar esfuerzo, estructurar un plan de trabajo, asignar programadores senior Kiro (IA) o preparar una ficha de planificación.

## Cambio menor

Si el pedido es un cambio o una corrección, pedir primero estas tres respuestas. No pedir la clasificación como primera pregunta.

1. Qué se cambia y para qué.
2. Dónde vive el cambio: pantalla, módulo, flujo, integración, dato o permiso.
3. Cómo se sabe que quedó resuelto, en una frase comprobable.

Con esas respuestas, proponer la clase por esfuerzo tradicional e impacto: Menor por debajo de 40 HH, Intermedio de 40 a 240 HH, Mayor por encima de 240 HH. La velocidad del agente no baja la clase. No proponer Menor si el lugar abarca varios frentes, si hay que crear un objeto o una columna, si aparece una regla de negocio nueva, o si el cambio toca más de un flujo.

El líder confirma la clase. Esa declaración prevalece solo después de quedar escrita la clase que indica el esfuerzo.

Si el esfuerzo tradicional o el impacto indican Intermedio o Mayor y la declaración recibida es Menor, no usar el recorrido corto. Dejar anotado, y conservar la anotación en la salida: clase que indica el esfuerzo, clase declarada y motivo. El cuestionario que sigue es el de la clase que indica el esfuerzo. Si, con esa anotación a la vista, el líder mantiene Menor, la declaración prevalece y la anotación no se borra.

Cuando la clase confirmada es Menor:

- La primera respuesta, redactada con las reglas de este skill, es el único objetivo general.
- No generar objetivos específicos.
- No pedir nombre del proyecto, entregables, capacidad ni artefactos de Discovery o de Concepción. Las tres respuestas son la fuente suficiente.
- Estimar solo el cambio, su verificación, la implementación y el acta de cierre. No armar Mob Elaboration, modelo ni arquitectura.
- Entregar objetivo general, lugar del cambio, criterio de término y la estimación de esos elementos.
- Los estándares de desarrollo, arquitectura, seguridad y base de datos se cumplen en la construcción.

Cuando la clase confirmada es Intermedio, pedir además:

1. Qué sistemas, contratos o datos cambia.
2. De uno a tres objetivos específicos.
3. Cómo se prueba y cómo se acepta.
4. Si toca acceso, datos personales, secretos o el esquema de base de datos.

Esas respuestas, con las tres del inicio, son la fuente suficiente. La estimación de Intermedio incluye construcción, prueba y aceptación, certificación acotada, implementación, estabilización y acta. Para fecharla se piden país y calendario. No incluye sesiones de entendimiento, prototipos, modelo de solución, arquitectura completa ni Mob Elaboration. La puerta de Concepción queda para que Arquitectura y Seguridad revisen el diseño.

Cuando la clase confirmada es Mayor, aplican los datos de entrada de la sección siguiente, el plan y el cuestionario completo.

El arranque de un proyecto nuevo conserva Gate 0 y `Product-Definition`.

## Datos de entrada obligatorios

País, calendario y dedicación se piden en Intermedio y en Mayor para fechar la estimación. El resto de estos datos aplica al plan completo de Mayor. No bloquear la estimación de Menor por su ausencia.

**Regla de procedencia obligatoria (Mayor):** Los artefactos fuente del plan completo deben provenir de la documentación generada en discovery, inception o material de requerimientos validado. No se debe inventar alcance, objetivos ni tareas sin respaldo documental. Si no existen artefactos de estas fases, solicitarlos como bloqueador antes de generar el plan completo.

1. Nombre del proyecto.
2. Clasificación declarada: `menor`, `intermedio` o `mayor`.
3. Alcance funcional y técnico confirmado, incluyendo integraciones, migraciones y requerimientos no funcionales.
4. Entregables esperados y restricciones conocidas.
5. Capacidad disponible: cantidad de programadores senior Kiro (IA) y horas productivas semanales por persona.

Si falta un dato obligatorio, solicitarlo antes de calcular fechas. Si se requiere un borrador inmediato, documentar la suposición de forma visible y separar esfuerzo de duración calendario.

## Clasificación y objetivos

### Reglas por tamaño

| Clasificación | Objetivo general | Objetivos específicos |
|---|---:|---:|
| Menor | Exactamente 1 | No generar objetivos específicos. |
| Intermedio | Exactamente 1 | Generar de 1 a 3; nunca más de 3. |
| Mayor | Exactamente 1 | Generar de 1 a 5; nunca más de 5. |

La clasificación declarada prevalece cuando la clase que indica el esfuerzo ya quedó anotada. Si la evidencia indica Intermedio o Mayor y la declaración es Menor, la anotación permanece en la salida y no se usa el recorrido corto hasta que el líder mantenga Menor con esa anotación a la vista.

### Reglas de redacción

Cada objetivo debe:

1. Tener un único verbo en infinitivo, ubicado al inicio.
2. Expresar el **qué** y el **para qué** en una misma oración.
3. Usar sustantivos después de `para` en lugar de verbos en infinitivo adicionales.
4. Mantenerse alineado con un resultado o entregable observable.
5. Evitar soluciones excesivamente atómicas, nombres de tablas o tecnologías, salvo que sean esenciales para definir el alcance.

Plantilla:

> **[Verbo en infinitivo]** [qué se transformará, implementará o consolidará] mediante [mecanismo o alcance], para [resultado de negocio expresado con sustantivos].

Ejemplo válido:

> **Centralizar** el modelo de precios mediante una estructura relacional de descuentos por lista, para la eliminación de campos manuales y la administración dinámica de aumentos y descuentos.

Ejemplo que debe corregirse:

> Centralizar ... para eliminar ... y gestionar ...

Corrección: sustituir `eliminar` y `gestionar` por `la eliminación` y `la gestión`.

### Validación obligatoria de objetivos

Antes de presentar el resultado, comprobar:

- [ ] Hay exactamente un objetivo general.
- [ ] La cantidad de objetivos específicos respeta la clasificación.
- [ ] Cada objetivo tiene un solo verbo en infinitivo.
- [ ] Cada objetivo contiene qué y para qué.
- [ ] Los objetivos no duplican el alcance de otros objetivos.
- [ ] Los objetivos no prometen resultados dependientes de decisiones externas aún no confirmadas.

### Validación lingüística y ortográfica (Reglas RAE)

La validación lingüística RAE es una **puerta bloqueante**, no una sugerencia. El contrato lingüístico común está implementado en la habilidad de Estimación (`corrector_ortografico.py`) y exige:

1. **Acentuación rigurosa:** Aplicar tildes conforme a las reglas de la RAE (agudas, graves, esdrújulas, palabras en `-ción`, `-sión`, `-ía`, y términos técnicos como `código`, `módulo`, `parámetro`, `análisis`, `diseñar`, `solución`, `núcleo`, `agnóstico`, `catálogo`).
2. **Mayúscula inicial:** En objetivos, entregables y tareas.
3. **Conectores en minúscula:** Artículos, preposiciones y conjunciones (`de`, `del`, `en`, `con`, `para`, `por`, `y`, `la`, `los`, etc.) salvo al abrir oración.
4. **Términos técnicos protegidos:** Siglas como `API`, `SQL`, `AWS`, `Lambda`, `JWT`, `PWA`, etc., preservadas intactas sin traducir ni minúsculas forzadas.
5. **Puntuación y consistencia:** Punto final obligatorio en objetivos y erradicación de dobles espacios o marcadores pendientes (`TODO`, `TBD`).

Controles adicionales antes de emitir:

- [ ] La redacción cumple las reglas ortográficas y de acentuación RAE.
- [ ] Los nombres de entregables de cierre (`Implementación`, `Estabilización` y `Acta de Cierre`) son independientes y no se combinan.
- [ ] La salida no se presenta como definitiva si persisten faltas ortográficas o errores de acentuación.

## Reglas de estimación y asignación

### Unidad de capacidad

Cada asignación debe tener un responsable identificado como `Programador Senior Kiro (IA)`. Esta condición significa que la persona cuenta con asistencia de Kiro para análisis, diseño, generación de código, pruebas y documentación.

No aplicar un descuento automático a las horas por el uso de Kiro IA. Estimar el esfuerzo con la complejidad real del entregable y usar Kiro como habilitador de calidad, paralelización y trazabilidad. Identificar por separado los tiempos de espera externos, aprobaciones humanas, accesos y contratos de terceros.

### Referencia de calibración

Usar como orientación, no como tarifa fija:

| Tipo de tarea | Rango de referencia |
|---|---:|
| CRUD, rol o control de acceso acotado | 1,5 a 2 horas |
| Flujo o interfaz funcional simple | 5 a 8 horas |
| Administración web o módulo funcional mediano | 8 a 16 horas |
| Dashboard, analítica o integración compuesta | 8 horas o más, desglosado por capacidades |
| Exportación PDF/Excel acotada | 3 horas |

Para iniciativas mayores, agrupar por módulos o flujos verticales; no sumar recursos AWS de forma atómica. Considerar explícitamente análisis, diseño, construcción, pruebas, certificación y despliegue.

### Cálculo de duración

1. Calcular primero el esfuerzo total en horas-persona.
2. Definir la capacidad semanal: `programadores senior Kiro x horas productivas por semana`.
3. Calcular la duración teórica: `horas-persona / capacidad semanal`.
4. Ajustar la duración por dependencias, secuencia técnica, riesgos y puertas de aprobación.
5. Informar al menos un escenario con una persona y otro con la capacidad recomendada.

## Procedimiento

1. Revisar requisitos, arquitectura existente, entregables, riesgos e integraciones.
2. Confirmar la clasificación recibida.
3. Extraer los resultados de negocio y agruparlos en frentes de trabajo mutuamente trazables.
4. Redactar y validar los objetivos según las reglas anteriores.
5. Descomponer el alcance en paquetes de trabajo con horas-persona, entregable, dependencia, responsable Kiro y definición de terminado.
6. Consolidar el esfuerzo, los escenarios de calendario y los hitos.
7. Distinguir hechos confirmados, supuestos, riesgos y bloqueadores.
8. Presentar la salida con la plantilla de `references/plantilla-plan-trabajo.md`.

## Formato de salida

1. Clasificación y justificación breve.
2. Objetivo general.
3. Objetivos específicos, cuando apliquen.
4. Supuestos de capacidad.
5. Plan de trabajo en tabla: fase, paquete, entregable, esfuerzo, responsable, dependencia y criterio de término.
6. Resumen de esfuerzo y escenarios de calendario.
7. Riesgos, bloqueadores y próximas decisiones.
