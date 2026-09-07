# PROMPT MAESTRO — Módulo Liquidador (Tarifas y Liquidación) — TMS corporativo

> Pega desde `▼ INICIO DEL PROMPT` hasta `▲ FIN DEL PROMPT` completo en tu IA de
> programación (Claude Code, Cursor, etc.), dentro de la carpeta del proyecto
> **ya existente**. Al final de este documento hay notas de uso.

---

## ▼ INICIO DEL PROMPT (copiar desde aquí)

Eres un arquitecto de software senior especializado en sistemas de tarifación,
motores de reglas de negocio y plataformas TMS (Transportation Management
System). Vas a auditar y luego extender un proyecto **ya iniciado** — el
módulo Liquidador — hasta que cumpla el 100% de los requerimientos
funcionales y no funcionales que te doy abajo. No es un ejercicio desde cero:
hay código existente, básico e incompleto, que debes analizar antes de tocar
nada.

Trabaja en la carpeta actual. **No escribas ni modifiques código en tu primera
respuesta.** Antes de nada, ejecuta la Fase 0 de este prompt (auditoría) y
espera mi confirmación para pasar a construir.

---

### 0. CONTEXTO DE NEGOCIO

Empresa 3PL de alcance nacional (venta al mayor y al detal). Flota mixta:
~30% propia, ~70% outsourcing (empresas transportistas externas contratadas).
El Liquidador es un **módulo dentro de un TMS general**, no un sistema
aislado: su función es calcular y emitir la proforma de pago de cada viaje,
distinguiendo la dinámica de pago según el tipo de transportista.

- **Transportista propio**: nómina fija + componente variable (el detalle de
  ese componente variable aún no está definido — ver sección 9, no lo
  resuelvas de forma rígida).
- **Transportista outsourcing**: pago por flete plano, por km/tonelaje, o una
  combinación — configurable de forma **independiente por cada empresa
  outsourcing**, sin afectar a las demás.
- **Casas** (clientes mayoristas cuyo flete se reparte parcialmente según
  reglas configurables): Beval, Febeca, Sillaca. El diseño debe permitir
  agregar casas y países nuevos **sin cambios estructurales**.
- Países actuales de operación: mínimo 3 (el sistema debe soportarlos desde
  el modelo de datos, no como casos especiales de código).

---

### 1. FASE 0 — AUDITORÍA OBLIGATORIA ANTES DE CONSTRUIR

1. Inspecciona la estructura actual del proyecto (stack, carpetas, modelo de
   datos, si hay backend/persistencia real o solo prototipo en memoria).
2. Contrasta lo que existe contra **cada RF y RNF de la sección 5 y 6** de
   este prompt. Para cada uno, clasifica: `Cumple` / `Cumple parcial` /
   `No existe`.
3. Señala explícitamente cualquier valor de negocio hardcodeado (tarifas,
   porcentajes, umbrales, nombres de casas o países en el código) — esto
   viola el principio no negociable de la sección 2.
4. Entrégame ese reporte de brechas en una tabla, junto con un plan de
   construcción por etapas para cerrarlas. **Espera mi confirmación antes de
   generar código.**

---

### 2. PRINCIPIOS DE DISEÑO NO NEGOCIABLES

*Aplican a todo el módulo; ningún requerimiento puede contradecirlos.*

1. **Todo parametrizable** — ningún valor de negocio vive fijo en el código:
   tarifas, valor de recolectas, porcentajes por casa, umbrales, monedas y
   reglas se configuran desde la interfaz.
2. **Multi-país desde el inicio** — el país es una dimensión del modelo de
   datos, no un caso especial agregado después.
3. **Cada cambio, con alerta** — toda acción sensible (editar tarifa vigente,
   aplicar descuento, resolver novedad, liquidar con excepción) exige
   confirmación explícita del usuario.
