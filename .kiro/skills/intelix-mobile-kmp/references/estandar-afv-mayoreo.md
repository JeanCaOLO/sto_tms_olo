# Estándar específico del sistema AFV (cliente Mayoreo)

> **Regla de precedencia.** Cuando el trabajo sea una **mejora, actualización o
> contenido nuevo del sistema AFV** del cliente Mayoreo, este estándar es de
> **cumplimiento obligatorio** y **prevalece sobre el núcleo genérico**
> [estandar-arquitectura-kmp.md](estandar-arquitectura-kmp.md) en caso de
> conflicto. AFV es un sistema estable con más de quince años de operación: se
> respeta lo existente antes de refactorizar y no se cambia su arquitectura por
> preferencia.

Esta referencia recoge las convenciones concretas entregadas por el equipo que
desarrolla AFV. Es un complemento del núcleo genérico, no su reemplazo: todo lo
que aquí no se especifique sigue el núcleo. Leerla cuando el cambio toque el
código, la configuración o la documentación de AFV.

---

## 1. Contexto y arquitectura

- AFV es una aplicación Kotlin Multiplatform (KMP) con targets Android e iOS.
- La arquitectura base es **Clean Architecture + MVVM** con el patrón `Result`
  para el manejo profesional de errores.
- Al ser un sistema estable y maduro, la primera fuente de decisión es la
  estructura existente. Preservar APIs públicas y formatos persistidos salvo que
  se acuerde explícitamente una migración.

---

## 2. Topología real del repositorio

| Ruta | Significado |
|------|-------------|
| `composeApp/` | Núcleo KMP, UI compartida y las capas comunes `domain` / `data` / `usecase` |
| `app/` | Librería legacy de sincronización e infraestructura Android |
| `iosApp/` | Proyecto host nativo de Apple |
| `skills/` | Guía para agentes y herramientas de sincronización |

No crear guía activa que asuma módulos `shared/` o `server/` mientras el
repositorio no los agregue realmente.

---

## 3. Convenciones concretas de AFV

- **Paquete base**: `com.mayoreo.afvapp`.
- **Dominio**: `composeApp/src/commonMain/kotlin/com/mayoreo/afvapp/domain/`
  - `domain/model/` — modelos de negocio inmutables (`data class`, `sealed class`, `enum class`).
  - `domain/usecase/` — lógica de negocio, un archivo por caso de uso, una sola
    operación pública con `operator fun invoke`.
  - `domain/repository/` — interfaces (contratos) de repositorio.
- **Datos**: `composeApp/src/commonMain/kotlin/com/mayoreo/afvapp/data/repository/`
  — implementaciones de repositorio con `try-catch` que devuelven `Result`.
- **Presentación**: `.../ui/viewmodel/` — ViewModels y sus clases `UiState`, con
  un único `StateFlow<UiState>` (mínimo `isLoading` y `errorMessage`).
- **Navegación con Voyager**: toda pantalla nueva se registra en
  `composeApp/src/commonMain/kotlin/com/mayoreo/afvapp/navigation/AppScreen.kt`,
  heredando de `AppScreens` y sobrescribiendo `Content()`.
- **Inyección de dependencias con Koin**: se registra en
  `composeApp/src/commonMain/kotlin/com/mayoreo/afvapp/koin/DI.kt`. Los casos de
  uso se registran como `factory`, nunca como `single`.

### Tipos de error `Result` soportados

- `Result.Error.Database`: errores de persistencia local.
- `Result.Error.Network`: errores de comunicación con el servidor.
- `Result.Error.Validation`: fallos en reglas de validación de negocio.
- `Result.Error.NotFound`: recurso no encontrado.
- `Result.Error.Generic`: fallos inesperados.

---

## 4. Excepción documentada: SDS / Sincronizador

AFV tiene una excepción aprobada al patrón `Result` acotada a la capa de red del
Smart Data Synchronizer (SDS):

- La capa de red KMP del SDS puede propagar excepciones hacia la UI del
  sincronizador mediante `toSdsUserMessage()`. El patrón `Result` sigue siendo el
  estándar para todas las demás funciones de negocio de AFV.
- La resolución de contraseña de la consola SQL en `SqlConsoleServerPolicy.kt`
  puede recurrir a una búsqueda por descripción entre los perfiles de grupos de
  sincronización para mantener compatibilidad legacy.

