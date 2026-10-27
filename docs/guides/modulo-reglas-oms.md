# Módulo de Reglas del OMS — Guía para el usuario

Esta guía explica, en lenguaje de negocio, **qué hace el Motor de Reglas del OMS,
cómo decide y qué puede configurar el usuario**. No es documentación técnica: si
querés el detalle de implementación, está en `backend/oms/src/` y en
`aidlc/spaces/default/memory/project.md` (sección `## Decided`).

> **Para quién es:** responsables del OMS, jefes de almacén, analistas de operación
> y cualquiera que necesite entender por qué un pedido salió antes que otro.

---

## 1. Qué hace el módulo, en una frase

> El OMS **prepara el pedido**: le calcula una **prioridad** y cambia su
> **estado/situación** para que el WMS lo empiece a alistar. **No crea el viaje**
> (eso lo hace Planificación) ni hace el picking (eso lo hace el WMS).

Dicho de otra forma: el OMS **lee** los pedidos que vienen del almacén (WMS/EFLOW),
les **aplica las reglas** para ordenarlos por urgencia, y los **marca como listos**
para que sigan su curso. Su trabajo termina en "alistado".

```
   Planificación corre        OMS: motor de reglas          WMS/EFLOW
   los pedidos                (esta guía)                   alista (picking)
┌────────────────────┐   ┌───────────────────────────┐   ┌──────────────────┐
│ deja los pedidos   │──▶│ 1. calcula la prioridad    │──▶│ situación = GENE │
│ listos para        │   │ 2. cambia estado/situación │   │ → genera picking │
│ priorizar          │   │    (prepara el pedido)     │   │                  │
└────────────────────┘   └───────────────────────────┘   └──────────────────┘
```

**Qué NO hace el OMS (límites de alcance):**

- No crea ni asigna el viaje — lo hace **Planificación**.
- No escribe fechas. Usa la **fecha de entrega** del cliente como criterio para
  decidir, pero **nunca la modifica**. No existe un campo "fecha de alisto".
- No hace picking, guía de carga ni ruteo de entrega — eso es del WMS y del TMS.

---

## 2. Las 5 macro-reglas

El motor está organizado en **cinco grandes reglas**. En la **primera entrega**
solo dos están activas; las demás quedan definidas pero apagadas o pendientes.

| # | Regla | Qué hace | Estado en la 1ª entrega |
|---|-------|----------|-------------------------|
| 1 | **Cálculo de fecha (Regla T-1)** | Mide la urgencia según cuánto falta para que el pedido tenga que estar listo. | ✅ Activa |
| 2 | **Análisis de observaciones** | Lee el texto libre de observaciones y detecta pedidos especiales (p. ej. "cliente retira"). | ✅ Activa (cliente retira) |
| 3 | **Cliente retira** | Subconjunto de la anterior: un pedido que el cliente recoge en bodega salta a **prioridad máxima**. | ✅ Activa |
| 4 | **Asignación de viaje / bajada** | Relaciona el pedido con su viaje. El viaje lo abre **Planificación**, no el OMS. | ⏸️ Diferida |
| 5 | **Inventario / capacidad** | Validaría existencias/capacidad antes de liberar (backorder). | 🔮 Futuro |

### Regla 1 — Cálculo de fecha (T-1)

Es la regla de urgencia por tiempo. La idea:

> **Listo = fecha de entrega − tiempo que tarda la ruta.**

- El OMS mira la **fecha de entrega** que pide el cliente.
- Le resta la **duración logística** del pedido (cuántos días antes hay que
  tenerlo listo). Esa duración la calcula Planificación según la distancia:
  GAM = 1 día antes (T-1), La Fortuna = 2 días (T-2), Guanacaste = 3 días (T-3).
- El resultado es la **fecha objetivo de alistado**. Si esa fecha ya pasó o es
  hoy → el pedido es **lo más urgente**. Cuanto más lejos esté → menos urgente.

**Caso Cofersa:** Cofersa a veces no envía la fecha de entrega real (la llena por
defecto). Cuando el OMS detecta esa fecha "de relleno", trata el pedido **como
casi urgente** para que alguien lo revise, en vez de hundirlo en la cola.

### Regla 2 y 3 — Observaciones y "cliente retira"

Las observaciones son **texto libre, sin formato fijo** (dirección, fecha, cita,
urgencia…). El motor las analiza para detectar situaciones especiales.