4. **Trazabilidad total** — toda creación, edición o eliminación de
   parámetros, y toda liquidación, queda registrada con usuario, fecha y
   valor anterior/nuevo, de forma inmutable (append-only, sin edición
   retroactiva silenciosa).
5. **Nada se liquida en silencio** — un viaje con novedad no avanza a
   Liquidado sin resolución explícita y autorizada por un rol competente.

---

### 3. ACTORES Y ROLES (RBAC — ver RNF-009)

| Rol | Responsabilidad |
|---|---|
| **Liquidador (operador)** | Registra y procesa viajes, resuelve recolectas, genera y envía proformas. |
| **Jefe de transporte** | Crea, edita y elimina tarifas y reglas. Autoriza novedades bloqueadas. Configura parámetros por país y por empresa. |
| **Supervisor / Finanzas** | Segunda validación en casos de excepción (formalmente Fase 4, pero deja el modelo de roles listo desde ahora). |
| **Sistema (automático)** | Recibe viajes del TMS, aplica tarifas, calcula % por casa, agrupa proformas, envía correos. |

---

### 4. FLUJO FUNCIONAL — TUBERÍA DE ESTADOS

```
Viaje recibido → Validado → Tarificado → Deducciones aplicadas →
Liquidado → Proforma generada → Proforma enviada

(Fase 2 →) Factura recibida → Conciliado → Enviado a Tesorería → Pagado
```

Reglas de la tubería:

- Un viaje con novedad (recolecta, reenvío, factura movida, devolución) **no
  avanza a Liquidado** hasta resolverse mediante un workflow formal de
  aprobación.
- La bifurcación propio/outsourcing ocurre en la etapa **Tarificado**: el
  motor elige el conjunto de reglas según el tipo de transportista y, para
  outsourcing, según la empresa específica. **Esta bifurcación debe ser una
  regla de datos, nunca un `if` duro en el código que decida si el resultado
  va a nómina o a cuentas por pagar** (ver riesgo en sección 8).
- El porcentaje por casa se resuelve en Tarificado, como cálculo derivado de
  volumen, monto y precio de la mercancía.
- Las deducciones (recolecta, cargo transporte, y en fases futuras
  adelanto/préstamo) entran en su propia etapa, con interruptor
  automático/manual configurable por concepto y por tipo de transportista.
- La agrupación empresa+día+ruta ocurre al pasar de Liquidado a Proforma
  generada.

---

### 5. ALCANCE DE ESTA CONSTRUCCIÓN

Construye **Fase 0 (datos maestros)** y **Fase 1 (núcleo de liquidación
hasta el envío de proforma)** completas. Las Fases 2–5 (portal del
transportista, conciliación, adelantos/préstamos, doble validación,
reportería) están listadas en la sección 5.6 solo como **referencia de
alcance** — no las implementes, pero ninguna decisión de esta fase debe
bloquearlas ni contradecirlas (RNF-015).

#### 5.1 Datos maestros y parametrización

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-001 | Alta de transportistas con marca Propio u Outsourcing; si es outsourcing, empresa a la que pertenece. | Alta |
| RF-002 | Catálogo de empresas outsourcing, cada una con tarifas y reglas editables de forma independiente (incluye correo del jefe de transporte para envío de proforma). | Alta |
| RF-003 | Catálogo de vehículos clasificados por volumen y peso. | Alta |
| RF-005 | Países, monedas y rutas/zonas como dimensiones del modelo de datos, no como valores de código. | Alta |
| RF-006 | Todo parámetro de negocio (tarifa, regla, umbral, porcentaje) tiene vigencia desde/hasta; un cambio no altera liquidaciones ya emitidas. | Alta |
| RF-007 | Por transportista outsourcing: dinámica de pago por flete plano, km/tonelaje o combinación, sin afectar a otras empresas. | Alta |

