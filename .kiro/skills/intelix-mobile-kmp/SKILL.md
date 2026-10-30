---
name: intelix-mobile-kmp
description: >-
  Desarrolla, mantiene y revisa aplicaciones móviles Android con Kotlin y
  proyectos Kotlin Multiplatform (KMP) para Android e iOS, respetando la
  arquitectura, los source sets, la seguridad, las pruebas y el pipeline que ya
  tenga el repositorio. Aplica el estándar arquitectónico Intelix (Clean
  Architecture, patrón Result, MVVM/MVI, inyección de dependencias con Koin y
  KDoc) y, para mejoras del sistema AFV del cliente Mayoreo, el estándar
  específico de AFV que prevalece en caso de conflicto. Usar cuando se soliciten
  funcionalidades, correcciones, refactorizaciones, revisión técnica,
  certificación de preparación para QA o preparación de builds en módulos Kotlin,
  Android, Compose Multiplatform o KMP. No certifica cumplimiento de Google Play
  o App Store, no publica en tiendas y no migra una aplicación móvil a
  AWS/SAM/React.
---

# INTELIX Mobile KMP

## Propósito

Implementar y revisar cambios móviles sin imponer un stack web sobre el
repositorio. La skill cubre:

- Android nativo con Kotlin;
- Kotlin Multiplatform con targets Android e iOS;
- Compose para Android o Compose Multiplatform;
- UI iOS nativa, por ejemplo SwiftUI, consumiendo lógica compartida KMP;
- librerías compartidas KMP sin interfaz de usuario.

La arquitectura existente es la primera fuente de decisión. No reemplazar
Compose, SwiftUI, Ktor, Retrofit, SQLDelight, Room, inyección de dependencias ni
otras tecnologías solo por preferencia del agente. Un cambio de arquitectura
requiere una necesidad comprobada y aprobación explícita.

## Límites

- No aplicar los controles AWS/SAM/React al módulo móvil por analogía.
- No crear `template.yaml`, `samconfig.toml` ni un frontend React para satisfacer
  la certificación web.
- No firmar, subir ni publicar aplicaciones sin autorización explícita.
- No solicitar, mostrar ni almacenar keystores, contraseñas, tokens, perfiles de
  aprovisionamiento o credenciales de tienda.
- No afirmar que una aplicación cumple las políticas vigentes de Google Play o
  App Store sin una revisión específica contra la documentación oficial actual.
- No modificar el backend salvo que forme parte expresa de la solicitud.

## Flujo de trabajo

### 1. Reconocer el proyecto antes de proponer cambios

Inspeccionar, según existan:

- `settings.gradle.kts` y archivos `build.gradle.kts`;
- `gradle/libs.versions.toml`;
- módulos, plugins y targets declarados;
- `commonMain`, `commonTest`, `androidMain`, `androidUnitTest`, `iosMain` y sus
  variantes reales;
- manifiestos Android;
- proyecto o workspace Xcode;
- `Info.plist`, entitlements y privacy manifests;
- pipeline y tareas Gradle existentes;
- convenciones locales en `AGENTS.md`, `CLAUDE.md`, rules o steering.

Clasificar el alcance como uno de estos casos:

1. Android nativo.
2. KMP con lógica compartida y UI nativa por plataforma.
3. KMP con Compose Multiplatform.
4. Librería KMP.

Si la estructura no permite distinguirlo, informar la incertidumbre antes de
realizar una migración o cambio arquitectónico.

### 2. Definir la ubicación correcta del cambio

- Colocar en `commonMain` únicamente lógica portable entre los targets
  declarados.
- Mantener APIs Android, iOS y de JVM fuera de `commonMain`.
- Usar `expect`/`actual`, interfaces o adaptadores cuando exista una diferencia
  real de plataforma; no crear abstracciones sin un consumidor concreto.
- Mantener la UI en el source set y framework elegidos por el proyecto.
- Respetar la separación existente entre dominio, datos, presentación y
  adaptadores cuando el proyecto la tenga.
- Evitar duplicar en cada plataforma reglas de negocio que puedan probarse y
  mantenerse en código compartido.

