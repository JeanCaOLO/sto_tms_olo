**Collaborator:** aidlc-design-agent

## Contribution

Perspectiva de UX sobre el story map. El grano de las historias es correcto y
traza bien a FR1–FR14; mis aportes son de **experiencia/interacción faltante** y
de **coherencia con los mockups**.

### 1. Los mockups aprobados están desalineados con estas historias (bloqueante para diseño, NO para las historias)

`mockups.md` es de una iteración anterior y contradice el modelo v2 que estas
historias sí respetan. No pido cambiar stories.md por esto, pero el lead debe
**registrarlo como deuda de re-diseño** para que refined-mockups se re-corra, y
las historias no deben citar los mockups actuales como "ya aprobados":

- **Tiers vs. número invertido**: los mockups usan `priority_tier`
  (crítico/alto/medio/bajo) y badges de color. US10 define prioridad
  **numérica invertida**. La UI necesita representar un *número*, no 4 tiers.
- **Motor de Reglas**: los mockups traen "+ Nueva regla" + RuleBuilder
  (constructor). US16 dice explícito **"no puedo crear reglas nuevas"**
  (catálogo). El mockup contradice la historia.
- **Detalle**: mockup = panel lateral master-detail; US6 = **modal** (FR10.5).
- **Simulador**: mockup = split-screen "actual vs. simulada"; US19–US20 =
  **modal previo de configuración** + **resultado como tabla-Cola**.
- **Selector**: mockup = selector de **país**; US3/US4 = selector de
  **compañía** (el país va dentro del código de compañía, FR13.3).
- **"Sync al lago fallida"** aparece como alerta en el Panel del mockup; el lago
  fue **eliminado** (FR8). Debe desaparecer.

### 2. Historias de experiencia/interacción que faltan

- **Estados de pantalla (vacío/carga/parcial/error) como criterio transversal.**
  Ninguna historia de UI (US1, US6, US16, US20, US27, US28) exige el
  comportamiento de los 5 estados. Sugiero un AC de UX repetible: *"Given la
  vista sin datos / cargando / sin conexión al motor, Then muestra el estado
  vacío/skeleton/error correspondiente, nunca una tabla en blanco."* Es la regla
  6 de diseño ("diseñar para el peor caso") y ya estaba en los mockups.
- **US6 (modal de detalle) — foco y teclado.** Falta AC de accesibilidad: al
  abrir el modal el foco entra en él y queda atrapado (focus trap), `Esc`
  cierra, al cerrar el foco vuelve a la fila de origen. Sin esto el modal es
  inoperable por teclado (WCAG 2.1.2 / 2.4.3).
- **US14 (override) — prevención de error > mensaje de error.** El "motivo
  obligatorio" debe **deshabilitar** el botón Aplicar mientras esté vacío y
  mostrar el requisito *antes* de intentar guardar, no como alerta posterior. Y
  el nuevo valor de prioridad necesita validación de rango en el propio campo.
- **US5 (columnas) — descubribilidad y reset.** Elegir columnas necesita un
  punto de entrada visible (no un menú oculto) y una opción "restaurar por
  defecto"; hoy la historia solo cubre persistencia, no cómo se accede ni cómo
  se recupera si el usuario oculta columnas clave.
- **US19/US23 (simulador aplicar) — confirmación de acción de alto impacto.**
  "Aplicar" reemplaza la simulación aplicada de la compañía (US22): necesita un
  paso de confirmación explícito ("esto sustituye la priorización vigente de
  {compañía}"), patrón de confirmación para acción destructiva/irreversible.
- **US15/US32 (permisos) — feedback, no solo denegación.** "La acción se
  deniega" debe traducirse a UX: las acciones sin permiso se **ocultan o
  deshabilitan con tooltip**, no se ofrecen y luego rebotan. Menos frustración,
  menos clics muertos.
- **US3 (alternar compañía) — persistencia y contexto.** Falta AC: la compañía
  seleccionada se recuerda entre vistas/sesiones y es visible en todo momento
  (el usuario debe saber siempre "en qué compañía estoy" para no operar la
  equivocada — es aislamiento percibido, complementa US30).

### 3. Accesibilidad transversal (WCAG 2.1 AA — baseline, no opcional)

Sugiero una historia o AC transversal en E9/E1: navegación completa por teclado
en tabla y modales, badges/estado **no dependientes solo de color** (los tiers
del mockup fallan esto: añadir texto/ícono), contraste AA, y `aria-label` en los
controles de filtro/selector. Aplica a toda pantalla operativa.

### 4. Coherencia menor

- US20 dice "tabla igual que la Cola con selección de columnas": bien, reutiliza
  US5 — que la historia lo referencie explícitamente evita re-especificar.
- US26 (ventana configurable del % override): el control de ventana necesita ser
  un selector visible con valor por defecto (24 h), no un ajuste escondido.

## Positions

- AGREE: El grano y la trazabilidad de US1–US33 a FR1–FR14 — el mapa cubre los FR sin inventar alcance.
- AGREE: Modelar los 5 estados y los invariantes del motor (US7/US9) como historias/AC — refleja el modelo v2 correcto.
- OBJECT: Tratar los mockups actuales como "aprobados/coherentes" — contradicen el modelo v2 (tiers, RuleBuilder, lago, panel lateral, selector de país); refined-mockups debe re-correrse.
- OBJECT: Ausencia de AC de accesibilidad y de estados vacío/error en las historias de UI (US6, US14, US16, US20) — sin ellos las pantallas quedan inoperables por teclado y frágiles en el peor caso.