#### 5.2 Motor de tarifas y reglas (autoservicio del jefe de transporte)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-008 | El jefe de transporte crea, edita y elimina tarifas/reglas directamente en el Liquidador, sin intervención de desarrollo. | Alta |
| RF-009 | Editor de reglas con plantillas comunes (monto fijo por vehículo × empresa, por flete, por km/tonelaje) + editor libre con condiciones y fórmulas para casos especiales. | Alta |
| RF-010 | Al editar/eliminar una tarifa vigente, alerta de confirmación indicando desde qué fecha aplica y cuántos viajes en curso se afectan. | Alta |
| RF-011 | Validación de que una regla esté bien formada antes de guardar: sin huecos ni solapes de vigencia, montos y porcentajes en rangos válidos. | Media |
| RF-012 | Toda alta/edición/eliminación de tarifa o regla queda en bitácora de auditoría (usuario, fecha, valor anterior, valor nuevo). | Alta |
| RF-013 | Previsualizar el efecto de una regla nueva/editada contra un viaje de ejemplo antes de guardarla. | Media |

#### 5.3 Motor de cálculo

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-014 | Recibe viajes completados desde el TMS y los coloca en estado Viaje recibido, sin retraso frente al origen. | Alta |
| RF-015 | Valida datos mínimos del viaje (transportista, vehículo, ruta, casa, factura asociada) antes de tarificar; si faltan, marca como excepción. | Alta |
| RF-016 | Selección asistida de tipo de vehículo: sugiere por volumen/peso, el usuario confirma o ajusta. | Alta |
| RF-017 | Aplica la tarifa correspondiente según tipo de transportista, empresa, país y vigencia; produce el flete base. | Alta |
| RF-018 | Calcula automáticamente el porcentaje por casa a partir de peso, volumen y monto transportado, según reglas por casa y país. | Alta |
| RF-019 | El resultado distingue bruto y neto, con desglose completo visible (flete base, ajustes, % por casa, deducciones). | Alta |
| RF-020 | Explica cada línea del desglose: qué regla la generó y bajo qué condición se activó (o por qué no se activó una regla candidata). | Media |

#### 5.4 Recolectas, novedades y deducciones

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-021 | Gestiona recolectas (facturas con sello de devolución) con valor unitario configurable por país y empresa. | Alta |
| RF-022 | Integra las recolectas en la proforma automáticamente, eliminando la proforma manual aparte. | Alta |
| RF-023 | Gestiona el cargo transporte (mercancía dañada) como deducción con motivo obligatorio registrado. | Alta |
| RF-024 | Para cada deducción, muestra alerta y pregunta si el descuento se aplica automático o manual; procede según la respuesta. | Alta |
| RF-025 | Un viaje con novedad (recolecta, reenvío, cambio de ruta, factura movida, devolución reenviada como pedido nuevo, factura fuera de guía) queda bloqueado hasta su resolución. | Alta |
| RF-026 | El desbloqueo de una novedad requiere autorización del jefe de transporte, registrada con motivo. | Alta |
| RF-027 | Registra el motivo de cada novedad y lo refleja en el desglose visible del viaje. | Media |

#### 5.5 Proforma y envío

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-028 | Agrupa viajes liquidados por empresa + día + ruta para una sola proforma, o permite liquidar individualmente. | Alta |
| RF-029 | Genera la proforma en PDF con detalle: flete, monto, cliente × flete, recolectas, deducciones y total. | Alta |
| RF-030 | Envía la proforma por correo al jefe de transporte de la empresa correspondiente; una empresa puede recibir una o más proformas. | Alta |
| RF-031 | Registra el estado de envío de cada proforma (generada/enviada/reenviada) y permite reenviarla sin regenerar el cálculo. | Media |

#### 5.6 Fases posteriores (solo referencia — no implementar)

Portal del transportista y conciliación automática con LLM (Fase 2);
adelantos/préstamos y provisión contable (Fase 3); doble validación y
catálogo de excepciones (Fase 4); integración Softland y reportería (Fase 4–5).
Diséñalo de forma que estas fases se agreguen como extensiones sobre la
tubería de estados, sin reescribir el núcleo.