#### Estándar arquitectónico Intelix (Clean Architecture, Result, MVVM/MVI, Koin)

Cuando el proyecto no imponga otra arquitectura, aplicar el estándar
arquitectónico Intelix para Kotlin y KMP, resumido en
[references/estandar-arquitectura-kmp.md](references/estandar-arquitectura-kmp.md):

- Clean Architecture + MVVM con dependencias dirigidas hacia adentro; dominio en
  Kotlin puro sin imports de Compose, Ktor, SQLDelight ni SDK de plataforma.
- Patrón `Result<T>` en repositorios y casos de uso; nada de `throw` para flujo de
  negocio ni `catch` vacíos. Tipos de error: `Database`, `Network`, `Validation`,
  `NotFound`, `Generic`.
- Dominio inmutable (`val`, `data`/`sealed`/`enum`).
- Casos de uso con una sola operación pública (`operator fun invoke`); la lógica de
  negocio no vive en el ViewModel.
- ViewModels con un único `StateFlow<UiState>` (mínimo `isLoading` y
  `errorMessage`); efectos de una vez por `SharedFlow` (`replay = 0`), no dentro
  del estado.
- Inyección de dependencias con Koin; los casos de uso se registran como `factory`,
  no como `single`.
- Coroutines con ciclo de vida (sin `GlobalScope`), flujos expuestos de solo
  lectura y dispatchers inyectados.
- KDoc estructurado (`@param`, `@return`, `@throws`, `@author`, `@since`).

Respetar la arquitectura ya adoptada por el repositorio cuando difiera: no
reemplazar un stack existente solo por preferencia.

### 3. Implementar el cambio de forma acotada

- Seguir las versiones y convenciones declaradas por Gradle y el catálogo de
  versiones.
- Aplicar el estándar arquitectónico Intelix descrito en el paso 2
  ([references/estandar-arquitectura-kmp.md](references/estandar-arquitectura-kmp.md))
  salvo que la estructura del proyecto exija otra cosa.
- No actualizar Kotlin, Gradle, AGP, Xcode o dependencias salvo que la solicitud
  lo requiera o sea indispensable para compilar el cambio.
- Preservar las APIs públicas y los formatos persistidos, salvo que se acuerde
  una migración.
- Mantener concurrencia estructurada con coroutines; no crear scopes sin ciclo
  de vida ni bloquear el hilo principal.
- Tratar cancelación, errores, reintentos y estados de carga de manera explícita
  cuando formen parte del flujo afectado.
- Mantener la lógica sensible al ciclo de vida en la capa correspondiente de
  cada plataforma.

### 4. Aplicar seguridad móvil

Como mínimo:

- no introducir secretos en `.kt`, `.kts`, `.xml`, `.plist`, `.swift`,
  `.properties` ni archivos Gradle;
- no versionar `local.properties`, keystores ni credenciales de firma;
- no registrar tokens, contraseñas, datos personales ni respuestas sensibles;
- usar almacenamiento seguro de plataforma para credenciales cuando el proyecto
  necesite persistirlas;
- validar entradas y datos recibidos desde deep links, intents, URL schemes,
  universal links y APIs;
- mantener permisos Android y capacidades iOS en el mínimo necesario;
- no desactivar validación TLS ni aceptar certificados de forma indiscriminada;
- preservar ofuscación, reglas de shrinking y configuración de release cuando
  ya existan.

Para una revisión completa, leer
[references/criterios-mobile-kmp.md](references/criterios-mobile-kmp.md).
Para certificar preparación técnica para QA, aplicar
`docs/estandares/estandares-mobile-kmp-intelix.md` y ejecutar el motor mediante
`intelix-certificacion`; MOB1–MOB8 no constituyen aprobación de tienda.

### 5. Probar en las capas afectadas

Seleccionar las pruebas según el cambio:

- `commonTest` para reglas compartidas;
- pruebas unitarias Android para código específico de Android;
- pruebas instrumentadas o de UI cuando la integración con framework lo exija;
- pruebas del target iOS o revisión desde Xcode cuando exista código iOS;
- pruebas de serialización, persistencia y migración cuando cambien contratos;
- pruebas de coroutines con scheduler o dispatcher controlable cuando aplique.

