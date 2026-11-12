# Estándar arquitectónico Intelix para desarrollo móvil Kotlin y KMP

Esta referencia condensa el núcleo portable del estándar de desarrollo móvil
Kotlin y Kotlin Multiplatform (KMP). Es genérica y reutilizable por cualquier
empresa o proyecto: no asume rutas, paquetes ni módulos de un cliente concreto.
Leerla cuando se diseñe o revise arquitectura, manejo de estado, inyección de
dependencias, concurrencia o documentación de un cambio móvil.

Las reglas se agrupan en tres niveles:

- **RECHAZAR**: señales que deben bloquear o corregir el cambio.
- **EXIGIR**: condiciones mínimas que el cambio debe cumplir.
- **PREFERIR**: elecciones recomendadas cuando no hay una restricción del proyecto.

La arquitectura y las tecnologías ya adoptadas por el repositorio tienen
prioridad sobre estas recomendaciones. No reemplazar un stack existente solo por
preferencia; un cambio arquitectónico requiere necesidad comprobada y aprobación.

---

## 1. Clean Architecture + MVVM

El código se organiza en capas con dependencias dirigidas hacia adentro:
presentación e infraestructura dependen de la aplicación y del dominio, nunca al
revés. El dominio es la capa más estable y pura.

**RECHAZAR** si:

- El dominio importa Compose, Ktor, SQLDelight, drivers de base de datos o SDK de
  plataforma (Android, UIKit, Foundation).
- Una capa interna (dominio) depende de una externa (datos, UI, infraestructura).
- El mapeo entre DTO/entidad y modelo de dominio ocurre fuera de la capa de datos.

**EXIGIR**:

- Modelos de negocio e interfaces de repositorio en la capa de dominio.
- Entidades de base de datos, DTO, clientes de red e implementaciones de
  repositorio en la capa de datos, con el mapeo contenido ahí.
- Abstracciones de plataforma declaradas como interfaces en dominio/aplicación e
  implementadas en el código específico de cada plataforma.

**PREFERIR**:

- Separación limpia de responsabilidades por plataforma; el dominio permanece en
  Kotlin puro, sin imports de framework.

| Situación | Acción |
|-----------|--------|
| Regla o cálculo central de negocio | Modelo o caso de uso en dominio, sin dependencias externas |
| Requiere base de datos o red | Interfaz en dominio; implementación y mapeo en datos |
| Estado o reacción de la UI | Capa de presentación (ViewModel / UI) |
| Necesita servicios o APIs de la plataforma | Interfaz en común; implementación en el source set del target |

---

## 2. Manejo de errores con el patrón `Result<T>`

Las operaciones de negocio de repositorios y casos de uso devuelven un tipo
`Result<T>` en lugar de propagar excepciones.

**RECHAZAR** si:

- Se usa `throw` para controlar el flujo normal de negocio.
- Existen bloques `catch` vacíos que silencian errores.
- La UI o el ViewModel dependen de detalles de implementación de datos (consultas
  SQL, detalles de Ktor) en vez de un resultado tipado.

**EXIGIR**:

- Repositorios y casos de uso con retorno `Result<T>` para operaciones de negocio.
- Los repositorios capturan las excepciones de la fuente de datos y devuelven
  errores tipados. Tipos de error soportados:
  - `Result.Error.Database`: errores de persistencia local.
  - `Result.Error.Network`: errores de comunicación con el servidor.
  - `Result.Error.Validation`: fallos en reglas de validación de negocio.
  - `Result.Error.NotFound`: recurso no encontrado.
  - `Result.Error.Generic`: fallos inesperados.

---

## 3. Dominio inmutable

**EXIGIR**:

- Modelos de dominio inmutables: `data class` con propiedades `val`,
  `sealed class` o `enum class`.

**RECHAZAR** si:

- Un modelo de dominio expone propiedades mutables (`var`).

**PREFERIR**:

- Actualizaciones de estado mediante copias inmutables (`.copy()`).

---

## 4. Casos de uso

**EXIGIR**:

- Un caso de uso expone una sola operación pública mediante `operator fun invoke`.
- La lógica de negocio (transformaciones, cálculo, validación) vive en el caso de
  uso, no en el ViewModel.

**RECHAZAR** si:

- Un caso de uso tiene más de una operación pública o no implementa
  `operator fun invoke` (salvo paridad legacy justificada o sobrecargas de
  `invoke` con fundamento).
- Hay un `if`, `when`, `map` o `filter` ejecutando lógica de negocio dentro del
  ViewModel: pertenece a un caso de uso.

---

## 5. ViewModels y arquitectura de estado (MVVM / MVI)

**EXIGIR**:

- El ViewModel expone el estado con un único `StateFlow<UiState>` inmutable.
- Cada `UiState` incluye al menos `isLoading: Boolean` y `errorMessage: String?`.

**RECHAZAR** si:

- Se colocan dependencias del runtime de Compose o lógica del árbol de UI dentro
  del ViewModel.
- Se guardan efectos transitorios dentro del `UiState`.
- Se usa `LaunchedEffect(Unit)` como pseudo-inicialización.

**PREFERIR**:

