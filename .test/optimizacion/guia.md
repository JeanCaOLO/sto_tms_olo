# Mejorar uso claude

1. **¿El modelo es el correcto?** Tareas simples con Sonnet o Haiku, no Opus
2. **¿El CLAUDE.md está compacto?** Si supera 150 líneas estás perdiendo tiempo
3. **¿Hacen falta todos los MCP servers?** Apaga los irrelevantes
4. **¿Va a haber más de una tarea?** Si sí, `/clear` entre medias. /compact cada fase
5. **¿Hay que leer muchos archivos?** Usa subagente, protege la sesión principal
6. **¿La salida de comandos es grande?** Fíltrala antes de mostrársela al agente
7. **¿Cambiaste modelo/effort?** Si lo hiciste, asume el re-prefill completo del siguiente turno

# Guía Definitiva: Metodología para Trabajar con Claude Code de Forma Óptima y Ahorrativa

## Conclusión Anticipada

La optimización de costos en Claude Code tiene un hecho central contraintuitivo: **el costo más caro no está en lo que escribes en el prompt, sino en el prefijo implícito que no ves**. El system prompt, las definiciones de herramientas, el CLAUDE.md y el historial de conversación —todo eso se re-cobra en cada turno— es el verdadero "asesino de tokens".

Esta guía integra tus dos documentos, el reporte de `/doctor`, el blog oficial de Anthropic y herramientas del ecosistema actual, construyendo una metodología de tres capas: **configuración → hábitos → automatización**. Objetivo central: **reducir el consumo de tokens entre 60-90% sin sacrificar calidad de código.**

## Capa 1: Conciencia del Caché — La Base de Toda Optimización

### Concepto

Prompt Caching es el mecanismo implícito de Claude Code: si el inicio de una solicitud (el prefijo) coincide exactamente con una solicitud reciente del servidor, este reutiliza el estado computacional y solo pre-rellena lo nuevo.

### ¿Por qué es la primera prioridad?

Cada turno de conversación se compone de: **system prompt + definiciones de herramientas + CLAUDE.md + historial + tu mensaje**. Los primeros cuatro se reenvían **completos en cada turno**. Sin caché, un historial de 50k tokens se factura completo cada vez. Con caché, esa parte se lee a **0.1x del precio**.

**El costo de romper el caché**: cualquier operación que cambie el prefijo invalida todo. El siguiente turno re-factura el historial completo a precio full.

### Cómo Aplicarlo

**Operaciones prohibidas a mitad de sesión**:

| Operación | Impacto | Alternativa |
| --- | --- | --- |
| `/model` cambio de modelo | Cada modelo tiene caché independiente, todo se invalida | Decidir el modelo **al inicio** |
| `/effort` cambio | El effort es parte de la clave de caché | Decidir antes de empezar |
| Activar Fast mode | Añade header que cambia la clave | Activar al inicio |
| Conectar/desconectar MCP | Las definiciones de tools están en el prefijo | Usar tool search (deferred por defecto) |

**Insight de diseño oficial**: El Plan Mode de Claude Code mantiene deliberadamente todas las herramientas en la solicitud sin cambios, usando solo las tools `EnterPlanMode`/`ExitPlanMode` para cambiar comportamiento. Esto es para no romper el caché.

**Métrica de validación**: Objetivo cache read rate > 75%. Visible en `/cost` o en el dashboard Enterprise.

## Capa 2: Minimización de Configuración Estática — Cubrir el 80% de los Escenarios

### 2.1 settings.json Global: Valores por Defecto de Modelo y Pensamiento

#### Concepto

`~/.claude/settings.json` es **la palanca de configuración única por máquina que beneficia a todos los proyectos**.

#### ¿Por qué?

Usar Opus + 31,999 tokens de pensamiento por defecto significa que pagas precio flagship por el 80% de tareas rutinarias. Sonnet resuelve la mayoría de tareas de código a ~60% menos costo.

#### Cómo Aplicarlo

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