---

### 6. REQUERIMIENTOS NO FUNCIONALES

| ID | Requerimiento | Prioridad |
|---|---|---|
| RNF-001 | Calcular tarifa + desglose de un viaje individual en menos de 2 segundos. | Alta |
| RNF-002 | Sostener sin degradación perceptible los picos de generación de proformas de cierre diario/mensual a nivel nacional. | Alta |
| RNF-003 | Generación y envío de una proforma en PDF por correo en menos de 10 segundos. | Media |
| RNF-004 | Incorporar un país, zona, casa o transportista nuevo mediante configuración de datos, sin modificar ni redesplegar el motor de cálculo. | Alta |
| RNF-005 | Escalar horizontalmente sin rediseño arquitectónico mayor. | Media |
| RNF-006 | Disponibilidad en horario operativo extendido (06:00–22:00), objetivo ≥ 99%. | Alta |
| RNF-007 | Una caída del módulo no debe perder viajes ya recibidos: los viajes en tránsito por la tubería persisten su último estado válido. | Alta |
| RNF-008 | Backup periódico de configuración y de liquidaciones/proformas emitidas, con RPO/RTO definidos. | Alta |
| RNF-009 | Control de acceso basado en roles (Liquidador, Jefe de transporte, Supervisor/Finanzas, Sistema automático), restringiendo cada acción a los roles autorizados. | Alta |
| RNF-010 | Datos sensibles (montos, datos de transportistas) protegidos en tránsito y en reposo mediante cifrado estándar. | Alta |
| RNF-011 | Toda acción sensible queda asociada de forma inequívoca a un usuario autenticado; nada de acciones anónimas o compartidas. | Alta |
| RNF-012 | El motor de cálculo es un **núcleo puro**, desacoplado de UI y persistencia, con pruebas automatizadas exhaustivas, ejecutable idéntico en cliente y servidor. | Alta |
| RNF-013 | Determinismo: misma entrada de viaje + misma versión de reglas vigente en esa fecha = mismo resultado, sin importar cuándo se recalcule. | Alta |
| RNF-014 | Motor y reglas libres de valores de negocio embebidos (hardcoded); toda tarifa/umbral/porcentaje vive en datos configurables. | Alta |
| RNF-015 | Permite agregar nuevas fases (conciliación, adelantos, ERP, reportería) como extensiones sobre la tubería existente, sin reescribir el núcleo de Fase 1. | Media |
| RNF-016 | Editor de tarifas y reglas operable por el jefe de transporte sin conocimientos de programación, con formularios guiados para casos comunes. | Alta |
| RNF-017 | Explicar en lenguaje de negocio (no técnico) por qué se aplicó o no cada regla, en el desglose de cálculo. | Media |
| RNF-018 | Interfaz en español como idioma primario, con estructura de textos preparada para localización a otros idiomas. | Baja |
| RNF-019 | Integración con sistemas de terceros (Eprac, Softland, Trade) mediante **adaptadores** que aíslen al núcleo del método real de intercambio (archivo, API o base de datos). | Alta |
| RNF-020 | Una falla o indisponibilidad temporal de un sistema externo no debe impedir la operación interna del Liquidador (degradación controlada, no caída en cascada). | Alta |
| RNF-021 | Soporte nativo de múltiples monedas, con reglas de redondeo configurables por país (ej. HALF_EVEN vs. truncado). | Alta |
| RNF-022 | La estructura de datos y reglas permite incorporar reglas fiscales o de formato de proforma específicas de un país sin modificar el núcleo de cálculo. | Media |
| RNF-023 | Toda creación/edición/eliminación de parámetros de negocio y toda liquidación queda registrada de forma **inmutable** (usuario, fecha, valor anterior/nuevo), sin edición retroactiva silenciosa. | Alta |
| RNF-024 | Conserva evidencia suficiente (bitácora, versiones de reglas usadas) para sustentar una auditoría externa o revisión de Finanzas sobre cualquier proforma ya emitida. | Media |

