# Reunión — revisión del mockup OMS y preguntas de requerimientos

**Fecha:** ~2026-09-01 `[verificar fecha exacta]`
**Participantes mencionados:** Eduardo (presentó el mockup), Ana, Valencia, Palencia (funcional), Ricardo (encargado de inventario, referenciado), "el funcionario" (stakeholder externo), Antonio David (a incorporar al proceso — no estuvo).
**Fuente:** transcripción automática de la reunión, resumida y estructurada. Términos corregidos (ver §Terminología).

> **Nota de terminología:** la transcripción automática escribió mal varios nombres. En este documento ya están corregidos: **EPRAC** (no "IPRAC/IPRAX/IPREX"), **EFLOW** (no "IFLO/Flow/iflow"). "WMH" se usa en la transcripción para el sistema/torre de control actual que se evalúa reemplazar; su mapeo exacto con EPRAC/EFLOW queda `[verificar]`.

## Contexto

Se revisó el **prototipo/mockup del OMS** (Panel, Cola de Priorización, Motor de Reglas, Simulador, Rutas y Días, Auditoría) y se levantaron preguntas de requerimientos. El equipo considera el prototipo coherente ("se ve bastante bien... coherente con lo que tenemos"). El plan acordado: compartir el documento con **Antonio David** (funcional, con conocimiento de proceso) y con **el funcionario**, y tener **una sesión esta semana** para validar los puntos funcionales/operativos aún abiertos; recién entonces cerrar la matriz de requerimientos y generar estimados de desarrollo.

## Decisiones firmes (cerradas en esta reunión)

1. **Las prioridades son NUMÉRICAS, no niveles nombrados.** "Son números porque tienen que hacer **match con el WMS**". Menor número = mayor prioridad (prioridad 1 va antes que 2, y 1 va antes que 50). EPA y Cofersa manejan **2 prioridades** (1 y 2). → **Contradice** el modelo `priority_tier` (crítico/alto/medio/bajo) de `requirements.md` y los mockups; a corregir al re-correr requerimientos.
2. **Calendario de rutas — fuente y propiedad:** la **fuente de verdad es el TMS (módulo de rutas)**, no el OMS; el OMS lo **consume**. Se mantiene el CRUD en el OMS pero **gated a rol administrador**. El calendario es **por cliente** (EPA, Cofersa, comercializadoras…) y responde a **acuerdos Olo↔cliente** con implicación tarifaria (no es una regla fija del cliente). Cofersa: pedido hoy → entrega mañana (GAM) o rurales 2x/semana. EPA: semana de gracia (7 días).
3. **Los 4 roles se mantienen** (operador de despacho, administrador de módulo, jefe de almacén, responsable del OMS). Sin cambios respecto a la Adenda del 2026-08-26.
4. **El override es la única intervención humana**, por pedido individual. (Confirmado; su **nombre** en la operación queda como pregunta abierta — ver §Preguntas.)

## Feedback de diseño (mockup)

- **Cola de Priorización:** el detalle del pedido debe pasar de **panel lateral → modal**, para que la fila use todo el ancho de la pantalla (el WMS trae muchas más columnas/datos).
- **Panel OMS:** el indicador **"% override manual"** debe tener **ventana de tiempo configurable** (filtro de horas: 24h, 12h, semana), no fija. Retención de datos de métricas recomendada **~3–5 meses** (el análisis gerencial suele ser mensual, con comparativas mes a mes).

## Ideas tentativas (NO oficiales — dependen de decisiones abiertas)

- **Una sola aplicación + una sola base de datos** con **identificador por país y compañía** (no instancias/BD separadas), orientada a la integración "Capa X". → **Tentativa:** depende de si el OMS reemplaza al WMH por completo o funciona como capa adicional.
- El OMS **consultaría inventario en tiempo real** y validaría la **viabilidad** de cada pedido **antes de liberarlo** a alistar (cerrar/cancelar/informar si no hay mercadería). → Necesidad planteada, **atada** a la decisión WMH/EPRAC.
- El OMS **intervendría la creación de tareas** de picking/packing para que se asignen **solo cuando se requiera alistar**, vía un mecanismo de comunicación con **EFLOW**. → Necesidad planteada, **atada** a la decisión WMH/EPRAC.