| Configuración | Default | Recomendado | Razón |
| --- | --- | --- | --- |
| `model` | opus | **sonnet** | Cubre 80% de escenarios, ~60% menos costo |
| `MAX_THINKING_TOKENS` | 31999 | **10000** | El pensamiento es output facturado. Bajar a 10k reduce ~70% del costo oculto. Tareas simples pueden usar `0` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | hereda el principal | **haiku** | Subagentes para explorar/leer. Haiku es suficiente, ~80% más barato |

**Cuándo subir a Opus**: Solo en arquitectura compleja, razonamiento multipaso o debug sutil. Usar `/model opus` temporalmente. **Ojo**: cambiar modelo resetea el caché.

**Atajo para alternar pensamiento**: `Alt+T` (Windows/Linux) o `Option+T` (macOS). `Ctrl+O` muestra la salida del pensamiento.

### 2.2 CLAUDE.md: De "Enciclopedia" a "Índice"

#### Concepto

CLAUDE.md se carga **en cada sesión, en cada solicitud**, al prefijo. Es la parte **más controlable y de mayor impacto** del costo estático.

#### ¿Por qué?

Tu reporte de `/doctor` revela un caso típico: CLAUDE.md original consumía ~4,136 tokens/sesión, incluyendo:

- Descripción de estructura de directorios (Claude puede hacer `ls`)
- Descripción **factualmente incorrecta** de settings (peor que nada)
- Prosa explicativa sin directivas operativas

Comprimido a ~1,270 tokens, **ahorra ~2,900 tokens por sesión**.

#### Cómo Aplicarlo

**Debe incluir** (< 150 líneas):

- Comandos exactos de build/test/lint
- Convenciones del proyecto (ej. "errores siempre como `Result<T>`")
- **Trampas no derivables** (ej. "bun necesita PATH no-interactivo")
- Restricciones duras (ej. "tests no escriben en DB de producción")

**No debe incluir**:

- Documentación completa de API (Claude lee el código)
- Árbol de directorios
- Duplicación de `.gitignore`
- Reglas ideales que el equipo no cumple

**Patrón Progressive Disclosure**: CLAUDE.md de 75-100 líneas solo con reglas transversales; referencias detalladas en `~/.claude/agent_docs/`. Lo referenciado con `@agent_docs/file.md` se carga **siempre**; lo listado solo por ruta sin `@` se carga **bajo demanda**.

**Avanzado — Caveman Compress**: Un plugin reescribe CLAUDE.md a formato comprimido, preservando semántica pero reduciendo ~45% tokens, con backup legible.

### 2.3 MCP y Herramientas: Menos es Más

#### Concepto

Cada MCP Server habilitado mete sus definiciones de herramientas al prefijo del system prompt, **facturado en cada turno**.

#### ¿Por qué?

Tu `/doctor` muestra: 4 servidores AWS MCP con `CONNECTION_CLOSED` pero aún habilitados. Aunque el deferred loading no rompe el caché cuando está soportado, **un Server muerto no aporta nada, solo costo potencial**.

#### Cómo Aplicarlo

**Principio**: Si hay CLI, usar CLI; no MCP.

- `gh` → GitHub MCP
- `aws` → AWS MCP
- Solo MCP cuando se necesite interacción estructurada con API que el CLI no cubra

**Ver estado y costo**:

```bash
/mcp
```

**Limitar output**:

```
MAX_MCP_OUTPUT_TOKENS=10000
```

## Capa 3: Hábitos de Sesión — El Efecto Compuesto Diario

### 3.1 Una Tarea, Una Sesión

#### Concepto

Una tarea = una sesión. Al cambiar de tarea, `/clear`.

#### ¿Por qué?

Contexto más largo = mayor riesgo de "zona tonta" (dumb zone), calidad de razonamiento cae. Un estudio de Chroma (2025) sobre 18 modelos encontró caídas medibles de precisión conforme crecían las conversaciones. 40 mensajes cubriendo tres features = más lento, menos preciso y más caro que tres sesiones independientes.

#### Cómo Aplicarlo

- Terminar feature → commit → `/clear` → siguiente
- **Excepción**: si las tareas están íntimamente relacionadas (mismo módulo, cambios consecutivos), usar `/compact` para retener resumen de decisiones

### 3.2 Momento Correcto de /compact