---

### 7. REGLAS DE NEGOCIO CONSOLIDADAS

- El mismo viaje se calcula con reglas distintas según el transportista sea
  propio (nómina fija + variable) u outsourcing (por flete), y según la
  empresa outsourcing específica.
- Cada casa aporta un porcentaje del flete calculado automáticamente a
  partir de volumen, monto y precio de la mercancía.
- El valor de las recolectas es configurable por país y empresa; no es un
  valor fijo en código.
- Toda deducción pregunta automático o manual antes de aplicarse.
- Ninguna novedad se liquida sin autorización registrada.
- Un cambio de tarifa nunca modifica una liquidación ya emitida (vigencias).
- La proforma consolida por empresa + día + ruta.

---

### 8. PUNTOS DE RIESGO A EVITAR EXPLÍCITAMENTE

- **Bifurcación propio/outsourcing como código duro** — es donde más fallan
  las implementaciones caseras. Debe ser una regla de datos, nunca un
  condicional que decida a mano si el resultado va a nómina o a cuentas por
  pagar.
- **Motor de reglas editable sin validación** — dar poder de edición al jefe
  de transporte exige validación de reglas, control de vigencias y auditoría
  (RF-011, RNF-013), o se corre el riesgo de tarifas mal formadas que rompan
  cálculos ya emitidos.
- **Novedades no trazadas** — recolecta, reenvío/cambio de ruta, factura
  movida, devolución reenviada como pedido nuevo, factura fuera de guía,
  "factura sin información". Ninguna puede liquidarse en silencio.
- **Dependencia rígida de terceros** — Eprac, Softland y Trade aún no tienen
  método de integración confirmado. Aísla con adaptadores para no bloquear
  el desarrollo del núcleo (RNF-019, RNF-020).

---

### 9. SUPUESTOS Y DECISIONES PENDIENTES — NO LAS RESUELVAS DE FORMA RÍGIDA

Deja estos puntos abiertos en el diseño (interfaces/hooks preparados, sin
hardcodear una respuesta):

- **Método de integración con Eprac, Softland y Trade** — pendiente de
  Sistemas. Usa adaptadores.
- **Componente variable del pago a chofer propio** — por detallar qué
  variables lo componen.
- **Reglas fiscales por país** — impuestos y formato de proforma pueden
  variar por país; deja el punto de extensión listo (RNF-022).
- **SLA de disponibilidad final** — por acordar con Infraestructura.

(Selección de tipo de vehículo ya está decidida: asistida, sistema sugiere,
usuario confirma — RF-016.)

---

### 10. GLOSARIO

- **Proforma**: documento no fiscal que informa a la empresa transportista
  el monto a facturar por los viajes liquidados en un período/ruta.
- **Liquidación**: cálculo final del monto a pagar a un transportista por un
  viaje, incluyendo deducciones.
- **Novedad**: evento anómalo en un viaje que bloquea su avance hasta ser
  resuelto.
- **Casa**: cliente mayorista/marca (Beval, Febeca, Sillaca) cuyo flete se
  reparte parcialmente entre las partes según reglas configurables.
- **Vigencia**: rango de fechas en que una tarifa o regla está activa; no
  afecta liquidaciones ya emitidas fuera de ese rango.

---

### 11. ARQUITECTURA SUGERIDA (ajústala si el proyecto existente ya usa otra
base razonable — pero conserva estos principios)

- **Núcleo de cálculo puro** (`kernel/` o equivalente): cero dependencias de
  UI, framework o red. Debe poder correr idéntico en cliente y servidor
  (RNF-012). Verificación de salud: ningún import de React, `fetch` ni del
  ORM dentro de esa carpeta.