La **primera** salida implementada es **"cliente retira"**: si el pedido lo va a
recoger el propio cliente en bodega, salta a **prioridad máxima** y se libera de
inmediato (no hay viaje que esperar).

> **Nota sobre cómo se detecta:** la clasificación definitiva usará un **modelo de
> IA de Amazon Bedrock** (ultraligero, costo confirmado < $1 USD/mes para ~400
> registros/día). Mientras esa integración no esté conectada, el sistema usa una
> detección simple por palabras clave (p. ej. "cliente retira", "recoge en
> bodega", "pasa a buscar"). En la vista de reglas, además, "cliente retira" puede
> marcarse por **zona de entrega** mientras el análisis de texto con IA sigue
> diferido.

### Reglas 4 y 5 — Viaje/bajada e inventario (aún no activas)

- **Asignación de viaje/bajada:** el OMS **no** decide el viaje. Planificación lo
  asigna sobre los pedidos que el OMS dejó listos. El OMS solo **lee** el número de
  viaje y la fecha de salida que Planificación ya dejó anotados.
- **Inventario/capacidad:** validar existencias y capacidad antes de liberar.
  Queda para el futuro, cuando el negocio defina las reglas de backorder.

---

## 3. Cómo funciona la prioridad

La prioridad del OMS es **numérica**, y va al revés de lo que uno esperaría:

> **0 = máxima prioridad.** Después 1, 2, 3 … hasta n. **Menor número = más urgente.**

Esto es a propósito: el número tiene que coincidir con el del WMS, donde el 0 (o el
número más bajo) es lo que se trabaja primero.

- **La prioridad 0 es la que se está trabajando ahora mismo.**
- Los números se acomodan **a futuro**: se puede dejar hueco (por ejemplo asignar
  100 y que vaya corriendo) para insertar pedidos nuevos sin renumerar todo.

**Por compañía:**

| Compañía | Prioridades que usa |
|----------|---------------------|
| **Cofersa** | Rango completo: 0, 1, 2 … n (el OMS las **calcula**). |
| **EPA** | Solo 1 y 2 (EPA **ya trae** sus prioridades; el OMS **no las recalcula**, solo libera el pedido cuando toca). |

La prioridad se calcula según **cuánto tarda en prepararse** el pedido — es decir,
la Regla T-1 descrita arriba.

---

## 4. El score ponderado

Cuando hay varias reglas activas, el motor no elige una sola: **suma los aportes de
todas** para decidir la urgencia.

> Cada regla activa da unos **puntos** de urgencia. Cada regla tiene un **peso**
> configurable. El motor multiplica puntos × peso y **suma todo** → ese total es el
> **score**. Más score = más urgente = **menor número de prioridad**.

Ejemplo conceptual:

```
Regla de fecha:    90 puntos x peso 600   -+
Observaciones:      0 puntos x peso 1      |--> score total --> prioridad numerica
Cliente retira:   (si aplica, salta directo a prioridad maxima) -+
```

El caso **"cliente retira" es especial**: no compite por score, **cortocircuita** a
la prioridad más alta configurada.

> El score ponderado **entra desde la primera entrega** — no es algo que se
> pospuso. Es la forma en que el motor combina las reglas.

---

## 5. Automático vs. manual

> El cálculo de prioridad es **100 % automático**. **No hay ningún paso de
> aprobación humana** antes del alistamiento.

Esto es una decisión firme: un paso de aprobación detendría el flujo automático.
Documentos antiguos que mencionaban una "aprobación del jefe de almacén" están
**desactualizados** y no aplican.

**La única intervención humana permitida** es el **override de prioridad**: el rol
**Responsable del OMS** puede cambiar manualmente la prioridad de **un pedido
puntual**. Todo lo demás lo decide el motor.

Cada priorización queda registrada en la **Auditoría** con una marca de si fue
**automática o manual**, para poder revisar después qué pasó y por qué.

---

## 6. Configuración: la vista "Motor de Reglas"

La pantalla **Motor de Reglas** es un **catálogo semi-configurable**, **no** un
constructor de reglas. Esto es importante:

> La **lógica** de cada regla vive en el **código** (las reglas son complejas y
> específicas por compañía). Desde la pantalla **no se crean reglas nuevas ni se
> cambia su lógica**: solo se ajustan sus parámetros.

Lo que **sí** se puede hacer desde la vista, por cada regla y **por compañía**:

- **Activar / desactivar** la regla (on/off).
- Ajustar su **peso / score** (cuánto pesa en la suma).
- Editar sus **parámetros**: por ejemplo el T-1, las horas de corte, el umbral de
  cliente retira, los barridos por día.

La compañía (Cofersa, EPA…) es un **filtro/selector dentro de la vista**: en un
mismo perfil se ven varias compañías. **No** hay un perfil separado por compañía.
El filtro de almacén se mantiene.

> **Dato útil:** en la vista, que una regla aparezca "activa" indica que **ya tiene
> lógica construida** en el motor; el switch, el peso y los parámetros son de
> referencia en la maqueta actual (todavía no persisten contra la base).

---

## 7. Barrido y liberación (ADR-013)

El OMS **no manda el pedido al WMS en cuanto lo prioriza**. Separa dos cosas que
antes iban juntas:

| Pasada | Qué hace | Qué deja el pedido |
|--------|----------|--------------------|
| **Priorizar** | Calcula prioridad y score. | Lo deja en situación **DISP** (disponible). Todavía **no** avisa al WMS. |
| **Liberar** | Avisa al WMS para que empiece a alistar. | Cambia la situación a **GENE** (generada) → el WMS genera el picking. |

**¿Cuándo se libera?** Un día antes de la salida del viaje. En concreto:

> Se libera cuando **hoy ≥ fecha de salida del viaje − días de preparación**
> (por defecto 1 día de preparación de picking).

- Como todos los pedidos de un mismo viaje comparten la fecha de salida, **se
  liberan juntos** (liberación "por viaje", gratis).
- **Cliente retira** se libera **de inmediato** (el cliente recoge en bodega; no
  hay viaje que esperar).

**El barrido** es el proceso automático que recorre la cola haciendo estas dos
pasadas. En la versión inicial corre **5 veces al día** (la frecuencia y la hora de
corte por compañía quedan como ajuste futuro).

**Acción manual "Procesar a Eflow":** un usuario con permiso puede **adelantar** la
liberación de los pedidos de un viaje sin esperar la ventana (útil cuando el
almacén está ocioso y puede alistar antes).

**Diferencia EPA vs. Cofersa en el barrido:**

- **Cofersa** se **prioriza y se libera** (el OMS calcula su prioridad).
- **EPA solo se libera**, **no se prioriza** (EPA ya trae su prioridad; el OMS no
  la toca, solo la libera cuando toca por fecha).

---

## 8. Resumen del recorrido de un pedido

```
1. Planificación corre los pedidos  ──►  entran a la cola del OMS
2. El motor aplica las reglas (fecha + observaciones)  ──►  calcula score
3. El score se convierte en prioridad numérica (0 = máxima)
   · si es "cliente retira" ──► prioridad máxima directa
   · EPA ──► conserva su prioridad de origen (no se recalcula)
4. El pedido queda PRIORIZADO (situación DISP), esperando su ventana
5. Un día antes de la salida del viaje ──► se LIBERA (situación GENE)
   · "cliente retira" ──► se libera de inmediato
6. El WMS ve GENE y arranca el picking.  Fin del alcance del OMS.
```

---

## Pendientes y supuestos

Lo que **todavía no está cerrado** o definido (marcado como tal, sin inventar):

- **Análisis de observaciones con IA (Bedrock):** definido y con costo confirmado,
  pero **aún no integrado**. Mientras tanto se usa detección por palabras clave /
  por zona de entrega.
- **Regla de inventario / capacidad (backorder):** es **futuro**; falta que el
  negocio defina sus condiciones.
- **Asignación de viaje/bajada como regla del OMS:** diferida — el viaje lo asigna
  Planificación.
- **Catálogo de reglas editable que persista:** la vista hoy es una maqueta; los
  cambios de switch/peso/parámetros todavía **no se guardan** contra la base.
- **Frecuencia y hora de corte del barrido por compañía:** hoy fijo en 5×/día;
  parametrizable a futuro.

---

### Fuentes

- Motor de reglas (backend): `backend/oms/src/` — en especial `motor_reglas.py`,
  `score.py`, `regla_fecha.py`, `analizador_observaciones.py`, `handoff_pedidos.py`,
  `app.py`, `cola_candidatos.py`.
- Vista "Motor de Reglas" y Cola (frontend): `src/pages/oms/reglas/` y
  `src/pages/oms/cola/`; motor MVP en `src/pages/oms/engine/priorityEngine.ts`.
- Decisiones de negocio: `aidlc/spaces/default/memory/project.md` (sección
  `## Decided`), incluido **ADR-013** (desacople priorización↔liberación).