#### Concepto

`/compact` comprime el historial a un resumen estructurado.

#### ¿Por qué?

Es el "soft reset" intra-sesión. Usarlo bien retiene información clave reduciendo drásticamente tokens de historial.

#### Cómo Aplicarlo

**Cuándo usar**:

- Al terminar exploración, antes de implementar
- Al completar un hito
- Al terminar debugging, antes de nuevo trabajo
- Cuando el contexto va a cambiar de dominio

**Cuándo NO usar**:

- A mitad de implementación (pierde detalles)
- Durante debugging activo
- En refactorización multiarchivo en curso

**Clave**: `/compact` y `/clear` **resetean el caché**. Usarlos en puntos de corte naturales.

### 3.3 Prompt Preciso: Evitar "Deriva de Investigación"

#### Concepto

Un prompt vago hace que Claude lea archivos innecesarios y explore caminos irrelevantes, cada paso con costo de tokens.

#### ¿Por qué?

Cada archivo leído se añade al historial, **re-facturado cada turno**.

#### Cómo Aplicarlo

| Vago | Preciso |
| --- | --- |
| "arregla el bug" | "arregla el null reference en `checkout.ts` cuando el carrito está vacío" |
| "añade tests" | "añade tests para `UserService.create`: input válido, email duplicado, campos faltantes" |
| "hazlo más rápido" | "optimiza la query `getProducts` — tiene N+1 en tabla categories" |

**Patrón de Prompt Estructurado**:

```
[CONTEXTO]: Implementar función de descuento.
[REGLA]:
1. Escribe test `tests/discount.test.ts` cubriendo "cupón expirado"
2. Ejecuta `npm test` y muestra el fallo
3. NO escribas implementación hasta que confirme el fallo
```

### 3.4 Filtrado de Output de Herramientas

#### Concepto

Cada output de comando entra al contexto y se repite en todos los turnos siguientes.

#### ¿Por qué?

`npm test` con 500 líneas vs `npm test --silent --reporter=dot` con 5 líneas: la diferencia se compone en cada turno.

#### Cómo Aplicarlo

```bash
# Ruidoso
npm install
# Silencioso
npm install --silent --no-audit

# Ruidoso
npm test
# Solo fallos
npm test --silent -- --reporter=dot
```

**Herramienta avanzada**: Headroom (open source) comprime outputs hasta 92%, usando compresores AST-aware para código.

## Capa 4: Herramientas Innovadoras y Automatización

### 4.1 Caveman Mode: Compresión Extrema del Output

#### Concepto

Plugin de Claude Code que hace que Claude responda texto en "lenguaje de cavernícola" pero mantiene el código completamente normal.

#### ¿Por qué?

Los tokens de output también cuestan. Las cortesías de Claude —"Con gusto te ayudo a resolver"— no aportan valor. Caveman mide **65% de reducción en tokens de output**.

#### Ejemplo

**Normal** (~46 tokens):

> "He identificado el problema. Parece estar en el middleware de autenticación, donde la función de validación de token no verifica correctamente el timestamp de expiración. Voy a corregir esto añadiendo la condición faltante."
> 

**Caveman** (~18 tokens):

> "Yo encontrar bug. Check token en middleware auth no mira tiempo expira. Yo arreglar ahora."
> 

#### Cómo Aplicarlo

```bash
# Instalar
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman

# Activar
/caveman do

# Modos
/caveman lite    # quita relleno, mantiene gramática
/caveman full    # default, quita artículos
/caveman ultra   # compresión máxima
```

**Válvula de seguridad**: Advertencias de seguridad y confirmaciones de operaciones irreversibles vuelven automáticamente a lenguaje normal.

### 4.2 Enrutamiento Automático de Modelos: Subswitch / CCR

#### Concepto

Capa proxy entre Claude Code y la API de Anthropic que elige modelo según **contenido de la solicitud**.

#### ¿Por qué?

No todas las tareas necesitan Sonnet/Opus:

- Lectura/exploración de archivos → Haiku
- Búsqueda/resumen de código → Haiku
- Análisis de arquitectura → Sonnet/Opus