- Dividir pantallas no triviales en un contenedor con estado (maneja flujo y
  efectos) y un contenido sin estado (solo renderiza).
- Modelar las acciones del usuario como `UiIntent` (sellado) con un único punto
  de entrada `onIntent`.
- Emitir eventos de una sola vez (navegación, mensajes) como `UiEffect` por un
  `SharedFlow` con `replay = 0`, procesados con `LaunchedEffect` en el contenedor.
- Introducir un reducer puro (estado + intención → nuevo estado) cuando las
  transiciones son complejas o con múltiples ramas.

| Situación | Acción |
|-----------|--------|
| Estado local o efímero (expandido, espejo de un campo de texto) | `rememberSaveable { mutableStateOf(...) }` local |
| Coordina tareas asíncronas, cargas o validación | ViewModel con un `StateFlow<UiState>` |
| Acción de ejecución única (navegación, snackbar) | Evento `UiEffect` por `SharedFlow` |
| Muchas transiciones de estado | Reducer puro |

---

## 6. Inyección de dependencias con Koin

**EXIGIR**:

- Las dependencias se registran mediante Koin (o el contenedor de DI del
  proyecto).
- Los casos de uso se registran como `factory`, no como `single`: cada
  resolución entrega una instancia nueva y sin estado compartido.

**PREFERIR**:

- Mantener el módulo de DI concreto donde el proyecto lo tenga establecido; su
  ubicación y nombre dependen de la topología del repositorio.

---

## 7. Coroutines y Flow

**RECHAZAR** si:

- Se usa `GlobalScope` para trabajo de aplicación.
- Se exponen `MutableStateFlow` o `MutableSharedFlow` hacia fuera.
- Se captura `CancellationException` sin relanzarla o dejarla propagar.
- Se bloquea el hilo principal con I/O, esperas o cómputo costoso.
- Se codifican dispatchers fijos en código común en lugar de inyectarlos.

**EXIGIR**:

- Concurrencia estructurada con scopes de ciclo de vida conocido (por ejemplo
  `viewModelScope`).
- Exposición de flujos como `StateFlow<T>` o `SharedFlow<T>` de solo lectura
  (`asStateFlow()`, `asSharedFlow()`).
- Dispatchers inyectados en repositorios y casos de uso.

**PREFERIR**:

- Estado observable con `stateIn(scope, SharingStarted.WhileSubscribed(5_000), inicial)`.
- Eventos transitorios con `SharedFlow` de `replay = 0`.
- Pruebas de coroutines con `runTest` y un `TestDispatcher`.

---

## 8. Kotlin Multiplatform

**EXIGIR**:

- La lógica portable entre todos los targets declarados vive en el source set
  común (`commonMain`).
- Las diferencias de plataforma se resuelven con `expect`/`actual`, interfaces o
  adaptadores, solo cuando existe una API de plataforma real.

**RECHAZAR** si:

- El source set común depende de APIs de un solo target (Android SDK, UIKit,
  Foundation) sin aislamiento.
- Se agregan dependencias específicas de un target dentro del bloque de
  dependencias común.

**PREFERIR**:

- Declaraciones `expect` mínimas y estables, con la complejidad en los `actual`.
- Código de arranque específico de plataforma en su propio source set
  (`androidMain`, `iosMain`, `jvmMain`).

---

## 9. Documentación con KDoc estructurado

**EXIGIR** en clases, interfaces, objetos y funciones no triviales nuevas o
modificadas:

- Descripción breve que empieza con un verbo activo (por ejemplo "Valida",
  "Obtiene").
- `@param nombre` por cada parámetro.
- `@return` cuando el retorno no es `Unit`.
- `@throws TipoExcepcion` cuando se lanzan excepciones propias.
- `@author` con el valor de `git config user.name` (sin marcadores de posición).
- `@since` con formato `DD-MM-YYYY`.

**PREFERIR**:

- Documentar propiedades del constructor primario con `@property`.
- Escribir el KDoc en la declaración o interfaz del source set común cuando el
  código es compartido.

---

## 10. Pruebas

**EXIGIR**:

- Reglas compartidas probadas en `commonTest` con `kotlin.test`.
- Código específico de plataforma probado en su target correspondiente
  (`androidUnitTest`, `jvmTest`, target iOS).
- Ejecutar primero la tarea de verificación más estrecha antes de la suite
  completa.

**RECHAZAR** si:

- Se declara validado un target iOS o macOS cuando la ejecución fue en un host
  sin ese entorno (por ejemplo Windows).
- Se mezcla lógica de prueba con rutas de código de producción.

**PREFERIR**:

- Pruebas deterministas de concurrencia con dispatcher controlable.
- Cobertura de serialización, migraciones de persistencia, errores y cancelación,
  no solo el camino exitoso.

---

## Nota de precedencia

Este documento es el **núcleo genérico Intelix** y aplica a cualquier proyecto
móvil Kotlin o KMP. Cuando el trabajo sea una **mejora, actualización o contenido
nuevo del sistema AFV (cliente Mayoreo)**, aplica **además**
[estandar-afv-mayoreo.md](estandar-afv-mayoreo.md), que recoge las convenciones
concretas de ese sistema estable y **prevalece sobre este núcleo en caso de
conflicto**.
