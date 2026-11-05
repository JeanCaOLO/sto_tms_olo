# 11 — Permisos en cadena al primer uso: verificar en teléfono

**Estado:** implementado 2026-11-05 y cubierto con pruebas unitarias; **pendiente por verificar en dispositivo real**.

## Qué cambió
Antes el permiso de ubicación salía al tocar «Iniciar viaje», detrás de una pantalla de aviso, y la cámara se pedía en la primera foto. Ahora, al entrar por primera vez, la app lleva a `consentimiento.tsx` y con **un solo toque** («Acepto y continuar») salen en cadena: cámara, ubicación, notificaciones y ubicación «todo el tiempo». Solo se muestra una vez por apertura de la app; con consentimiento y permisos completos no aparece.

Código: `src/lib/permissions.ts` (`requestAllPermissions`, `readPermissions`), `src/lib/use-permissions-gate.ts` (se usa en `app/index.tsx`), `src/app/consentimiento.tsx`.

El aviso previo **se conserva** a propósito: Google Play exige una divulgación destacada antes de pedir ubicación en segundo plano.

## Qué falta verificar
1. En Android 11, 13 y 14: la cadena sale completa; «todo el tiempo» abre Ajustes y al volver la app sigue sin pedir nada más.
2. Negar un permiso dos veces (Android deja de mostrar el diálogo): la app abre Ajustes sola y la pantalla indica qué falta.
3. «Ahora no»: no vuelve a insistir hasta reabrir la app; el aviso del viaje sigue visible.
4. Revisar con Google Play que el texto de `consent.*` cumple la divulgación de ubicación en segundo plano (política de `ACCESS_BACKGROUND_LOCATION`).
5. Un teléfono que ya tenía la app instalada con consentimiento: no debe volver a ver la pantalla si tiene todo concedido.

## Pendiente de la misma idea (no hecho)
- **Optimización de batería de Android** (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, guías por fabricante como Xiaomi o Samsung): sin ella el sistema puede matar el GPS en segundo plano. Requiere `expo-intent-launcher` (módulo nativo, APK nuevo) o llevar al chofer a Ajustes con texto guiado. No está en el proyecto y no se añadió.
- Notificaciones: no se detecta si se negaron (solo se piden).