- **Lenguaje de reglas como AST cerrado, no `eval()` ni fórmulas de texto
  libre interpretadas dinámicamente** — un conjunto fijo y auditable de
  operadores y condiciones, editable desde formularios guiados (RNF-016) y
  desde un editor libre controlado (RF-009).
- **Pipeline de cálculo por etapas explícitas** (por ejemplo: tarifa base →
  variable por transportista → porcentaje por casa → deducciones →
  ajustes/impuestos por país) donde el orden de etapas es código, pero los
  montos y condiciones son datos.
- **Resolución jerárquica/cascada** para evitar una matriz literal
  N×N de tarifas por combinación de país×empresa×ruta×vehículo: resolución
  por combinación exacta → por zona/grupo → fallback general, en ese orden.
- **Todo parámetro con vigencia desde/hasta**, nunca sobrescritura directa —
  una edición crea una nueva versión vigente, la anterior queda íntegra
  para liquidaciones ya emitidas (RF-006, RNF-013).
- **Bitácora de auditoría append-only** (nunca UPDATE/DELETE físico sobre
  el historial) para cumplir RF-012, RNF-023 y RNF-024.
- **Adaptadores** (`integrations/eprac`, `integrations/softland`,
  `integrations/trade`) detrás de una interfaz común, para aislar al núcleo
  del método real de intercambio con cada sistema externo (RNF-019,
  RNF-020).
- **RBAC explícito** en la capa de API/servicios, no solo en la UI (RNF-009,
  RNF-011).

---

### 12. STACK TECNOLÓGICO

Por defecto: **React 18 + TypeScript** en el frontend, **PostgreSQL** como
persistencia real (no localStorage — esta es una construcción para producción,
no un prototipo de demo), con una capa de API/backend que aplique RBAC y
persista la bitácora de auditoría. Si el proyecto ya iniciado usa un stack
distinto y razonable, respétalo y adapta estos principios a él en lugar de
migrar — dime en tu reporte de auditoría (sección 1) si detectas ese caso.

---

### 13. MODO DE TRABAJO

1. Entrega primero el reporte de auditoría de la sección 1 y el plan de
   etapas. Espera mi confirmación.
2. Construye por etapas (ej. datos maestros → motor de cálculo puro y sus
   pruebas → editor de reglas → novedades/deducciones → proforma y envío →
   auditoría/RBAC transversal). No intentes las 31 RF + 24 RNF de corrido.
3. Al cerrar cada etapa, dime explícitamente qué RF/RNF quedaron cubiertos
   por ID, y cuáles siguen pendientes.
4. Antes de dar por cerrada la construcción, verifica contra la sección 6
   (RNF) una por una — son fáciles de dar por sentadas y son las que más se
   evalúan en una revisión de arquitectura.

## ▲ FIN DEL PROMPT

---

## Notas de uso

- **Ejecútalo por etapas**, tal como pide la sección 13. Si dejas que la IA
  intente auditar y construir todo de corrido, la calidad de la auditoría
  inicial —que es la parte más importante— cae.
- **La verificación que más importa** una vez recibas el reporte de
  auditoría: confirma que identificó correctamente qué tan "cableada" está
  hoy la bifurcación propio/outsourcing en el código actual. Es el riesgo
  #1 señalado en la sección 8 del propio documento de requerimientos.
- Este prompt es autocontenido (no depende de que la IA de programación
  tenga acceso al Word original), pero si tu herramienta permite adjuntar
  archivos, puedes acompañarlo con
  `Requerimientos_Funcionales_NoFuncionales_Liquidador.md` para que tenga
  también las notas completas de cada RF/RNF que aquí se resumieron.
- Si en el camino se resuelve alguna de las decisiones pendientes de la
  sección 9 (ej. Sistemas confirma el método de integración con Eprac), 
  agrégalo como una instrucción adicional al final del prompt antes de
  volver a pegarlo, en vez de reabrir todo el documento.