## Preguntas abiertas (para la sesión con Antonio David + el funcionario)

- **¿El WMH/Torre de Control actual desaparece con el OMS, o se reutiliza?** Dos visiones: (a) alimentar al WMH para que haga lo mismo pero automático; (b) conectar el OMS directo a **EPRAC**, omitir el WMH y construir "nuestra propia torre de control". El equipo se inclina por (b), pero depende de la visión funcional (Palencia). Requiere revisar los **BPA** (diagramas de proceso: torre de control, alistado, chequeo) y ver qué se reutiliza.
- **Fuente real de los pedidos:** el OMS debería tomarlos como el WMH — vía una **"intermedia"** de EPRAC. Hay **excepciones** (p. ej. las **órdenes distribuidas de EPA** que EPRAC genera automáticamente y no pasan por la intermedia). Es dominio 100% de EPRAC.
- **¿Se le pide desarrollo a EPRAC (integraciones adicionales) o se usa lo existente?** Tema de **costos**.
- **Nombre de la acción de override** en la operación logística (torre de control bloquea líneas para alistar parcial y libera al resurtir — "no es el deber ser").
- **EPA y sus 2 prioridades:** hoy no las trae en el pedido; requiere desarrollo del lado de EPA.
- **Decisión final crear/no-crear calendario** en el OMS y cómo funciona en **Venezuela** (Costa Rica avanzado; Venezuela sin definir).

## Próximos pasos acordados

1. Compartir el documento con **Antonio David** y **el funcionario**.
2. Sesión **esta semana** con Antonio para validar los puntos funcionales/operativos.
3. Revisar los **BPA** de EPRAC/torre de control (proceso "preparación de pedidos": torre control, alistado, chequeo).
4. Cerrar la matriz de requerimientos → generar estimados de desarrollo.
5. Incorporar a Antonio David como parte del proceso.

## Extractos verbatim clave (transcripción corregida)

- **Prioridades numéricas:** *"las prioridades son números, no se trabajan como alto, medio, bajo, son números porque tienen que hacer match con el WMS […] un pedido puede tener prioridad uno y un similar prioridad dos […] Podríamos tener prioridad uno y prioridad 50 […] y aún así el uno va a ser primero y el 50 va a ser segundo."*
- **Calendario = TMS, OMS consume:** *"la información […] dónde la vamos a almacenar para consumirla. Y eso debería ser el TMS, que es el de rutas […] y el OMS tiene que consumirlo de ahí mismo […] Y es por cliente."*
- **CRUD gated a admin (matiz):** *"crear no está mal. Mientras tenga el rol administrador o un rol elevado […] no va a afectar tenerlo o no tenerlo, preferiblemente tenerlo."*
- **Inventario / viabilidad antes de liberar:** *"el OMS también va a tener que consultar […] en tiempo real esos pedidos que están en cola […] son viables. Si no son viables, el OMS tiene que cerrar los pedidos, cancelarlos […] informar que no se puede porque no hay mercadería en inventario […] antes de liberar ese pedido para que la gente vaya y lo aliste."*
- **Intervención de tareas (EFLOW):** *"cómo se crean las tareas en el […] WMS […] le llega un pedido al WMS, inmediatamente se crean las tareas de picking y packing […] deberíamos […] intervenirlo para que esas tareas no se crearan o […] algún estatus que [EFLOW] pueda decir 'las asigno, no las asigno' […] un mecanismo de comunicación con [EFLOW] para que las tareas se asignen justo cuando […] requieran ser alistadas."*
- **WMH reemplazo vs. reuso:** *"el WMH básicamente es lo que venimos a reemplazar […] con el OMS […] Si nuestro WMS lo podemos conectar ahí directamente [a EPRAC], podemos omitir el WMH […] y hacemos nuestra propia torre de control […] Pero no sé la visión que tienen."*

## Terminología corregida (de la transcripción)

| En la transcripción | Corregido |
|---|---|
| IPRAC / IPRAX / IPREX | **EPRAC** |
| IFLO / Flow / iflow | **EFLOW** |
| "la regla en Cuba" | "probar la regla" (prueba) |
| WMH | sistema/torre de control actual (mapeo con EPRAC/EFLOW `[verificar]`) |