No ampliar esta excepción a otras capas ni usarla como pretexto para evitar
`Result` en código nuevo.

---

## 5. Integración iOS nativa

`iosApp/` es el host de Apple: posee el shell SwiftUI, el ciclo de vida nativo,
los assets, el `Info.plist` y la configuración, los targets, los schemes y los
adaptadores nativos. No recrear pantallas Compose ni reglas de negocio
compartidas en Swift; esas viven en `composeApp/`.

- **Bridge delgado**: `MainViewController` es el entrypoint Compose exportado.
  Preserva el orden efectivo: inicialización de logging/Koin, migración de
  sesión, configuración de locale, bootstrap de la aplicación SDS y, por último,
  composición del `App` compartido. `iosApp/AppHost/App/iOSApp.swift` posee el
  ciclo de vida nativo, la selección de flavor de Firebase y el cableado de
  delegados; no es una segunda capa de aplicación compartida.
- **ActivityKit / Live Activity**: al inicializar el host, descartar actividades
  obsoletas; al iniciar, solicitar una nueva; al actualizar, no hacer nada de
  forma segura si no hay actividad activa. Mantener sincronizados los contratos de
  atributos y estado con la extensión del widget.
- **BackgroundTasks**: usar identificadores estables que coincidan con
  `BGTaskSchedulerPermittedIdentifiers` y la configuración de cada flavor;
  registrar cada identificador una sola vez en el bootstrap iOS; reprogramar la
  siguiente ejecución; llamar a `setTaskCompletedWithSuccess` exactamente una vez
  (éxito, fallo, tipo inválido, dependencias ausentes o expiración). Preservar la
  semántica de cancelación de coroutines; no tragar `CancellationException`.
- **App Intents**: la cancelación la posee Kotlin. Swift puede marcar la actividad
  como "cancelando" para la presentación, pero la cancelación y la finalización de
  la sincronización las decide Kotlin. El hook debe ser opcional e idempotente.
- **Firebase por flavor**: seleccionar el plist desde el bundle identifier en
  tiempo de ejecución (`bundle id -> GoogleService-Info-{flavor}.plist`),
  configurar Firebase una sola vez y cablear el puerto remoto solo cuando la
  configuración tuvo éxito.
- **Disponibilidad de APIs**: el proyecto apunta a iOS 18.2 con Swift 5.0 y usa
  algunas APIs de iOS 26 detrás de gates. Usar siempre comprobaciones
  `#available` / `@available` para APIs más nuevas que el baseline de despliegue;
  no tratar el SDK más reciente instalado como baseline.
- **Edición de Xcode**: cambiar solo lo mínimo necesario en `project.pbxproj`
  (membresía de target, build setting, fase, capacidad o embedding) y respetar el
  modelo `PBXFileSystemSynchronizedRootGroup`; no duplicar referencias de archivos
  ya descubiertos por un grupo sincronizado.

Nunca afirmar que un comportamiento solo verificable en dispositivo (entrega en
segundo plano, Live Activity, App Intent, configuración Firebase en runtime) fue
validado sin evidencia del dispositivo.

---

## 6. Módulo Ktor server (referencia futura)

AFV contempla un posible módulo de servidor Ktor (`server/`) que hoy no está
activo. Cuando se incorpore, aplicar: rutas delgadas que solo parsean entradas,
invocan servicios o casos de uso y devuelven respuestas HTTP mapeadas; nada de
lógica de negocio ni consultas de persistencia dentro de los bloques de ruta; DI
con Koin en la inicialización; pruebas con `testApplication` usando entornos o
bases de datos simuladas. Tratar esta sección como referencia hasta que el módulo
exista.

---

## 7. Verificación en AFV

- Usar siempre el Gradle Wrapper versionado del proyecto, no un Gradle global.
- Probar reglas compartidas en `commonTest`; el código específico de plataforma en
  su target. En un host Windows, separar lo verificado en Gradle de lo que queda
  pendiente para iOS en macOS/Xcode.
- Firma, distribución y publicación requieren autorización y secretos gestionados
  fuera del repositorio.

---

## Recordatorio de precedencia

Para cualquier mejora, actualización o contenido nuevo de AFV, este estándar y la
documentación entregada por el equipo de AFV **se toman en cuenta de forma
obligatoria y prevalecen** sobre el núcleo genérico Intelix cuando haya conflicto.
Para proyectos móviles que no sean AFV, aplica únicamente el núcleo genérico.
