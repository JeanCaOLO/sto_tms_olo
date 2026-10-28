# Estándar INTELIX para desarrollo móvil Kotlin y KMP

## Alcance

Este estándar gobierna la preparación para QA de aplicaciones Android escritas en Kotlin y de
proyectos Kotlin Multiplatform con targets Android o iOS. No certifica requisitos comerciales,
legales ni políticas vigentes de Google Play o App Store, y no autoriza firma o publicación.

La arquitectura y los targets existentes son decisiones del proyecto. No se exige React, SAM ni
CloudFormation al árbol móvil. Los servicios backend se evalúan con su perfil técnico propio.

## MOB1 — Proyecto reproducible

- Versionar Gradle Wrapper, settings y archivos de build.
- Mantener plugins y dependencias en ubicaciones declaradas por el proyecto.
- No depender de un Gradle global ni de archivos locales para definir el build.

## MOB2 — Secretos y firma

- Mantener fuera de Git `local.properties`, `key.properties`, keystores, certificados, perfiles de
  aprovisionamiento y credenciales de tienda.
- No incorporar API keys, tokens, contraseñas o claves privadas en Kotlin, Gradle, XML, Swift,
  plist o properties.
- Ante una exposición, retirar el material y rotar la credencial.

## MOB3 — Configuración Android

- Declarar el manifiesto y `targetSdk` en configuración versionada.
- Mantener application ID, variantes, permisos y componentes exportados bajo revisión explícita.
- Solicitar únicamente permisos asociados a funciones reales de la aplicación.

## MOB4 — Transporte seguro

- No instalar trust managers, hostname verifiers o callbacks que acepten cualquier certificado.
- No continuar silenciosamente ante errores TLS.
- Las excepciones de red deben quedar acotadas y documentadas.

## MOB5 — iOS, capacidades y privacidad

- Mantener `Info.plist`, entitlements, targets y schemes coherentes con las capacidades usadas.
- Evaluar `PrivacyInfo.xcprivacy` según las APIs y SDK incorporados.
- Realizar la verificación final de iOS en macOS con una versión compatible de Xcode.

## MOB6 — Concurrencia estructurada

- Usar scopes con propietario y ciclo de vida conocidos.
- No usar `GlobalScope` para trabajo de aplicación.
- Propagar cancelación y evitar bloquear el hilo principal con I/O o esperas.

## MOB7 — Pruebas

- Probar reglas compartidas en `commonTest` y código específico en su target.
- Incluir errores, cancelación, serialización y migraciones cuando formen parte del cambio.
- La certificación de estándares puede diferir pruebas; la puerta completa las exige.

## MOB8 — Integración continua

- Ejecutar Gradle Wrapper en CI con tareas de `check`, `test`, `assemble`, `bundle` o `build`.
- Ejecutar gates iOS en runner macOS cuando formen parte de la entrega.
- Firma, distribución y publicación requieren autorización y secretos externos al repositorio.

## Interpretación del dictamen

El dictamen móvil indica preparación técnica para QA respecto de MOB1–MOB8. No equivale a
aprobación de tienda, revisión de políticas actuales, firma, notarización ni publicación.
