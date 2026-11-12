---
name: intelix-certificacion
description: "Certifica si un desarrollo entregado cumple con los estandares INTELIX de desarrollo, infraestructura y seguridad, y emite un dictamen Apto / Con observaciones / No apto para QA. Ejecuta el motor determinista de verificacion (scripts/verificacion/), interpreta los hallazgos ambiguos, valida los N/A justificados y redacta un acta de certificacion. Usar para: certificar proyecto, certificacion de cumplimiento, verificar estandares INTELIX, es apto para QA, auditoria de cumplimiento, dictamen de estandares, revisar proyecto entregado, certificar despliegue."
---

# Skill: Certificacion de Cumplimiento de Estandares INTELIX

Este skill es la **capa interpretativa (para humanos)** del framework hibrido de
verificacion y certificacion. Conduce la certificacion de un desarrollo entregado
contra los estandares INTELIX y produce un **acta legible** con el dictamen.

> **Modelo hibrido (no lo rompas):**
> - El **motor** (`scripts/verificacion/`) es **determinista**: mismo input, mismo
>   dictamen. Es la fuente de verdad de la puntuacion. Tambien corre solo en CI.
> - Este **skill** es **interpretativo**: ejecuta el motor, aplica criterio en los
>   bordes que el analisis estatico no resuelve y redacta el acta.
> - **Regla inquebrantable:** el skill **NUNCA recalcula** la puntuacion ni el
>   dictamen. Consume el `resultado.json` del motor tal cual.

## Cuando se activa

El usuario pide certificar/verificar un proyecto entregado, o pregunta si un
desarrollo es apto para QA respecto a los estandares INTELIX.

## Entradas requeridas

- **Ruta del proyecto a auditar** (carpeta o repo clonado). Si falta, pedirla.
- **Exposicion de la app** (OBLIGATORIO preguntar si no se indica): `publica`
  (expuesta a internet) o `corporativa` (solo red interna). Determina si los
  controles de perimetro (WAF, HTTPS/TLS, CORS estricto, IdP/MFA) son exigibles.
  En `publica` un CORS abierto o una cookie no-secure pasan a **critico**; en
  `corporativa` esos controles se marcan N/A. Se pasa al motor con `--exposicion`.
- **Alcance de la certificacion** (preguntar si no se indica): `estandares`
  (por defecto; desarrollo, arquitectura, BD y seguridad, SIN pruebas) o `completo`
  (puerta a produccion: agrega pruebas/cobertura como exigibles). Se pasa al motor
  con `--alcance`. Regla practica: certificar estandares usa `estandares`;
  para autorizar el paso a produccion, usar `completo`.
- **Idioma del informe** (preguntar si no se indica): `es` o `en`. Se pasa al motor
  con `--idioma`. El acta se redacta en ese idioma, con su gramatica y su
  ortografia. Espanol: acentos y puntuacion del castellano. Ingles: ortografia
  estandar. No mezclar los dos en el mismo informe.

## Fuentes de verdad (vinculantes)

En proyectos generados con `intelix-cli` (esta plantilla):

- `.intelix/applicability-policy.json` — perfiles técnicos aplicables, dominios disponibles y
  estado de soporte de la certificación. Leerlo antes de ejecutar el motor. Si
  `certification.status` es `unsupported`, no emitir ni reinterpretar un dictamen AWS/React como
  certificación integral del proyecto.
- `docs/estandares/estandares-mobile-kmp-intelix.md` — controles MOB1–MOB8 para preparación
  técnica móvil. Su dictamen no equivale a aprobación de Google Play o App Store.
- `docs/estandares/estandares-desarrollo-intelix.md` — desarrollo, IaC, React, hexagonal.
- `docs/estandares/seguridad-baseline.md` — baseline R1–R14.
- `.kiro/steering/seguridad-baseline.md` — misma baseline para el agente.
- `docs/guides/gobierno-iadlc-intelix.md` — gates, clasificacion y Gate 0.
- Reglas del motor: `scripts/verificacion/estandares/*.json`.

