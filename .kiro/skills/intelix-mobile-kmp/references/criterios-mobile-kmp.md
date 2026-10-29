# Criterios técnicos para Android y Kotlin Multiplatform

Leer esta referencia cuando se revise arquitectura, seguridad, calidad o
preparación de build de una aplicación móvil. Aplicar únicamente los apartados
pertinentes al alcance y a los targets reales del proyecto.

## 1. Estructura y portabilidad

- `commonMain` no depende de Android SDK, UIKit, Foundation u otras APIs no
  disponibles en todos los targets declarados.
- Las diferencias de plataforma se aíslan mediante interfaces, adaptadores o
  `expect`/`actual` cuando aportan valor real.
- Los source sets intermedios reflejan familias de targets que comparten una
  implementación válida.
- El dominio no depende directamente del framework de UI.
- Los modelos compartidos no exponen innecesariamente tipos específicos de una
  plataforma.
- Los contratos serializados y esquemas persistidos tienen estrategia de
  compatibilidad o migración.

## 2. Estado, concurrencia y ciclo de vida

- Las coroutines usan scopes con propietario y ciclo de vida conocidos.
- No se utiliza `GlobalScope` para trabajo de aplicación.
- El hilo principal no se bloquea con I/O, esperas o cómputo costoso.
- La cancelación se propaga correctamente.
- Los errores se convierten en estados o resultados que la UI puede manejar.
- Los flujos no generan suscripciones duplicadas o fugas por ciclo de vida.
- Los dispatchers se pueden sustituir o controlar en pruebas cuando sea
  necesario.

## 3. Red, datos y modo desconectado

- Los timeouts, errores HTTP, serialización y ausencia de conectividad se tratan
  explícitamente.
- Los reintentos son acotados y no duplican operaciones no idempotentes.
- Las respuestas remotas no se consideran confiables sin validación.
- La caché define vigencia, invalidación y comportamiento ante datos obsoletos.
- Las migraciones de base de datos local son reversibles o tienen una estrategia
  de recuperación documentada.
- No se almacenan tokens o datos sensibles en texto plano.

## 4. Android

- `minSdk`, `targetSdk`, application ID y variantes se preservan salvo cambio
  autorizado.
- Los permisos solicitados corresponden a funciones reales y se gestionan en
  tiempo de ejecución cuando aplica.
- Los componentes exportados tienen una decisión explícita y segura.
- Intents, deep links y datos externos se validan.
- Los backups, providers y archivos compartidos no exponen información sensible.
- La configuración de release mantiene shrinking, ofuscación y reglas necesarias.
- Los logs de release no contienen datos sensibles.
- El keystore y sus credenciales permanecen fuera del repositorio.

## 5. iOS

- Bundle ID, targets, schemes y configuraciones se preservan salvo cambio
  autorizado.
- `Info.plist`, entitlements y capacidades contienen solo lo necesario.
- URL schemes, universal links y datos externos se validan.
- El uso de APIs sensibles se refleja en las declaraciones de privacidad que
  correspondan al proyecto.
- Los perfiles, certificados y credenciales de firma no se incorporan al
  repositorio.
- Los datos sensibles se almacenan mediante mecanismos seguros de plataforma.
- La verificación de iOS se realiza en un entorno macOS/Xcode compatible; si no
  está disponible, se registra como pendiente.

## 6. Seguridad transversal

Revisar archivos Kotlin, Gradle, XML, Swift, plist y properties para detectar:

- API keys, tokens, contraseñas o secretos asignados;
- endpoints internos o de producción incorporados sin configuración;
- validación TLS desactivada;
- trust managers o delegados que aceptan cualquier certificado;
- logs con tokens, datos personales o respuestas completas;
- almacenamiento plano de credenciales;
- permisos o capacidades excesivos;
- componentes Android exportados sin protección;
- WebViews con configuración insegura;
- datos externos procesados sin validación.

No copiar valores sensibles en informes. Registrar solo archivo, línea, tipo de
hallazgo y remediación.

## 7. Pruebas

- Las reglas compartidas tienen pruebas en `commonTest`.
- El código específico de plataforma tiene pruebas en su target correspondiente.
- La concurrencia se prueba de forma determinista.
- La serialización cubre compatibilidad, campos ausentes y datos inválidos.
- Las migraciones de persistencia tienen pruebas con una versión anterior.
- Los flujos críticos incluyen pruebas de error y cancelación, no solo el camino
  exitoso.
- Las pruebas de UI se reservan para integración y comportamiento observable.

## 8. Build y entrega

- Se utiliza el Gradle Wrapper versionado.
- Las dependencias y plugins siguen la estrategia de versiones del proyecto.
- Debug y release no comparten secretos ni endpoints por accidente.
- El pipeline compila y prueba los targets que declara soportar.
- Los builds iOS se ejecutan en runner macOS cuando formen parte del gate.
- Los artefactos se identifican con versión reproducible.
- Firma y publicación requieren autorización y credenciales gestionadas fuera
  del repositorio.

## 9. Informe mínimo de revisión

La revisión debe separar:

1. Cumplimientos confirmados con evidencia.
2. Hallazgos que requieren corrección.
3. Elementos no verificables en el entorno actual.
4. Excepciones aprobadas del proyecto.
5. Verificaciones pendientes antes de QA o publicación.

No emitir un dictamen de tienda basándose únicamente en este checklist.