Cambiar modelo manualmente rompe el caché. La capa proxy puede enrutar a **nivel de solicitud**, sin que Claude Code perciba el cambio.

#### Cómo Aplicarlo

**Subswitch** (enfoque Claude Code → Codex):

```json
// .claude/settings.local.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "<http://127.0.0.1:4141>"
  }
}
```

**Claude Code Router** (solución más madura):

- Regla: `request.body.model` contiene "haiku" → enrutar a modelo de bajo costo
- O según keywords en `messages`

**Riesgo**: La capa proxy es punto de fallo adicional. Evaluar si vale la complejidad.

### 4.3 Subagentes Anidados: Verificación Aislada

#### Concepto

Un agente coordinador lanza múltiples subagentes, cada uno en contexto independiente, que solo devuelven resúmenes.

#### ¿Por qué?

El contexto del agente principal es **el más caro**. Delegar logs, outputs de tests y exploración de código a ventanas aisladas, devolviendo solo conclusiones, reduce drásticamente el consumo del principal.

#### Caso Real: Triaje Automático de Tests Fallidos

```
[Coordinador] Lanza subagente test-runner
[test-runner] Corre suite → 148 tests, 2 fallan
[test-runner] Lanza subagente failure-analyst con nombres y outputs
[failure-analyst] Contexto limpio, forma 2-3 teorías, lee código bajo prueba, devuelve:
  - Diagnóstico raíz
  - Confianza
  - Teorías descartadas
[test-runner] Reporta arriba: FAIL + diagnóstico
[Coordinador] Decide estrategia de fix
```

**Regla clave**: El coordinador **nunca edita código**, solo arbitra decisiones basadas en evidencia. Máximo 2 rondas de fix, luego escala a humano.

#### Cómo Aplicarlo

Definir roles en `.claude/agents/`:

```markdown
<!-- .claude/agents/test-runner.md -->
---
name: test-runner
description: Corre suite de tests, lanza triaje si falla
model: haiku
tools: Bash, Read, Task
---
Corres tests. Reportas comando, exit code, pass/fail count.
Si hay fallos, lanzas subagente failure-analyst con nombres y outputs.
No arreglas nada.
```

**Advertencia**: Los subagentes corren conversaciones paralelas y **drenan límites rápido**. Úsalos solo cuando la complejidad lo justifique.

### 4.4 Validación Estructurada: TDD Anti-Cheating

#### Concepto

Forzar aislamiento por **fronteras del sistema de archivos** entre "quien escribe tests" y "quien escribe implementación", no confiar en prompt.

#### ¿Por qué?

El LLM que escribe tests después de la implementación ajusta las aserciones a su propio código. Es defecto estructural, no de prompt.

#### Cómo Aplicarlo

| Rol | Permisos | Prohibido |
| --- | --- | --- |
| Reviewer (coordinador) | Coordina, revisa | No escribe código |
| Tester | Crea/modifica archivos de test | **No puede tocar implementación** |
| Coder | Crea/modifica implementación | **No puede tocar tests** |

**Flujo**: Reviewer → lanza Tester para escribir test fallido → revisa commit (test debe fallar) → lanza Coder para implementar → corre tests → verde pasa, rojo vuelve al Coder (máx 2 rondas).

## Capa 5: Monitoreo e Iteración

### 5.1 /doctor: Chequeo Periódico

#### Concepto

Herramienta de salud integrada en Claude Code: analiza configuración, extensiones, versión, estado del caché.

#### ¿Por qué?

Tu reporte de `/doctor` descubrió: instalación duplicada (1.09 GB desperdiciados), 4 MCP Servers muertos, CLAUDE.md redundante, drift de versión. Nada de esto es **perceptible en uso diario**.

#### Cómo Aplicarlo

- **Ejecutar semanalmente** `/doctor`
- Aplicar todas las recomendaciones "recommended"
- Para ítems con "evidencia delgada" (ej. 3 días de historial), marcar y observar una semana antes de actuar

### 5.2 Métricas Clave