No declarar validado un target que no pudo compilarse o ejecutarse. En una
máquina sin macOS/Xcode, separar claramente lo verificado en Gradle de lo que
queda pendiente en iOS.

### 6. Verificar con las herramientas del repositorio

Usar el Gradle Wrapper del proyecto, no un Gradle global. Descubrir primero las
tareas disponibles cuando el nombre no sea evidente.

Verificaciones habituales, solo si existen en el proyecto:

```bash
./gradlew check
./gradlew test
./gradlew lint
./gradlew assembleDebug
```

En Windows usar `gradlew.bat`. Para iOS, ejecutar tareas Gradle del target y
comandos Xcode únicamente cuando el entorno y el proyecto estén preparados.

No ejecutar tareas de publicación, firma o distribución como parte de una
verificación ordinaria.

### 7. Entregar evidencia

Informar:

- tipo de proyecto detectado;
- módulos y source sets modificados;
- decisiones de compatibilidad relevantes;
- pruebas y builds ejecutados;
- resultados obtenidos;
- verificaciones Android o iOS que no pudieron realizarse;
- riesgos o migraciones pendientes;
- si el cambio afecta permisos, privacidad, firma o publicación.

## Tratamiento de conflictos con el estándar web

Si el repositorio también contiene el estándar AWS/SAM/React:

- aplicarlo únicamente a los componentes para los que sea pertinente;
- no marcar el código móvil como incumplido por no usar React o SAM;
- ejecutar el dominio móvil MOB1–MOB8, no los controles AWS/React;
- registrar siempre que el dictamen cubre preparación para QA y no publicación
  en Google Play o App Store.

## Desarrollo sobre el sistema AFV (cliente Mayoreo)

Cuando el trabajo sea una **mejora, actualización o contenido nuevo del sistema
AFV** del cliente Mayoreo, aplicar **además** el estándar específico de AFV en
[references/estandar-afv-mayoreo.md](references/estandar-afv-mayoreo.md). AFV es
un sistema KMP estable con más de quince años de operación; su estándar y la
documentación entregada por el equipo de AFV son de cumplimiento obligatorio.

Reglas de precedencia:

- Para proyectos móviles que no sean AFV, basta el estándar genérico Intelix
  ([references/estandar-arquitectura-kmp.md](references/estandar-arquitectura-kmp.md)).
- Para AFV, el estándar específico **prevalece sobre el genérico** en caso de
  conflicto, y se respeta la estructura existente antes de refactorizar.

Puntos obligatorios al tocar AFV (detalle completo en la referencia):

- Topología real: `composeApp/` (núcleo KMP y UI compartida), `app/` (librería
  legacy de sincronización Android), `iosApp/` (host nativo Apple).
- Paquete base `com.mayoreo.afvapp`; dominio, datos y presentación en sus rutas
  establecidas; casos de uso con `operator fun invoke`.
- Navegación con Voyager registrando pantallas en `navigation/AppScreen.kt`
  (`AppScreens` + `Content()`).
- Koin en `koin/DI.kt`, con casos de uso como `factory`.
- Excepción documentada SDS / sincronizador (`toSdsUserMessage()`,
  `SqlConsoleServerPolicy.kt`), acotada y no extensible a otras capas.
- Integración iOS nativa: bridge delgado por `MainViewController`, ActivityKit,
  BackgroundTasks, App Intents con cancelación en Kotlin, flavors de Firebase y
  gates `#available` para APIs por encima del baseline.

## Condiciones de parada

Detener el cambio y solicitar la decisión necesaria cuando:

- haga falta elegir entre UI nativa y Compose Multiplatform;
- se requiera una migración mayor de Gradle, Kotlin, AGP o Xcode no solicitada;
- el cambio altere firma, application ID, bundle ID, capacidades o publicación;
- falten secretos o certificados que solo el responsable puede proporcionar;
- no pueda determinarse cuál es el módulo o target autorizado;
- una solución requiera ampliar el alcance hacia backend o infraestructura.