No inventes reglas: cada hallazgo cita su fuente (documento/seccion o control R#).

## Frontend con AWS Amplify (CI/CD, WAF, TLS/hosting e identidad gestionados en consola)

El motor detecta AWS Amplify cuando existe al menos una senal fuerte de hosting/infraestructura
(`amplify.yml`/`amplify.yaml` o carpeta `amplify/`), y registra `aws-amplify`/`@aws-amplify/*`
en `package.json` como senal complementaria (la dependencia del SDK por si sola no activa las
excepciones de hosting). Cuando hay Amplify, los controles cuya evidencia vive en la consola de
AWS Amplify (no en archivos del repositorio) **no se marcan como amenaza ni bloquean el dictamen**:
pasan a `diferido-piloto` (igual que los demas controles que exigen app desplegada) con una
advertencia explicita de donde verificarlos.

- **`DEVOPS1`/`R5` — pipeline CI/CD y SAST/escaneo de dependencias:** si no hay
  `.gitlab-ci.yml` pero hay Amplify, el build/deploy del frontend lo gestiona el CI/CD
  integrado de Amplify (buildSpec en consola). `R5` es `hard_stop`; sin esta excepcion forzaria
  **No apto** solo por no encontrar un archivo que, con Amplify, no tiene por que existir.
- **`P1` — WAF:** si la app es `publica` y no hay WAF en IaC pero hay Amplify, el WAF del
  frontend se integra desde la consola de Amplify.
- **`P2` — HTTPS/TLS, hosting y dominio:** si no hay terminacion TLS en IaC pero hay Amplify,
  el certificado SSL/TLS, el dominio y la distribucion los gestiona Amplify Hosting. Una
  cookie insegura detectada en codigo real sigue marcandose `no-cumplido`: eso si es evidencia
  del repositorio, Amplify no la justifica.
- **`P4` — identidad gestionada (Cognito/MFA):** si no se detecta IdP en codigo/IaC pero hay
  Amplify, Amplify Auth puede estar gestionando Cognito/MFA desde la consola sin dejar rastro
  en el codigo auditado.
- **`R1` — secretos:** la auditoria del repositorio no cambia. Si se detecta Amplify, se agrega
  una nota de que las variables de entorno del frontend se configuran en la consola de Amplify
  y deben revisarse alli tambien.

En el acta, estos hallazgos aparecen en la seccion **6. Estado de controles validados y
conformidad**, tabla de no verificables/diferidos — nunca en la seccion de fortalezas ni como
hallazgo critico/alto abierto. El auditor no reclasifica estos estados: los redacta tal como
los entrega el motor y, si hace falta, agrega una interpretacion aparte (ver seccion
**3. Interpretar hallazgos ambiguos**) aclarando que la verificacion efectiva de Amplify queda
pendiente de evidencia de consola (captura de pantalla o export de configuracion), no de
analisis estatico del repositorio.

## Flujo del skill

### 1. Preparar
- Confirmar la ruta del proyecto y validar que existe y es legible.
- Leer `.intelix/applicability-policy.json` cuando exista. Un estado `review-required` exige dejar
  explícita la limitación en el acta; un estado `unsupported` detiene la certificación.
- Si `enabledDomains` contiene `mobile-kmp`, el motor evalúa únicamente MOB1–MOB8 y el acta debe
  declarar que no cubre firma, publicación ni políticas vigentes de tiendas.
- No modificar ni ejecutar codigo del proyecto auditado (analisis estatico, solo
  lectura).

### 2. Ejecutar el motor determinista
```
node scripts/verificacion/analizador.js --proyecto <ruta> --exposicion <publica|corporativa> --alcance <estandares|completo> --idioma <es|en>
```
- El motor produce `resultado.json` (inventario, hallazgos por estandar,
  puntuaciones por categoria y dictamen) y, si se pide, el informe HTML y el
  Markdown ejecutivo (mismas ocho secciones).
- El motor esta implementado en Node.js (no requiere Python ni dependencias
  externas; corre con el runtime que la plantilla ya exige). Genera en la carpeta
  de salida: `certificacion-<proyecto>-<fecha>.json`, `.md` y `.html`.
- Codigos de salida del motor: 0 = Apto, 1 = Con observaciones, 2 = No apto,
  3 = error de uso. Utiles para usar el motor como puerta en CI.

### 3. Interpretar hallazgos ambiguos (valor del skill)
Sobre el `resultado.json` (sin alterarlo), aplicar criterio en:
- **Posibles falsos positivos:** un `Resource: "*"` que el motor marca critico pero
  que tiene una justificacion legitima documentada.
- **Dependencias dudosas dominio->AWS:** confirmar si es acoplamiento real o un
  patron aceptado.
- **N/A justificado:** exigir SIEMPRE una justificacion explicita antes de aceptar
  un control como N/A, coherente con la precedencia de decision del baseline
  (aplicabilidad -> regla explicita -> severidad -> hard_stop).
- **Diferidos al piloto:** confirmar que los controles que requieren app desplegada
  (WAF, CORS runtime, Cognito/MFA, tenant/IDOR, S3, Guardrails de Bedrock,
  monitoreo) quedan como **diferidos**, nunca como cumplidos. Lo mismo aplica a los
  controles que el motor difiere por deteccion de AWS Amplify (pipeline, WAF, TLS/hosting,
  identidad del frontend): ver seccion **Frontend con AWS Amplify** de este skill.

Registrar cada interpretacion como anotacion aparte; el `resultado.json` de origen
permanece intacto.

### 4. Redactar el acta de certificacion (Markdown y HTML)
El Markdown es el informe ejecutivo. Sigue la seccion interna
**Forma del informe ejecutivo (ocho secciones)** de este mismo skill: ocho
secciones, de la ficha tecnica a la matriz de trazabilidad. El motor ya lo
escribe en `reportes/markdown.js`. El texto sale solo del `resultado.json` de
esta ejecucion. No reutilices redaccion de certificaciones anteriores. Si el
alcance es `estandares`, el informe no habla de pruebas. Si el alcance es
`completo`, informa los controles de prueba de esta ejecucion.

Si el auditor agrega interpretaciones, van dentro de la seccion del hallazgo
que interpretan. No cambian el dictamen, la puntuacion ni la evidencia.

El HTML replica las mismas ocho secciones. Identidad visual, la misma de las
presentaciones INTELIX:

- Tipografia: Segoe UI.
- Tinta `#0A1F44`, azul `#1E5AE8`, cian `#00C2D1`, papel `#F5F7FB`.
- Cabecera: degradado `#100e0c` → `#0c1830` → `#0a3a72` → `#0d78b0` → `#18c8c4`.
- Logo Beconsult INTELIX en banda blanca sobre el degradado.
- Dictamen: verde `#12B886` si es apto, ambar `#F5A524` si hay observaciones,
  rojo `#E5484D` si no es apto.
- Prioridad y estado usan pastillas con el fondo claro de las presentaciones
  (`#E3F8EF`, `#FDF1DC`, `#FCE7E8`, `#E7F0FF`), con texto oscuro. No pintes el
  texto en blanco sobre un color saturado.

Al redactar el Markdown, aplica la seccion **Forma del informe ejecutivo
(ocho secciones)** de este skill.
Nunca incluir secretos, tokens, credenciales ni PII (R7).

## Forma del informe ejecutivo (ocho secciones)

El acta se arma a partir del `resultado.json` del motor (o del acta en bruto).
El dictamen y la puntuacion se copian tal como vienen: no se recalculan. El
motor escribe esta forma en Markdown y en HTML; si redactas a mano, replica las
mismas tablas y las mismas ocho secciones. Forma general: tablas, no muros de
viñetas.

### 1. Encabezado y ficha tecnica

Tabla de dos columnas `Campo` | `Valor`. Filas: Proyecto, Fecha de evaluacion,
Estado del dictamen (`🛑` / `🟡` / `✅` **DICTAMEN**), Calificacion global
(`[n] % / 100 %`). El simbolo acompaña al codigo del motor: 🛑 si no es apto,
🟡 si hay observaciones, ✅ si es apto.

### 2. Resumen ejecutivo y dictamen de calidad

- Una frase con la puerta de calidad (autoriza o rechaza la promocion).
- **Fortalezas del sistema evaluado:** tabla `Estandar evaluado` | `Ref` |
  `Evidencia`. Solo controles en estado cumplido.
- **Puntos clave de cierre:** tabla `Estandar evaluado` | `Ref` | `Prioridad` |
  `Evidencia`. Criticos abiertos primero; luego prioridad alta o media. No
  mezclar aqui los no verificables ni los N/A.
- Cada fila sale de un hallazgo del origen. No agregues un riesgo o una
  fortaleza que el informe no traiga.

### 3. Evaluacion por dominio tecnico

Tabla con columnas `Dominio Tecnico` | `Peso Ponderado` | `Cumplimiento (%)` |
`Nivel de Riesgo` | `Estado de la Puerta`. El nivel de riesgo y el estado de la
puerta se leen de la puntuacion y de si el dominio tiene un critico abierto. No
se estiman con otro criterio.

### 4. Hallazgos criticos y bloqueadores (Prioridad 1 - Inmediata)

- Titulo descriptivo en lenguaje de negocio con la referencia al codigo al final
  entre corchetes. Ej: `### Presencia de Secretos y Credenciales Embebidas en Codigo [Ref: R1]`.
  El titulo es el nombre del control en el origen; no lo sustituyas por otro.
- Para cada hallazgo critico, una tabla de dos columnas `Campo` | `Valor`:
  - **Brecha / Evidencia:** detalle exacto extraido del reporte.
  - **Riesgo e impacto:** solo la criticidad registrada por el motor. No añadas
    impacto financiero, operativo o de negocio que el origen no mencione.
  - **Solucion recomendada:** la correccion que trae el reporte.

### 5. Hallazgos de riesgo alto y medio (Prioridad 2 - Requerido antes de produccion)

- Agrupar por dominio tecnico (Infraestructura, Seguridad, DevOps, Codigo).
- Una tabla por dominio: `Estandar evaluado` | `Ref` | `Prioridad` |
  `Brecha / Evidencia` | `Solucion recomendada`.
- Un control de prioridad baja que este abierto tambien se lista aqui, con su
  prioridad, para no omitirlo.

### 6. Estado de controles validados y conformidad

- Primero, tabla de controles **cumplidos:** `Ref` | `Estandar evaluado` |
  `Evidencia`.
- Despues, tabla de **no verificables, N/A justificados o diferidos:** `Ref` |
  `Estandar evaluado` | `Estado actual` | `Evidencia`. No los presentes como
  fortalezas.

### 7. Plan recomendado de remediacion

- Una linea de ruta:
  `[ Fase 1: Remediacion critica ] ──► [ Fase 2: Robustecimiento ] ──► [ Fase 3: Re-certificacion ]`.
- Tabla `Fase` | `Alcance` | `Controles` con los codigos que correspondan. La
  fase 3 es volver a certificar este desarrollo. No inventes fechas ni
  responsables.

### 8. Anexo: leyenda y matriz de trazabilidad tecnica (obligatorio al final)

Tabla final con TODOS los codigos de control presentes en el informe:
`Codigo de Control` | `Dominio Tecnico` | `Descripcion del Estandar Evaluado` |
`Estado Actual`.

### Reglas de redaccion y calidad

- **No inventar ni omitir datos:** conservar al 100 % la fidelidad de las
  evidencias, porcentajes, rutas y archivos del origen.
- **Tono:** profesional, directo, libre de adjetivos superfluos y orientado a la
  gestion de riesgos.
- **Formato:** solo tablas Markdown simples, viñetas y negritas para jerarquizar.
- No comparar este desarrollo con otro proyecto, con la plantilla, con una
  version anterior ni una categoria con otra. Sin formulaciones de contraste
  ("a diferencia de", "en lugar de", "mientras que", "mejor que", "peor que").
- **Idioma:** el seleccionado en la entrada. Gramatica y acentuacion de ese
  idioma en todo el acta, titulos incluidos. El codigo de dictamen del motor se
  conserva.
- Nunca incluir secretos, tokens, credenciales ni datos personales. Si la
  evidencia cita una ruta, conserva la ruta y no copies el valor secreto.

## Reglas del dictamen (las fija el motor, el skill solo las explica)

- **Apto para QA:** puntuacion total >= 85% y cero criticos abiertos.
- **Con observaciones:** 70-84% y a lo sumo un Alto por categoria; requiere plan.
- **No apto:** < 70% o dos o mas criticos abiertos.
- Cualquier **critico** aplicable no cumplido fuerza su categoria a 0% y dictamen
  **No apto**, sin importar el agregado.
- Un control **diferido al piloto** o **N/A justificado** no penaliza, pero se lista.

## Restricciones

- Solo lectura sobre el proyecto auditado; no ejecuta su codigo.
- No avanza el estado del workflow AI-DLC ni aprueba gates.
- No recalcula la puntuacion: el motor es la fuente de verdad.
- El motor debe poder correr sin este skill (puerta de CI).

## Salidas

- `certificacion-<proyecto>-<fecha>.json` (del motor) — evidencia determinista.
- `certificacion-<proyecto>-<fecha>.html` (del motor) — las mismas ocho secciones
  que el Markdown, con la identidad visual INTELIX.
- **Informe ejecutivo en Markdown** (del motor, segun la seccion interna
  **Forma del informe ejecutivo (ocho secciones)**) — ocho secciones para
  gerencia, con la matriz de trazabilidad al final.

Por defecto el motor escribe en `<proyecto>/docs/certificaciones/`.