| Métrica | Objetivo | Cómo medir |
| --- | --- | --- |
| Cache Read Rate | **> 75%** | `/cost` o dashboard Enterprise |
| Tokens por Sesión | Descenso sostenido | `ccusage` (CLI open source) |
| First-Time Pass Rate | **> 70%** | Ratio de código que pasa linter/tests a la primera |
| Rework Rate | **< 20%** | % de código IA modificado manualmente en 48h |

### 5.3 Cuándo Resetear

**Two-Prompt Rule**: Si la primera corrección no resuelve, no sigas corrigiendo. Ya tienes contexto contaminado con dos intentos fallidos y la interpretación original errónea.

**Correcto**: `/clear` → escribir un **mejor prompt único** con lo aprendido.

**Contraintuitivo pero efectivo**: contexto limpio + buen prompt > contexto contaminado + tres correcciones.

## Checklist Final

Antes de cualquier sesión, confirmar:

1. **Modelo**: Sonnet por defecto (`settings.json`), Opus solo si necesario
2. **MAX_THINKING_TOKENS**: 10000 (tareas simples pueden 0)
3. **SUBAGENT_MODEL**: haiku
4. **CLAUDE.md**: < 150 líneas, sin redundancia, commiteado
5. **MCP Servers**: < 10, los muertos deshabilitados
6. **Inicio de sesión**: modelo/effort/Fast mode decididos, sin cambios a mitad
7. **Cambio de tarea**: `/clear`, sin acumular
8. **Output de herramientas**: modo silencioso preferido
9. **TDD**: test falla primero, implementación después
10. **Caveman** (opcional): `/caveman full` para comprimir output

## Guía Paso a Paso: De Cero a Optimizado

### Paso 1: Instalación y Verificación (5 minutos)

```bash
claude --version
claude doctor
```

### Paso 2: Configuración Global (10 minutos)

Editar `~/.claude/settings.json`:

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  },
  "permissions": { "defaultMode": "auto" }
}
```

### Paso 3: Inicialización de Proyecto (una vez por proyecto, 5 minutos)

```bash
cd proyecto
claude
/init  # genera borrador de CLAUDE.md
# revisar, podar, commitear
```

### Paso 4: Instalar Caveman (opcional, 2 minutos)

```bash
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

### Paso 5: Verificar Salud del Caché

```bash
/cost     # ver cache read tokens
/context  # ver llenado del contexto
```

### Paso 6: Solidificar Hábitos Diarios

- Una tarea, una sesión
- Prompt preciso (ruta de archivo + comportamiento específico)
- Output silencioso de herramientas
- Explorar → Plan → Code → Verify
- `/doctor` semanal

**Insight central**: La mayor ganancia en optimización de tokens viene de **evitar desperdicio**, no de "ahorrar". Protección de caché, poda de CLAUDE.md, limpieza de MCP, una tarea una sesión —estas operaciones de "no hacer" son más efectivas que cualquier "hacer" complejo.

# Guía para configurar RTK y maximizar el uso de Claude Code

## Conclusión

RTK (Rust Token Killer) es un proxy CLI que comprime la salida de comandos antes de que llegue a Claude, reduciendo el consumo de tokens entre un **60% y 90%**. La forma óptima de integrarlo con Claude Code es mediante un **hook PreToolUse** que reescribe comandos automáticamente, garantizando una adopción del **100%** frente al 60-70% que se logra con instrucciones en CLAUDE.md.

## Paso 1: Instalar RTK

Elige el método según tu sistema:

**Homebrew (recomendado en macOS/Linux):**

```bash
brew install rtk
```

**Script de instalación rápida:**

```bash
curl -fsSL <https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh> | sh
```

**Cargo:**

```bash
cargo install --git <https://github.com/rtk-ai/rtk>
```

**Verificar la instalación correcta:**

```bash
rtk --version   # Debe mostrar "rtk 0.24.0" o superior
rtk gain        # Debe mostrar estadísticas de ahorro
```

> **Advertencia crítica**: Existen dos paquetes llamados “rtk”. Si `rtk --version` funciona pero `rtk gain` devuelve “command not found”, instalaste el paquete incorrecto (Rust Type Kit en lugar de Rust Token Killer). Desinstala con `cargo uninstall rtk` y reinstala desde el repositorio correcto.
> 

## Paso 2: Inicializar RTK para Claude Code

Ejecuta la inicialización global:

```bash
rtk init --global
```

**Lo que hace este comando por defecto**:

| Acción | Archivo | Propósito |
| --- | --- | --- |
| Crea script hook | `~/.claude/hooks/rtk-rewrite.sh` | Intercepta y reescribe comandos Bash |
| Crea documentación ligera | `~/.claude/RTK.md` | Solo 10 líneas, referencia de meta-comandos |
| Añade referencia | `~/.claude/CLAUDE.md` | Inserta `@RTK.md` |
| Registra hook | `~/.claude/settings.json` | Añade entrada en `PreToolUse` |

Durante la inicialización, RTK preguntará si deseas modificar `settings.json`. Escribe `y` para confirmar. RTK creará una copia de seguridad en `~/.claude/settings.json.bak` antes de hacer cambios.

**Opciones útiles:**

```bash
rtk init --global --auto-patch    # Modifica settings.json sin preguntar
rtk init --global --dry-run       # Previsualiza cambios sin escribir nada
rtk init --global --show          # Muestra configuración actual
```

## Paso 3: Reiniciar Claude Code (obligatorio)

El hook **solo se activa después de reiniciar**. Cierra Claude Code por completo y vuelve a abrirlo.

**Verificar que todo está correcto:**

```bash
rtk init --show
```

Salida esperada:

```
✅ Hook: ~/.claude/hooks/rtk-rewrite.sh (executable, with guards)
✅ RTK.md: ~/.claude/RTK.md (slim mode)
✅ Integrity: hook hash verified
✅ Global (~/.claude/CLAUDE.md): @RTK.md reference
✅ settings.json: RTK hook configured
```

## Paso 4: Optimización avanzada

### 4.1 Activar modo ultra-compact

Edita `~/.claude/hooks/rtk-rewrite.sh` y asegúrate de que el comando de reescritura incluya el flag `-u`:

```bash
REWRITTEN=$(rtk rewrite --ultra-compact "$CMD" 2>/dev/null)
```

Este flag genera salida aún más densa para comandos como `git diff` y `cargo test`.

### 4.2 Ajustar límites de RTK

Edita el archivo de configuración (`~/.config/rtk/config.toml` en Linux o `~/Library/Application Support/rtk/config.toml` en macOS):

```toml
[limits]
grep_max_results = 100
grep_max_per_file = 10
status_max_files = 10
status_max_untracked = 5
passthrough_max_chars = 1500
```

### 4.3 Usar modelo económico para subagentes

Añade a `~/.bashrc` o `~/.zshrc`:

```bash
export CLAUDE_CODE_SUBAGENT_MODEL="sonnet"
```

Los subagentes se usan para exploración, grep y lectura de archivos. Usar Sonnet en lugar de Opus reduce costos entre **40% y 60%**.

## Paso 5: Verificar el ahorro de tokens

Después de ejecutar varios comandos en Claude Code:

```bash
rtk gain
```

Salida típica:

```
📊 RTK Token Savings
Total commands : 12
Input tokens   : 45,230
Output tokens  : 4,890
Saved          : 40,340  (89.2%)
```

Si ejecutas `git status` en Claude Code y ves una salida extremadamente compacta, el hook está funcionando: el comando fue reescrito transparentemente a `rtk git status`.

## Consideraciones importantes

**Comportamiento ante comandos desconocidos**: RTK no modifica comandos que no reconoce; simplemente los ejecuta sin filtrar y registra el uso.

**Windows nativo**: El hook requiere shell Unix. En Windows nativo, `rtk init -g` recae automáticamente en modo de instrucciones (sin hook). Para soporte completo de hook, usa **WSL**.

**Seguridad**: RTK nunca modifica tus comandos ni archivos. Solo filtra la salida, preserva códigos de salida y funciona completamente en local, sin acceso a red.

**Alcance del hook**: El hook solo intercepta la herramienta **Bash**. Las herramientas nativas Read, Grep y Glob no pasan por él. Para máximo ahorro, orienta a Claude hacia equivalentes de shell como `cat`, `rg` o `find`.